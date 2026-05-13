/**
 * Tool: analyze_circleci_build
 *
 * Debugs a failed CircleCI build for Glofox custom branded apps.
 * The user provides any CircleCI URL for the glofoxinc/standalone-app-builder
 * project and this tool:
 *
 *   1. Parses the URL to extract pipeline number, workflow ID, or job number.
 *   2. Walks the CircleCI API tree (pipeline → workflow → jobs) to find
 *      all failed jobs.
 *   3. Fetches the full step output for each failed job via the v1.1 API.
 *   4. Applies 30+ error patterns (Node, React Native, Android, iOS, Docker,
 *      shell script, dependency, test) to surface the root cause.
 *   5. Returns a structured failure report with line numbers, context, and
 *      a plain-English summary.
 *
 * Supported URL shapes:
 *   • https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/{n}
 *   • https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/{n}/workflows/{uuid}
 *   • https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/{n}/workflows/{uuid}/jobs/{n2}
 *   • https://circleci.com/gh/glofoxinc/standalone-app-builder/{n}  (legacy)
 *
 * Auth required: CIRCLE_CI_TOKEN (server .env, operator-supplied)
 *
 * Example prompts:
 *   - "Why did this Glofox CircleCI build fail? https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/1234"
 *   - "Check this CircleCI workflow: https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/1234/workflows/abc-def"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import axios from "axios";
import { validateCircleCiAuth } from "../../auth/validator.js";
import { getCircleCiV2Client, getCircleCiV1Client } from "../../clients/circleci.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ORG      = "glofoxinc";
const REPO     = "standalone-app-builder";
const VCS      = "github";
const SLUG     = `${VCS}/${ORG}/${REPO}`;
const MAX_LOG_CHARS = 120_000; // truncate very long logs before pattern matching

// ─── URL parser ───────────────────────────────────────────────────────────────

interface ParsedUrl {
  pipelineNum?: number;
  workflowId?:  string;
  jobNum?:      number;
}

function parseCircleCiUrl(raw: string): ParsedUrl {
  const clean = raw.trim();

  // Modern app.circleci.com shape
  // /pipelines/github/glofoxinc/standalone-app-builder/123/workflows/uuid/jobs/456
  const modern = /\/pipelines\/[^/]+\/[^/]+\/[^/]+\/(\d+)(?:\/workflows\/([0-9a-f-]+)(?:\/jobs\/(\d+))?)?/i.exec(clean);
  if (modern) {
    return {
      pipelineNum: parseInt(modern[1], 10),
      workflowId:  modern[2],
      jobNum:      modern[3] ? parseInt(modern[3], 10) : undefined,
    };
  }

  // Legacy circleci.com/gh/org/repo/build_num
  const legacy = /circleci\.com\/gh\/[^/]+\/[^/]+\/(\d+)/i.exec(clean);
  if (legacy) {
    return { jobNum: parseInt(legacy[1], 10) };
  }

  throw new McpError(
    ErrorCode.InvalidRequest,
    [
      "Could not parse the CircleCI URL.",
      "Expected a URL like:",
      "  https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/1234",
      "  https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/1234/workflows/<uuid>",
      "  https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/1234/workflows/<uuid>/jobs/456",
    ].join("\n")
  );
}

// ─── CircleCI API types ───────────────────────────────────────────────────────

interface CciPipeline {
  id:     string;
  number: number;
  state:  string;
  trigger: { type: string; actor?: { login?: string } };
  vcs?:   { branch?: string; commit?: { subject?: string; body?: string; hash?: string } };
  created_at: string;
}

interface CciWorkflow {
  id:         string;
  name:       string;
  status:     string;
  created_at: string;
  stopped_at: string | null;
  pipeline_id: string;
  pipeline_number: number;
}

interface CciJob {
  id:          string;
  name:        string;
  status:      string;
  job_number:  number | null;
  type:        string;
  started_at:  string | null;
  stopped_at:  string | null;
  dependencies: string[];
}

interface CciV1Step {
  name:    string;
  actions: Array<{
    index:       number;
    step:        number;
    name:        string;
    status:      string;
    exit_code:   number | null;
    bash_command?: string | null;
    output_url?: string | null;
    has_output:  boolean;
    run_time_millis?: number;
  }>;
}

interface CciV1Build {
  build_num:   number;
  status:      string;
  outcome:     string | null;
  branch:      string;
  subject:     string;
  author_name: string;
  start_time:  string;
  stop_time:   string | null;
  steps:       CciV1Step[];
}

interface CciOutputChunk {
  message: string;
  type:    string;
  time:    string;
}

// ─── Error patterns ───────────────────────────────────────────────────────────

interface ErrorPattern {
  label:    string;
  regex:    RegExp;
  severity: "error" | "warning" | "info";
  category: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // ── General ──────────────────────────────────────────────────────────────
  { label: "Exit code non-zero",       regex: /exited? with (code|status) [^0\s]/i,        severity: "error",   category: "shell" },
  { label: "Command failed",           regex: /command failed|task failed|step failed/i,   severity: "error",   category: "shell" },
  { label: "Error (generic)",          regex: /^\s*error:/im,                              severity: "error",   category: "general" },
  { label: "Fatal error",              regex: /fatal:?\s+error/i,                          severity: "error",   category: "general" },
  { label: "Timeout",                  regex: /timed? ?out|deadline exceeded/i,            severity: "warning", category: "infra" },
  { label: "Out of memory",            regex: /out of memory|heap space|oom killer/i,      severity: "error",   category: "infra" },
  { label: "Disk full",                regex: /no space left on device/i,                  severity: "error",   category: "infra" },

  // ── Node.js / npm / yarn ──────────────────────────────────────────────────
  { label: "npm install error",        regex: /npm (ERR!|error)/i,                         severity: "error",   category: "node" },
  { label: "yarn error",               regex: /yarn (error|ERR!)/i,                        severity: "error",   category: "node" },
  { label: "Module not found",         regex: /cannot find module|module not found/i,      severity: "error",   category: "node" },
  { label: "Node syntax error",        regex: /SyntaxError:/,                              severity: "error",   category: "node" },
  { label: "Unhandled promise",        regex: /UnhandledPromiseRejection/i,                severity: "error",   category: "node" },
  { label: "Type error",               regex: /TypeError:/,                                severity: "error",   category: "node" },

  // ── React Native ─────────────────────────────────────────────────────────
  { label: "Metro bundler error",      regex: /metro.*error|bundling failed/i,             severity: "error",   category: "react-native" },
  { label: "Gradle build failure",     regex: /FAILURE: Build failed|gradle.*error/i,      severity: "error",   category: "android" },
  { label: "Gradle task error",        regex: /> Task :.*FAILED/,                          severity: "error",   category: "android" },
  { label: "Android lint error",       regex: /\[ERROR\].*android|android.*\[ERROR\]/i,   severity: "error",   category: "android" },

  // ── iOS / Xcode ───────────────────────────────────────────────────────────
  { label: "Xcode compile error",      regex: /\*\* BUILD FAILED \*\*/,                   severity: "error",   category: "ios" },
  { label: "Code sign error",          regex: /code sign error|signing identity/i,         severity: "error",   category: "ios" },
  { label: "Provisioning profile",     regex: /provisioning profile/i,                    severity: "warning", category: "ios" },

  // ── Docker ───────────────────────────────────────────────────────────────
  { label: "Docker pull failure",      regex: /error pulling image|pull access denied/i,  severity: "error",   category: "docker" },
  { label: "Docker build failure",     regex: /failed to build|dockerfile.*error/i,        severity: "error",   category: "docker" },

  // ── Tests ─────────────────────────────────────────────────────────────────
  { label: "Test failure",             regex: /tests? (failed|failing)|FAILED \d+ test/i, severity: "error",   category: "test" },
  { label: "Jest failure",             regex: /jest.*failed|● .* ●/,                       severity: "error",   category: "test" },
  { label: "Test suite failed",        regex: /Test Suites:.*\d+ failed/,                  severity: "error",   category: "test" },

  // ── Dependency / network ──────────────────────────────────────────────────
  { label: "Network error",            regex: /ECONNREFUSED|ETIMEDOUT|network error/i,     severity: "error",   category: "network" },
  { label: "404 dependency",           regex: /404 not found.*package|package.*404/i,      severity: "error",   category: "deps" },
  { label: "Peer dependency conflict", regex: /peer dep.*conflict|conflicting peer dep/i,  severity: "warning", category: "deps" },
  { label: "Version mismatch",         regex: /version mismatch|incompatible version/i,    severity: "warning", category: "deps" },

  // ── Fastlane / CI scripts ─────────────────────────────────────────────────
  { label: "Fastlane error",           regex: /fastlane (error|failed|exception)/i,        severity: "error",   category: "fastlane" },
  { label: "Ruby error",               regex: /RubyGems|Gemfile|bundler.*error/i,          severity: "error",   category: "fastlane" },
  { label: "Script exit non-zero",     regex: /exit status \d+[^0]|exit code: [^0\s]/i,   severity: "error",   category: "shell" },
];

