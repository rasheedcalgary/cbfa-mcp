/**
 * Tool: analyze_build_log
 *
 * Fetches and analyses build logs from Bitrise (iOS) or Jenkins (Android).
 * The provider is auto-detected from the URL — no need to specify it manually.
 *
 * Bitrise flow:
 *   GET /apps/{app-slug}/builds/{build-slug}/log
 *   → archived builds: download from expiring S3 presigned URL
 *   → live builds:     concatenate log_chunks
 *
 * Jenkins flow:
 *   GET {build-url}/consoleText   → raw plain-text log
 *   GET {build-url}/api/json      → build metadata (result, duration, etc.)
 *
 * After fetching, 25+ error patterns are applied (Xcode, Gradle, code-sign,
 * linker, ITMS upload, CocoaPods, dependency, signing, step failures…).
 * Matches are returned with line numbers and configurable context lines.
 *
 * Auth required:
 *   Bitrise  → BITRISE_TOKEN + BITRISE_APP_SLUG
 *   Jenkins  → JENKINS_URL + JENKINS_USER + JENKINS_API_KEY
 *
 * Example prompts:
 *   - "Why did this Bitrise build fail? https://app.bitrise.io/build/abc123"
 *   - "Analyse the Jenkins build https://jenkins.example.com/job/CBFA-Android/42/"
 *   - "What went wrong with build dcf6c9e0-c54b-41c0-8996-a7641ee2d48b?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import axios from "axios";
import { validateBitriseAuth, validateJenkinsAuth } from "../../auth/validator.js";
import { getBitriseClient } from "../../clients/bitrise.js";
import { getJenkinsClient } from "../../clients/jenkins.js";
import { config } from "../../config.js";

// ─── Error pattern definitions ────────────────────────────────────────────────

interface ErrorPattern {
  label:    string;
  regex:    RegExp;
  severity: "error" | "warning" | "info";
  platform: "both" | "ios" | "android";
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // ── Shared ─────────────────────────────────────────────────────────────────
  { label: "Build failed",           regex: /\*\* BUILD FAILED \*\*/i,                          severity: "error",   platform: "both" },
  { label: "Exit code non-zero",     regex: /exit code: [^0\s]/,                                severity: "error",   platform: "both" },
  { label: "Timeout",                regex: /timed? ?out/i,                                     severity: "warning", platform: "both" },

  // ── iOS / Xcode ─────────────────────────────────────────────────────────────
  { label: "Xcode compile error",    regex: /^.*\berror:(?! note:)/m,                           severity: "error",   platform: "ios" },
  { label: "Fatal compile error",    regex: /fatal error:/i,                                    severity: "error",   platform: "ios" },
  { label: "Linker error",           regex: /ld: (error|warning):/i,                            severity: "error",   platform: "ios" },
  { label: "Undefined symbol",       regex: /undefined symbol/i,                                severity: "error",   platform: "ios" },
  { label: "Duplicate symbol",       regex: /duplicate symbol/i,                                severity: "error",   platform: "ios" },
  { label: "Code sign error",        regex: /Code Sign error/i,                                 severity: "error",   platform: "ios" },
  { label: "Signing error",          regex: /Signing Error/i,                                   severity: "error",   platform: "ios" },
  { label: "No signing identity",    regex: /no signing identity|no local code signing/i,       severity: "error",   platform: "ios" },
  { label: "No profile for team",    regex: /No profile for team/i,                             severity: "error",   platform: "ios" },
  { label: "Cert expired",           regex: /certificate.*expired|expired.*certificate/i,       severity: "error",   platform: "ios" },
  { label: "Provisioning profile",   regex: /provisioning profile/i,                            severity: "warning", platform: "ios" },
  { label: "Entitlements error",     regex: /entitlements/i,                                    severity: "warning", platform: "ios" },
  { label: "App Store upload error", regex: /ERROR ITMS/i,                                      severity: "error",   platform: "ios" },
  { label: "Upload forbidden",       regex: /The API key in use does not allow this request/i,  severity: "error",   platform: "ios" },
  { label: "iTunes Connect error",   regex: /ITSAppUsesNonExemptEncryption/i,                   severity: "warning", platform: "ios" },
  { label: "Missing export options", regex: /ExportOptions/i,                                   severity: "warning", platform: "ios" },
  { label: "CocoaPods error",        regex: /pod install.*failed|cocoapods.*error/i,            severity: "error",   platform: "ios" },
  { label: "Bitrise step failed",    regex: /\| FAILED \|/i,                                   severity: "error",   platform: "ios" },
  { label: "Bitrise step error",     regex: /^\[!\]/m,                                         severity: "error",   platform: "ios" },

  // ── Android / Gradle ────────────────────────────────────────────────────────
  { label: "Gradle build failed",    regex: /BUILD FAILED/,                                     severity: "error",   platform: "android" },
  { label: "Gradle task failed",     regex: /Execution failed for task/i,                       severity: "error",   platform: "android" },
  { label: "Gradle task FAILED",     regex: /> Task .+FAILED/,                                  severity: "error",   platform: "android" },
  { label: "Gradle failure",         regex: /^FAILURE:/m,                                       severity: "error",   platform: "android" },
  { label: "Java exception",         regex: /Exception in thread|java\.lang\.\w+Exception/,     severity: "error",   platform: "android" },
  { label: "Kotlin compile error",   regex: /error: [A-Z].*\.kt:/i,                             severity: "error",   platform: "android" },
  { label: "Dependency not found",   regex: /Could not resolve|Could not find.*\.gradle/i,      severity: "error",   platform: "android" },
  { label: "Dependency error",       regex: /> Could not find/i,                                severity: "error",   platform: "android" },
  { label: "Signing config error",   regex: /signing|keystore|storeFile|storePassword/i,        severity: "warning", platform: "android" },
  { label: "APK install failed",     regex: /INSTALL_FAILED/i,                                  severity: "error",   platform: "android" },
  { label: "Non-zero exit",          regex: /Process .+ finished with non-zero exit value/i,    severity: "error",   platform: "android" },
  { label: "OOM / heap error",       regex: /OutOfMemoryError|java heap space/i,                severity: "error",   platform: "android" },
  { label: "Lint error",             regex: /\d+ error(s)? found/i,                             severity: "error",   platform: "android" },
  { label: "Google Play upload err", regex: /apkUploadException|Upload.*failed/i,               severity: "error",   platform: "android" },
  { label: "Jenkins step failed",    regex: /^\[ERROR\]/m,                                      severity: "error",   platform: "android" },
  { label: "Jenkins abort/failure",  regex: /Finished: (FAILURE|ABORTED)/i,                     severity: "error",   platform: "android" },
];

