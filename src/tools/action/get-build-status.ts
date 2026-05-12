/**
 * Tool: get_build_status
 *
 * Polls the status of a previously triggered build from Bitrise or Jenkins.
 * Returns the current state (queued / running / succeeded / failed / aborted),
 * elapsed time, and links to logs.
 *
 * Auth required:
 *   - provider=bitrise → BITRISE_TOKEN
 *   - provider=jenkins → JENKINS_URL + JENKINS_USER + JENKINS_API_KEY
 *
 * Example prompts:
 *   - "Is the Bitrise build abc123 done?"
 *   - "What's the status of Jenkins build 456 for com.trainerize.peakfitness?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateBitriseAuth, validateJenkinsAuth } from "../../auth/validator.js";

export function registerGetBuildStatus(server: McpServer): void {
  server.tool(
    "get_build_status",
    "Check the current status of a triggered CI/CD build on Bitrise or Jenkins.",
    {
      build_id: z
        .string()
        .describe("Build ID returned by trigger_app_build, or a known Bitrise/Jenkins build number."),
      provider: z
        .enum(["bitrise", "jenkins"])
        .default("bitrise")
        .describe("CI/CD provider the build was triggered on. Defaults to 'bitrise'."),
      bundle_id: z
        .string()
        .optional()
        .describe(
          "Bundle ID of the app (required for Jenkins to resolve the job name)."
        ),
    },
    async ({ build_id, provider, bundle_id }) => {
      // Validate credentials for the chosen provider
      if (provider === "bitrise") {
        validateBitriseAuth();
      } else {
        validateJenkinsAuth();
      }

      // TODO (Phase 4): Poll provider API for build status
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `✓ Auth check passed (${provider === "bitrise" ? "BITRISE_TOKEN" : "JENKINS credentials"} configured).`,
              "",
              `get_build_status — implementation pending (Phase 4).`,
              `  build_id:  ${build_id}`,
              `  provider:  ${provider}`,
              `  bundle_id: ${bundle_id ?? "not provided"}`,
              "",
              "Will return: build_id, status, provider, triggered_at, duration_seconds, build_url, logs_url",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
