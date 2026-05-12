/**
 * Tool: trigger_app_build
 *
 * Triggers an iOS and/or Android build for a CBA app via the specified
 * CI/CD provider (Bitrise or Jenkins). Returns the build ID, queued status,
 * and a direct URL to monitor the build.
 *
 * Auth required:
 *   - provider=bitrise → BITRISE_TOKEN
 *   - provider=jenkins → JENKINS_URL + JENKINS_USER + JENKINS_API_KEY
 *
 * Example prompts:
 *   - "Trigger an iOS build for com.trainerize.peakfitness"
 *   - "Build both platforms for com.trainerize.peakfitness using Jenkins"
 *   - "Run the release workflow for com.trainerize.peakfitness on Bitrise"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateBitriseAuth, validateJenkinsAuth } from "../../auth/validator.js";

export function registerTriggerAppBuild(server: McpServer): void {
  server.tool(
    "trigger_app_build",
    "Trigger an iOS and/or Android build for a CBA app via Bitrise or Jenkins.",
    {
      bundle_id: z
        .string()
        .describe("Bundle ID of the app to build, e.g. com.trainerize.peakfitness"),
      platform: z
        .enum(["ios", "android", "both"])
        .default("both")
        .describe("Which platform(s) to build. Defaults to 'both'."),
      provider: z
        .enum(["bitrise", "jenkins"])
        .default("bitrise")
        .describe("CI/CD provider to use. Defaults to 'bitrise'."),
      branch: z
        .string()
        .optional()
        .describe("Git branch to build. Defaults to the app's default branch."),
      workflow: z
        .string()
        .optional()
        .describe(
          "Override the Bitrise workflow or Jenkins job name. Defaults to the app's configured workflow."
        ),
    },
    async ({ bundle_id, platform, provider, branch, workflow }) => {
      // Validate credentials for the chosen provider
      if (provider === "bitrise") {
        validateBitriseAuth();
      } else {
        validateJenkinsAuth();
      }

      // TODO (Phase 4): Look up app's bitrise_workflow from registry, call provider API
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `✓ Auth check passed (${provider === "bitrise" ? "BITRISE_TOKEN" : "JENKINS credentials"} configured).`,
              "",
              `trigger_app_build — implementation pending (Phase 4).`,
              `  bundle_id: ${bundle_id}`,
              `  platform:  ${platform}`,
              `  provider:  ${provider}`,
              `  branch:    ${branch ?? "default"}`,
              `  workflow:  ${workflow ?? "from app registry"}`,
              "",
              "Will return: build_id, status=queued, build_url",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
