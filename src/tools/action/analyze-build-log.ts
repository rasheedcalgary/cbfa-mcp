/**
 * Tool: analyze_build_log
 *
 * Fetches the raw Bitrise build log and extracts error/warning sections so
 * the AI agent can diagnose failures without manually reading thousands of lines.
 *
 * Flow:
 *   1. Accept a build slug or full Bitrise build URL.
 *   2. Call GET /apps/{app-slug}/builds/{build-slug}/log
 *      → If archived:  download the full log from expiring_raw_log_url (S3 presigned URL)
 *      → If live/chunked: concatenate log_chunks
 *   3. Extract lines matching known error patterns (errors, code-sign issues,
 *      failed steps, provisioning failures, linker errors, etc.)
 *   4. Return a structured error report with line numbers and context.
 *
 * Auth required: BITRISE_TOKEN + BITRISE_APP_SLUG (server .env)
 *
 * Example prompts:
 *   - "Analyse the build log for https://app.bitrise.io/build/abc123"
 *   - "Why did build abc123 fail?"
 *   - "Check the errors in my latest Bitrise build"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import axios from "axios";
import { validateBitriseAuth } from "../../auth/validator.js";
import { getBitriseClient } from "../../clients/bitrise.js";
import { config } from "../../config.js";

// ─── Error pattern definitions ────────────────────────────────────────────────

interface ErrorPattern {
  label: string;
  regex: RegExp;
  severity: "error" | "warning" | "info";
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Xcode build failures
  { label: "Build failed",           regex: /\*\* BUILD FAILED \*\*/i,                           severity: "error" },
  { label: "Xcode error",            regex: /^.*error:(?! note:)/m,                              severity: "error" },
  { label: "Linker error",           regex: /ld: (error|warning):/i,                             severity: "error" },
  { label: "Undefined symbol",       regex: /undefined symbol/i,                                 severity: "error" },
  { label: "Duplicate symbol",       regex: /duplicate symbol/i,                                 severity: "error" },
  { label: "Compile error",          regex: /fatal error:/i,                                     severity: "error" },
  // Code signing
  { label: "Code sign error",        regex: /Code Sign error/i,                                  severity: "error" },
  { label: "Signing error",          regex: /Signing Error/i,                                    severity: "error" },
  { label: "No profile",             regex: /No profile for team/i,                              severity: "error" },
  { label: "Provisioning profile",   regex: /provisioning profile/i,                             severity: "warning" },
  { label: "Certificate expired",    regex: /certificate.*expired|expired.*certificate/i,        severity: "error" },
  { label: "Entitlements error",     regex: /entitlements/i,                                     severity: "warning" },
  // Bitrise step failures
  { label: "Step failed",            regex: /\| FAILED \|/i,                                     severity: "error" },
  { label: "Exit code",              regex: /exit code: [^0]/,                                   severity: "error" },
  { label: "Step error",             regex: /^\[!\]/m,                                           severity: "error" },
  // App Store / TestFlight
  { label: "Upload error",           regex: /ERROR ITMS/i,                                       severity: "error" },
  { label: "iTunes error",           regex: /ITSAppUsesNonExemptEncryption/i,                    severity: "warning" },
  { label: "Missing export options", regex: /ExportOptions/i,                                    severity: "warning" },
  // Dependency / pod issues
  { label: "CocoaPods error",        regex: /pod install.*failed|cocoapods.*error/i,             severity: "error" },
  { label: "Missing dependency",     regex: /could not find.*gem|module.*not found/i,            severity: "error" },
  // Generic
  { label: "Uncaught exception",     regex: /uncaught exception|NSException/i,                   severity: "error" },
  { label: "Timeout",                regex: /timed? ?out/i,                                      severity: "warning" },
];

// ─── Bitrise API types ────────────────────────────────────────────────────────