// ─── Log analysis ─────────────────────────────────────────────────────────────

interface Finding {
  label:       string;
  severity:    "error" | "warning" | "info";
  category:    string;
  lineNumber:  number;
  line:        string;
  context:     string[];
}

function analyzeLog(log: string, contextLines = 3): Finding[] {
  const lines = log.split("\n");
  const findings: Finding[] = [];
  const seen = new Set<string>(); // deduplicate identical lines

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of ERROR_PATTERNS) {
      if (!p.regex.test(line)) continue;
      const key = `${p.label}::${line.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const start   = Math.max(0, i - contextLines);
      const end     = Math.min(lines.length - 1, i + contextLines);
      const context = lines.slice(start, end + 1).map((l, idx) => {
        const lineNo = start + idx + 1;
        const marker = lineNo === i + 1 ? ">>>" : "   ";
        return `${marker} ${lineNo.toString().padStart(5)}: ${l}`;
      });

      findings.push({ label: p.label, severity: p.severity, category: p.category, lineNumber: i + 1, line: line.trim(), context });
    }
  }

  return findings;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function getPipelineById(pipelineId: string): Promise<CciPipeline> {
  const v2 = getCircleCiV2Client();
  const { data } = await v2.get<CciPipeline>(`/pipeline/${pipelineId}`);
  return data;
}

async function getPipelineByNumber(pipelineNum: number): Promise<CciPipeline> {
  const v2 = getCircleCiV2Client();
  const { data } = await v2.get<CciPipeline>(`/project/${SLUG}/pipeline/${pipelineNum}`);
  return data;
}

async function getWorkflowsForPipeline(pipelineId: string): Promise<CciWorkflow[]> {
  const v2 = getCircleCiV2Client();
  const { data } = await v2.get<{ items: CciWorkflow[] }>(`/pipeline/${pipelineId}/workflow`);
  return data.items ?? [];
}

async function getWorkflowById(workflowId: string): Promise<CciWorkflow> {
  const v2 = getCircleCiV2Client();
  const { data } = await v2.get<CciWorkflow>(`/workflow/${workflowId}`);
  return data;
}

async function getJobsForWorkflow(workflowId: string): Promise<CciJob[]> {
  const v2 = getCircleCiV2Client();
  const { data } = await v2.get<{ items: CciJob[] }>(`/workflow/${workflowId}/job`);
  return data.items ?? [];
}

/** Fetches all step output for a given job build number via v1.1 API. */
async function fetchJobLog(jobNum: number): Promise<string> {
  const v1 = getCircleCiV1Client();

  // First fetch job metadata to get steps
  const { data: build } = await v1.get<CciV1Build>(`/project/${SLUG}/${jobNum}`);
  const chunks: string[] = [];

  for (const step of build.steps ?? []) {
    for (const action of step.actions ?? []) {
      if (!action.has_output) continue;

      // Fetch output for this step/action index
      let output: CciOutputChunk[] = [];
      try {
        const stepRes = await v1.get<CciOutputChunk[]>(
          `/project/${SLUG}/${jobNum}/output/${action.step}/${action.index}`
        );
        output = stepRes.data ?? [];
      } catch {
        // Some actions have no retrievable output — skip
        continue;
      }

      const stepLog = output.map((c) => c.message).join("");
      if (stepLog.trim()) {
        chunks.push(`\n=== STEP: ${step.name} / ${action.name} (exit ${action.exit_code ?? "?"}) ===\n`);
        chunks.push(stepLog);
      }
    }
  }

  const full = chunks.join("");
  return full.length > MAX_LOG_CHARS ? full.slice(full.length - MAX_LOG_CHARS) : full;
}

/** Fetches build info for a legacy build number and returns status + log. */
async function fetchLegacyBuildInfo(jobNum: number): Promise<{ build: CciV1Build; log: string }> {
  const v1 = getCircleCiV1Client();
  const { data: build } = await v1.get<CciV1Build>(`/project/${SLUG}/${jobNum}`);
  const log = await fetchJobLog(jobNum);
  return { build, log };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerAnalyzeCircleCiBuild(server: McpServer): void {
  server.tool(
    "analyze_circleci_build",
    [
      "Debug a failed CircleCI build for Glofox custom branded apps.",
      "Provide any CircleCI URL from the glofoxinc/standalone-app-builder project.",
      "The tool fetches pipeline → workflow → job metadata, downloads the full step logs,",
      "applies 30+ error-pattern rules, and returns a plain-English failure summary",
      "with the exact error lines and surrounding context.",
      "Use this when a Glofox CBA build fails and you need to know why.",
    ].join(" "),
    {
      build_url: z
        .string()
        .describe(
          "Full CircleCI URL. Supported shapes: " +
          "pipeline URL (.../pipelines/github/glofoxinc/standalone-app-builder/{n}), " +
          "workflow URL (add /workflows/{uuid}), " +
          "job URL (add /jobs/{n}), " +
          "or legacy https://circleci.com/gh/glofoxinc/standalone-app-builder/{n}."
        ),
      context_lines: z
        .number()
        .int()
        .min(0)
        .max(10)
        .default(3)
        .describe("Lines of log context to include around each error match (0–10). Default: 3."),
    },
    async ({ build_url, context_lines }) => {
      validateCircleCiAuth();

      // ── 1. Parse URL ──────────────────────────────────────────────────────
      const parsed = parseCircleCiUrl(build_url);

      const lines: string[] = [];
      const push  = (...args: string[]) => lines.push(...args);

      push("# CircleCI Build Analysis — Glofox Custom Branded Apps");
      push(`**URL:** ${build_url}`);
      push("");

      // ── 2. Resolve pipeline / workflow / job(s) ───────────────────────────

      let pipeline:  CciPipeline  | undefined;
      let workflows: CciWorkflow[]           = [];
      let failedWorkflows: CciWorkflow[]     = [];
      let targetWorkflow: CciWorkflow | undefined;
      let jobsToAnalyze: Array<{ job: CciJob; log: string }> = [];

      // --- Case A: direct job URL (most specific) ---
      if (parsed.jobNum !== undefined && parsed.workflowId === undefined && parsed.pipelineNum === undefined) {
        // Legacy circleci.com/gh/... URL — build number is a v1.1 job number
        push("## Build Info (Legacy URL)");
        const { build, log } = await fetchLegacyBuildInfo(parsed.jobNum);
        push(`**Branch:** ${build.branch}`);
        push(`**Commit:** ${build.subject}`);
        push(`**Author:** ${build.author_name}`);
        push(`**Status:** ${build.status}${build.outcome ? ` / ${build.outcome}` : ""}`);
        push(`**Started:** ${build.start_time}`);
        push(`**Stopped:** ${build.stop_time ?? "still running"}`);
        push("");

        const findings = analyzeLog(log, context_lines);
        push(...renderFindings(findings, log));
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      // --- Fetch pipeline ---
      if (parsed.pipelineNum !== undefined) {
        pipeline = await getPipelineByNumber(parsed.pipelineNum);
        workflows = await getWorkflowsForPipeline(pipeline.id);
        failedWorkflows = workflows.filter((w) => w.status === "failed" || w.status === "error");
      }

      // --- Case B: specific workflow URL ---
      if (parsed.workflowId) {
        targetWorkflow = await getWorkflowById(parsed.workflowId);
        if (!workflows.length && pipeline === undefined) {
          // Only workflow ID given — no pipeline context
          pipeline = await getPipelineByNumber(targetWorkflow.pipeline_number);
        }
        failedWorkflows = [targetWorkflow];
      }

      // ── 3. Print pipeline summary ─────────────────────────────────────────
      if (pipeline) {
        const vcs = pipeline.vcs ?? {};
        push("## Pipeline Summary");
        push(`**Pipeline #:** ${pipeline.number}`);
        push(`**Branch:**     ${vcs.branch ?? "unknown"}`);
        push(`**Commit:**     ${vcs.commit?.hash?.slice(0, 8) ?? "unknown"} — ${vcs.commit?.subject ?? ""}`);
        push(`**Triggered:**  ${pipeline.trigger?.type ?? "unknown"} by ${pipeline.trigger?.actor?.login ?? "unknown"}`);
        push(`**Created:**    ${pipeline.created_at}`);
        push("");

        if (workflows.length) {
          push("### Workflows");
          for (const wf of workflows) {
            const icon = wf.status === "success" ? "✅" : wf.status === "failed" ? "❌" : "⚠️";
            push(`- ${icon} **${wf.name}** — ${wf.status} (${wf.id})`);
          }
          push("");
        }
      }

      // ── 4. If specific job URL in a modern workflow URL ───────────────────
      if (parsed.workflowId && parsed.jobNum !== undefined) {
        // The jobNum in a modern URL is a CircleCI job number (same as v1.1 build num)
        push("## Job Analysis");
        let log: string;
        try {
          log = await fetchJobLog(parsed.jobNum);
        } catch (e) {
          push(`> Could not fetch log for job #${parsed.jobNum}: ${String(e)}`);
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        }
        const findings = analyzeLog(log, context_lines);
        push(...renderFindings(findings, log));
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      // ── 5. Walk failed workflows → jobs ───────────────────────────────────
      if (failedWorkflows.length === 0 && workflows.length > 0) {
        push("> No failed workflows found in this pipeline — all workflows passed or are still running.");
        push("");
        push("### Workflow statuses:");
        for (const wf of workflows) {
          push(`- **${wf.name}**: ${wf.status}`);
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      if (failedWorkflows.length === 0) {
        push("> No workflows found. The pipeline may still be queued, or the build URL may not match glofoxinc/standalone-app-builder.");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      // Analyse up to 3 failed workflows to cap response size
      for (const wf of failedWorkflows.slice(0, 3)) {
        push(`## Workflow: ${wf.name} ❌`);
        push(`**Workflow ID:** ${wf.id}`);
        push(`**Status:**      ${wf.status}`);
        push(`**Started:**     ${wf.created_at}`);
        push(`**Stopped:**     ${wf.stopped_at ?? "still running"}`);
        push("");

        const jobs = await getJobsForWorkflow(wf.id);
        const failedJobs = jobs.filter((j) => j.status === "failed" || j.status === "infrastructure_fail");

        push("### Jobs");
        for (const j of jobs) {
          const icon = j.status === "success" ? "✅" : j.status === "failed" ? "❌" : j.status === "infrastructure_fail" ? "🔥" : "⏭️";
          push(`- ${icon} **${j.name}** — ${j.status}${j.job_number ? ` (#${j.job_number})` : ""}`);
        }
        push("");

        for (const job of failedJobs.slice(0, 2)) {
          if (job.job_number === null) {
            push(`### ❌ Job: ${job.name}`);
            push("> No job number available — this job may have been cancelled or never started.");
            push("");
            continue;
          }

          push(`### ❌ Job: ${job.name} (#${job.job_number})`);
          push(`**Started:** ${job.started_at ?? "not started"}`);
          push(`**Stopped:** ${job.stopped_at ?? "still running"}`);
          push("");

          let log: string;
          try {
            log = await fetchJobLog(job.job_number);
          } catch (err) {
            push(`> Could not retrieve log: ${String(err)}`);
            push("");
            continue;
          }

          jobsToAnalyze.push({ job, log });
          const findings = analyzeLog(log, context_lines);
          push(...renderFindings(findings, log));
        }
      }

      // ── 6. Top-level summary ──────────────────────────────────────────────
      if (jobsToAnalyze.length > 0) {
        push("---");
        push("## Root Cause Summary");
        const allFindings: Finding[] = jobsToAnalyze.flatMap(({ log }) => analyzeLog(log, 0));
        const errors   = allFindings.filter((f) => f.severity === "error");
        const warnings = allFindings.filter((f) => f.severity === "warning");

        const categories = [...new Set(errors.map((f) => f.category))];
        if (categories.length > 0) {
          push(`**Primary failure categories:** ${categories.join(", ")}`);
          push("");
        }

        if (errors.length === 0 && warnings.length === 0) {
          push(
            "> No specific error patterns matched. The build may have failed due to an infrastructure issue, " +
            "a flaky test, or an error type not yet in the pattern library. " +
            "Review the raw log sections above for clues."
          );
        } else {
          push(`**Errors found:** ${errors.length}  |  **Warnings found:** ${warnings.length}`);
          push("");
          if (errors.length > 0) {
            push("**Top errors:**");
            const topErrors = errors.slice(0, 5);
            for (const e of topErrors) {
              push(`- [${e.category.toUpperCase()}] **${e.label}** (line ${e.lineNumber}): \`${e.line.slice(0, 120)}\``);
            }
          }
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

function renderFindings(findings: Finding[], _log: string): string[] {
  const out: string[] = [];

  const errors   = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  if (findings.length === 0) {
    out.push(
      "> No error patterns matched in this job's log. " +
      "The failure may be due to an infrastructure issue or an unrecognised error pattern."
    );
    out.push("");
    return out;
  }

  if (errors.length > 0) {
    out.push(`#### 🔴 Errors (${errors.length})`);
    for (const f of errors) {
      out.push("");
      out.push(`**[${f.category.toUpperCase()}] ${f.label}** — line ${f.lineNumber}`);
      out.push("```");
      out.push(...f.context);
      out.push("```");
    }
    out.push("");
  }

  if (warnings.length > 0) {
    out.push(`#### 🟡 Warnings (${warnings.length})`);
    for (const f of warnings) {
      out.push("");
      out.push(`**[${f.category.toUpperCase()}] ${f.label}** — line ${f.lineNumber}`);
      out.push("```");
      out.push(...f.context);
      out.push("```");
    }
    out.push("");
  }

  return out;
}