// ─── Bitrise API types ────────────────────────────────────────────────────────

interface BitriseLogResponse {
  expiring_raw_log_url:     string | null;
  generated_log_chunks_num: number;
  is_archived:              boolean;
  log_chunks: Array<{ chunk: string; position: number }> | null;
  timestamp:  string | null;
}

interface JenkinsBuildInfo {
  result:            string | null;  // SUCCESS | FAILURE | ABORTED | null (running)
  duration:          number;         // ms
  estimatedDuration: number;         // ms
  timestamp:         number;         // epoch ms
  displayName:       string;
  fullDisplayName:   string;
  url:               string;
  building:          boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Provider = "bitrise" | "jenkins";

/** Infer provider from URL. Bitrise URLs contain app.bitrise.io. */
function detectProvider(url: string): Provider {
  return url.includes("app.bitrise.io") ? "bitrise" : "jenkins";
}

/** Parse UUID-style or hex build slug from a Bitrise URL. */
function parseBuildSlug(input: string): string {
  const match = input.match(/\/build\/([a-f0-9-]+)/i);
  return match ? match[1] : input.trim();
}

/**
 * Convert a full Jenkins build URL to a path relative to JENKINS_URL.
 * e.g. https://jenkins.example.com/job/CBFA-Android/42/ → /job/CBFA-Android/42/
 */
function jenkinsRelativePath(buildUrl: string): string {
  const base = (config.jenkinsUrl ?? "").replace(/\/$/, "");
  if (base && buildUrl.startsWith(base)) {
    return buildUrl.slice(base.length);
  }
  // Fallback: strip scheme + host
  const match = buildUrl.match(/^https?:\/\/[^/]+(\/.*)/);
  return match ? match[1] : buildUrl;
}

interface MatchedLine {
  lineNo:   number;
  label:    string;
  severity: ErrorPattern["severity"];
  text:     string;
}

/** Scan log text for known error patterns. */
function extractErrors(logText: string, platform: "ios" | "android" | "both"): MatchedLine[] {
  const lines  = logText.split("\n");
  const seen   = new Set<string>();
  const matches: MatchedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.platform !== "both" && pattern.platform !== platform && platform !== "both") continue;
      if (pattern.regex.test(line)) {
        const key = `${pattern.label}:${line.trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            lineNo:   i + 1,
            label:    pattern.label,
            severity: pattern.severity,
            text:     line.trim().slice(0, 300),
          });
        }
        break;
      }
    }
  }

  matches.sort((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });
  return matches;
}

function fmtDuration(ms: number): string {
  if (!ms) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerAnalyzeBuildLog(server: McpServer): void {
  server.tool(
    "analyze_build_log",
    "Fetch and analyse a Bitrise (iOS) or Jenkins (Android) build log. Provider is auto-detected from the URL. Extracts errors, code-sign issues, Gradle failures, and failed steps with line numbers and context.",
    {
      build_id: z
        .string()
        .describe(
          "Build URL or slug. Bitrise: https://app.bitrise.io/build/{slug} or just the slug. " +
          "Jenkins: full build URL e.g. https://jenkins.example.com/job/CBFA-Android/42/"
        ),
      provider: z
        .enum(["auto", "bitrise", "jenkins"])
        .default("auto")
        .describe("CI provider. 'auto' detects from URL (default). Override if needed."),
      include_warnings: z
        .boolean()
        .default(true)
        .describe("Include warning-level matches alongside errors. Default: true."),
      context_lines: z
        .number()
        .int()
        .min(0)
        .max(10)
        .default(2)
        .describe("Lines of context above/below each match. Default: 2."),
    },
    async ({ build_id, provider: providerHint, include_warnings, context_lines }) => {

      const provider: Provider =
        providerHint === "auto" ? detectProvider(build_id) : providerHint;

      // ── Dispatch to the right fetcher ─────────────────────────────────────
      let logText    = "";
      let metaLines: string[] = [];

      if (provider === "bitrise") {
        // ── Bitrise ────────────────────────────────────────────────────────
        validateBitriseAuth();
        if (!config.bitriseAppSlug) {
          throw new McpError(ErrorCode.InternalError,
            "Server configuration error — BITRISE_APP_SLUG is not configured.");
        }

        const buildSlug = parseBuildSlug(build_id);
        const client    = getBitriseClient();
        const appSlug   = config.bitriseAppSlug;

        let logMeta: BitriseLogResponse;
        try {
          const { data } = await client.get<BitriseLogResponse>(
            `/apps/${appSlug}/builds/${buildSlug}/log`
          );
          logMeta = data;
        } catch (err: unknown) {
          if (err instanceof McpError) throw err;
          throw new McpError(ErrorCode.InternalError,
            `Bitrise API error fetching log: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (logMeta.is_archived && logMeta.expiring_raw_log_url) {
          const { data } = await axios.get<string>(logMeta.expiring_raw_log_url,
            { responseType: "text", timeout: 30_000 });
          logText = data;
        } else if (logMeta.log_chunks?.length) {
          logText = logMeta.log_chunks
            .slice().sort((a, b) => a.position - b.position)
            .map((c) => c.chunk).join("");
        } else {
          return { content: [{ type: "text" as const, text:
            `ℹ️  No log content available yet for Bitrise build: ${buildSlug}\n` +
            `The build may still be initialising. Try again in a few seconds.`
          }]};
        }

        metaLines = [
          `Provider:   Bitrise`,
          `Build slug: ${buildSlug}`,
          `Build URL:  https://app.bitrise.io/build/${buildSlug}`,
        ];

      } else {
        // ── Jenkins ────────────────────────────────────────────────────────
        validateJenkinsAuth();
        const client   = getJenkinsClient();
        const relPath  = jenkinsRelativePath(build_id).replace(/\/$/, "");

        // Fetch build metadata
        let buildInfo: JenkinsBuildInfo | null = null;
        try {
          const { data } = await client.get<JenkinsBuildInfo>(`${relPath}/api/json`);
          buildInfo = data;
        } catch {
          // metadata is best-effort — log fetch is the critical part
        }

        // Fetch console log as plain text
        try {
          const { data } = await client.get<string>(`${relPath}/consoleText`, {
            headers: { Accept: "text/plain" },
            responseType: "text",
            timeout: 60_000,
          });
          logText = data;
        } catch (err: unknown) {
          if (err instanceof McpError) throw err;
          throw new McpError(ErrorCode.InternalError,
            `Jenkins API error fetching console log: ${err instanceof Error ? err.message : String(err)}`);
        }

        const result  = buildInfo?.building ? "In progress" : (buildInfo?.result ?? "Unknown");
        const dur     = buildInfo ? fmtDuration(buildInfo.duration) : "—";

        metaLines = [
          `Provider:   Jenkins`,
          `Job:        ${buildInfo?.fullDisplayName ?? relPath}`,
          `Result:     ${result}`,
          `Duration:   ${dur}`,
          `Build URL:  ${buildInfo?.url ?? build_id}`,
        ];
      }