interface BitriseLogResponse {
  expiring_raw_log_url: string | null;
  generated_log_chunks_num: number;
  is_archived: boolean;
  log_chunks: Array<{ chunk: string; position: number }> | null;
  timestamp: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parses a build slug out of a full Bitrise URL or returns input unchanged. */
function parseBuildSlug(input: string): string {
  const match = input.match(/\/build\/([a-f0-9-]+)/i);
  return match ? match[1] : input.trim();
}

interface MatchedLine {
  lineNo:   number;
  label:    string;
  severity: ErrorPattern["severity"];
  text:     string;
}

/** Scans log text for known error patterns and returns annotated matches. */
function extractErrors(logText: string): MatchedLine[] {
  const lines = logText.split("\n");
  const seen = new Set<string>();
  const matches: MatchedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.regex.test(line)) {
        const key = `${pattern.label}:${line.trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            lineNo:   i + 1,
            label:    pattern.label,
            severity: pattern.severity,
            text:     line.trim().slice(0, 300), // cap at 300 chars per line
          });
        }
        break; // one label per line
      }
    }
  }

  // Sort errors before warnings
  matches.sort((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  return matches;
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerAnalyzeBuildLog(server: McpServer): void {
  server.tool(
    "analyze_build_log",
    "Fetch the Bitrise build log for a given build and extract all errors, code-sign issues, and failed steps. Accepts a build slug or a full Bitrise build URL.",
    {
      build_id: z
        .string()
        .describe(
          "Build slug or full Bitrise build URL, e.g. https://app.bitrise.io/build/abc123def456"
        ),
      include_warnings: z
        .boolean()
        .default(true)
        .describe("Include warning-level matches in addition to errors. Default: true."),
      context_lines: z
        .number()
        .int()
        .min(0)
        .max(10)
        .default(2)
        .describe("Lines of context to show above and below each match. Default: 2."),
    },
    async ({ build_id, include_warnings, context_lines }) => {
      validateBitriseAuth();

      if (!config.bitriseAppSlug) {
        throw new McpError(
          ErrorCode.InternalError,
          "Server configuration error — BITRISE_APP_SLUG is not configured."
        );
      }

      const buildSlug = parseBuildSlug(build_id);
      const client    = getBitriseClient();
      const appSlug   = config.bitriseAppSlug;

      // ── 1. Fetch log metadata ───────────────────────────────────────────
      let logMeta: BitriseLogResponse;
      try {
        const { data } = await client.get<BitriseLogResponse>(
          `/apps/${appSlug}/builds/${buildSlug}/log`
        );
        logMeta = data;
      } catch (err: unknown) {
        if (err instanceof McpError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new McpError(
          ErrorCode.InternalError,
          `Bitrise API error fetching log metadata: ${msg}`
        );
      }

      // ── 2. Download full log text ───────────────────────────────────────
      let logText = "";

      if (logMeta.is_archived && logMeta.expiring_raw_log_url) {
        // Archived build — download from presigned S3 URL
        try {
          const { data } = await axios.get<string>(logMeta.expiring_raw_log_url, {
            responseType: "text",
            timeout: 30_000,
          });
          logText = data;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to download archived log from S3: ${msg}`
          );
        }
      } else if (logMeta.log_chunks && logMeta.log_chunks.length > 0) {
        // Live / chunked log — concatenate in order
        logText = logMeta.log_chunks
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((c) => c.chunk)
          .join("");
      } else {
        return {
          content: [{
            type: "text" as const,
            text: [
              `ℹ️  No log content available yet for build: ${buildSlug}`,
              "",
              "The build may still be initialising. Try again in a few seconds.",
              `Build URL: https://app.bitrise.io/build/${buildSlug}`,
            ].join("\n"),
          }],
        };
      }

      // ── 3. Extract errors ───────────────────────────────────────────────
      const allMatches = extractErrors(logText);
      const filtered   = include_warnings
        ? allMatches
        : allMatches.filter((m) => m.severity === "error");

      const logLines = logText.split("\n");
      const totalLines = logLines.length;

      // ── 4. Build output ─────────────────────────────────────────────────
      if (filtered.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: [
              `✅ No errors found in build log — build: ${buildSlug}`,
              `   Log lines scanned: ${totalLines.toLocaleString()}`,
              `   Build URL: https://app.bitrise.io/build/${buildSlug}`,
            ].join("\n"),
          }],
        };
      }

      const errors   = filtered.filter((m) => m.severity === "error");
      const warnings = filtered.filter((m) => m.severity === "warning");

      const header = [
        `Build Log Analysis — ${buildSlug}`,
        `${"═".repeat(64)}`,
        `Log lines scanned: ${totalLines.toLocaleString()}`,
        `Errors found:      ${errors.length}`,
        `Warnings found:    ${warnings.length}`,
        `Build URL:         https://app.bitrise.io/build/${buildSlug}`,
        "",
      ];

      const sections: string[] = [];

      for (const match of filtered) {
        const icon = match.severity === "error" ? "❌" : "⚠️ ";
        sections.push(`${icon} [${match.label}] — line ${match.lineNo}`);

        // Context lines
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
        content: [{
          type: "text" as const,
          text: [...header, ...sections].join("\n"),
        }],
      };
    }
  );
}
