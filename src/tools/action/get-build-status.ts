/**
 * Tool: get_build_status
 *
 * Polls the current status of a Bitrise build by build slug.
 * The build slug is returned by trigger_app_build and is also the last
 * path segment of any Bitrise build URL:
 *   https://app.bitrise.io/build/{build-slug}
 *
 * Bitrise status codes:
 *   0 = not finished / in progress
 *   1 = successful
 *   2 = failed
 *   3 = aborted with failure
 *   4 = aborted with success
 *
 * Auth required: BITRISE_TOKEN + BITRISE_APP_SLUG (server .env)
 *
 * Example prompts:
 *   - "Is the Bitrise build abc123 done?"
 *   - "What's the status of build de36db0d3356751f?"
 *   - "Check the build I just triggered for com.trainerize.peakfitness"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { validateBitriseAuth } from "../../auth/validator.js";
import { getBitriseClient } from "../../clients/bitrise.js";
import { config } from "../../config.js";

const STATUS_TEXT: Record<number, string> = {
  0: "⏳ In progress",
  1: "✅ Successful",
  2: "❌ Failed",
  3: "🛑 Aborted (failure)",
  4: "⚠️  Aborted (success)",
};

interface BitriseGetBuildResponse {
  data: {
    slug:                string;
    build_number:        number;
    status:              number;
    status_text:         string;
    triggered_workflow:  string;
    triggered_at:        string;
    started_on_worker_at: string;
    finished_at:         string;
    branch:              string;
    commit_message:      string;
    machine_type_id:     string;
    abort_reason:        string;
  };
}

/** Parses a build slug out of a full Bitrise URL or returns the input unchanged. */
function parseBuildSlug(input: string): string {
  const match = input.match(/\/build\/([a-f0-9-]+)/i);
  return match ? match[1] : input.trim();
}

/** Human-readable duration from ISO start/end strings. */
function duration(start: string, end: string): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function registerGetBuildStatus(server: McpServer): void {
  server.tool(
    "get_build_status",
    "Check the current status of a Bitrise build. Accepts a build slug (returned by trigger_app_build) or a full Bitrise build URL.",
    {
      build_id: z
        .string()
        .describe(
          "Build slug returned by trigger_app_build, or a full Bitrise build URL like https://app.bitrise.io/build/abc123."
        ),
    },
    async ({ build_id }) => {
      validateBitriseAuth();

      if (!config.bitriseAppSlug) {
        throw new McpError(
          ErrorCode.InternalError,
          "Server configuration error — BITRISE_APP_SLUG is not configured."
        );
      }

      const buildSlug = parseBuildSlug(build_id);
      const client = getBitriseClient();
      const appSlug = config.bitriseAppSlug;

      let build: BitriseGetBuildResponse["data"];
      try {
        const { data } = await client.get<BitriseGetBuildResponse>(
          `/apps/${appSlug}/builds/${buildSlug}`
        );
        build = data.data;
      } catch (err: unknown) {
        if (err instanceof McpError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new McpError(
          ErrorCode.InternalError,
          `Bitrise API error fetching build status: ${msg}`
        );
      }

      const statusLabel = STATUS_TEXT[build.status] ?? `Unknown (${build.status})`;
      const dur = build.finished_at
        ? duration(build.started_on_worker_at, build.finished_at)
        : "still running";

      const lines = [
        `Build #${build.build_number} — ${statusLabel}`,
        "",
        `  Slug:       ${build.slug}`,
        `  Workflow:   ${build.triggered_workflow}`,
        `  Branch:     ${build.branch || "—"}`,
        `  Triggered:  ${build.triggered_at || "—"}`,
        `  Started:    ${build.started_on_worker_at || "—"}`,
        `  Finished:   ${build.finished_at || "still running"}`,
        `  Duration:   ${dur}`,
        `  Machine:    ${build.machine_type_id || "—"}`,
        ...(build.abort_reason ? [`  Abort reason: ${build.abort_reason}`] : []),
        ...(build.commit_message ? [`  Commit:     ${build.commit_message}`] : []),
        "",
        `  Build URL:  https://app.bitrise.io/build/${build.slug}`,
      ];

      if (build.status === 2 || build.status === 3) {
        lines.push("", `💡 Run analyze_build_log with build_id="${build.slug}" to see the error details.`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