      // ── Extract errors ─────────────────────────────────────────────────────
      const platform: "ios" | "android" | "both" =
        provider === "bitrise" ? "ios" : provider === "jenkins" ? "android" : "both";

      const allMatches = extractErrors(logText, platform);
      const filtered   = include_warnings
        ? allMatches
        : allMatches.filter((m) => m.severity === "error");

      const logLines   = logText.split("\n");
      const totalLines = logLines.length;

      if (filtered.length === 0) {
        return { content: [{ type: "text" as const, text: [
          `✅ No errors or warnings found in build log`,
          ...metaLines,
          `Log lines scanned: ${totalLines.toLocaleString()}`,
        ].join("\n") }]};
      }

      const errors   = filtered.filter((m) => m.severity === "error");
      const warnings = filtered.filter((m) => m.severity === "warning");

      const header = [
        `Build Log Analysis`,
        `${"═".repeat(64)}`,
        ...metaLines,
        `Log lines scanned: ${totalLines.toLocaleString()}`,
        `Errors found:      ${errors.length}`,
        `Warnings found:    ${warnings.length}`,
        "",
      ];

      const sections: string[] = [];
      for (const match of filtered) {
        const icon = match.severity === "error" ? "❌" : "⚠️ ";
        sections.push(`${icon} [${match.label}] — line ${match.lineNo}`);

        if (context_lines > 0) {
          const start = Math.max(0, match.lineNo - 1 - context_lines);
          const end   = Math.min(totalLines - 1, match.lineNo - 1 + context_lines);
          for (let i = start; i <= end; i++) {
            const prefix = i === match.lineNo - 1 ? "  ▶ " : "    ";
            sections.push(`${prefix}${logLines[i]?.trim().slice(0, 200) ?? ""}`);
          }
        } else {
          sections.push(`  ▶ ${match.text}`);
        }
        sections.push("");
      }

      return {
        content: [{ type: "text" as const, text: [...header, ...sections].join("\n") }],
      };
    }
  );
}
