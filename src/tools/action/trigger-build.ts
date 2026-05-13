/**
 * Tool: trigger_app_build
 *
 * Triggers an iOS build on Bitrise for a CBA app.
 * Android builds are not yet wired up (Jenkins — Phase 4b).
 *
 * iOS workflow selection:
 *   build_type = "new_app"  → New_App_Creation_Flow
 *   build_type = "update"   → DEPLOY_testflight_S3_2026
 *
 * The tool resolves the app's bundle_id from the registry and passes it
 * as a Bitrise environment variable (BUNDLE_ID) so the workflow can use it.
 *
 * Auth required: BITRISE_TOKEN + BITRISE_APP_SLUG (server .env)
 *
 * Example prompts:
 *   - "Trigger a new app build for com.trainerize.peakfitness"
 *   - "Run an update build for com.trainerize.abcplus on Bitrise"
 *   - "Deploy com.trainerize.eosfitness to TestFlight"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { validateBitriseAuth } from "../../auth/validator.js";
import { getBitriseClient } from "../../clients/bitrise.js";
import { getAppByBundleId } from "../../data/appRegistry.js";
import { config } from "../../config.js";

const IOS_WORKFLOWS = {
  new_app: "New_App_Creation_Flow",
  update:  "DEPLOY_testflight_S3_2026",
} as const;

type BuildType = keyof typeof IOS_WORKFLOWS;

interface BitriseTriggerResponse {
  build_number: number;
  build_slug:   string;
  build_url:    string;
  message:      string;
  status:       string;
  triggered_workflow: string;
}

export function registerTriggerAppBuild(server: McpServer): void {
  server.tool(
    "trigger_app_build",
    "Trigger an iOS build on Bitrise for a CBA app. Use build_type='new_app' for first-time app creation (New_App_Creation_Flow) or 'update' for batch/TestFlight updates (DEPLOY_testflight_S3_2026). Android builds are not yet implemented.",
    {
      bundle_id: z
        .string()
        .describe("Bundle ID of the app to build, e.g. com.trainerize.peakfitness"),
      build_type: z
        .enum(["new_app", "update"])
        .describe(
          "'new_app' = New_App_Creation_Flow (first-time build). 'update' = DEPLOY_testflight_S3_2026 (batch / TestFlight update)."
        ),
      platform: z
        .enum(["ios", "android", "both"])
        .default("ios")
        .describe("Platform to build. Only 'ios' is currently implemented via Bitrise."),
      branch: z
        .string()
        .optional()
        .describe("Git branch to build. Defaults to the workflow's default branch."),
      workflow_override: z
        .string()
        .optional()
        .describe("Override the workflow name. Leave empty to use the build_type default."),
    },
    async ({ bundle_id, build_type, platform, branch, workflow_override }) => {
      validateBitriseAuth();

      if (!config.bitriseAppSlug) {
        throw new McpError(
          ErrorCode.InternalError,
          [
            "Server configuration error — BITRISE_APP_SLUG is not configured.",
            "Add BITRISE_APP_SLUG=de36db0d3356751f to the server .env file.",
          ].join("\n")
        );
      }

      if (platform !== "ios") {
        return {
          content: [{
            type: "text" as const,
            text: [
              `⚠️  Android builds are not yet implemented.`,
              `Only iOS builds are supported via Bitrise at this time.`,
              `Requested: platform=${platform}, bundle_id=${bundle_id}`,
            ].join("\n"),
          }],
        };
      }

      // Verify the app exists in the registry
      const app = await getAppByBundleId(bundle_id);
      const workflow = workflow_override ?? IOS_WORKFLOWS[build_type as BuildType];

      const client = getBitriseClient();
      const appSlug = config.bitriseAppSlug;

      const payload: Record<string, unknown> = {
        hook_info: { type: "bitrise" },
        build_params: {
          workflow_id: workflow,
          ...(branch ? { branch } : {}),
          environments: [
            { mapped_to: "BUNDLE_ID",    value: bundle_id,         is_expand: true },
            { mapped_to: "APP_NAME",     value: app.display_name,  is_expand: true },
            { mapped_to: "BITRISE_WORKFLOW", value: app.bitrise_workflow, is_expand: true },
          ],
        },
      };

      let result: BitriseTriggerResponse;
      try {
        const { data } = await client.post<BitriseTriggerResponse>(
          `/apps/${appSlug}/builds`,
          payload
        );
        result = data;
      } catch (err: unknown) {
        if (err instanceof McpError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new McpError(
          ErrorCode.InternalError,
          `Bitrise API error while triggering build: ${msg}`
        );
      }

      const lines = [
        `✅ Build triggered — ${app.display_name} (${bundle_id})`,
        "",
        `  Workflow:    ${result.triggered_workflow}`,
        `  Build #:     ${result.build_number}`,
        `  Build slug:  ${result.build_slug}`,
        `  Status:      ${result.status}`,
        `  Build URL:   ${result.build_url}`,
        "",
        `Use get_build_status with build_id="${result.build_slug}" to poll progress.`,
        `Use analyze_build_log with the same build_id to inspect errors if the build fails.`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
