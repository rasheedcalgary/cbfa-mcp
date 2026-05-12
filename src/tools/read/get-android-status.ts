/**
 * Tool: get_android_status
 *
 * Returns the current Google Play Store status for a CBA app — current version,
 * Play Store state, and whether the Google Play Service Account key is valid.
 *
 * Auth required: Admin Panel API key (ADMIN_PANEL_API_KEY + ADMIN_PANEL_DOMAIN)
 *
 * Example prompts:
 *   - "Is com.trainerize.peakfitness live on Android?"
 *   - "What's the Play Store status of com.trainerize.peakfitness?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";

export function registerGetAndroidStatus(server: McpServer): void {
  server.tool(
    "get_android_status",
    "Get the Google Play Store status and current version for a CBA app.",
    {
      bundle_id: z
        .string()
        .describe("Bundle ID of the app, e.g. com.trainerize.peakfitness"),
    },
    async ({ bundle_id }) => {
      validateAdminPanelAuth();

      // TODO (Phase 3): Return android_version, android_store_state, google_key_valid from registry
      return {
        content: [
          {
            type: "text" as const,
            text: [
              "✓ Auth check passed (ADMIN_PANEL_API_KEY is configured).",
              "",
              `get_android_status — implementation pending (Phase 3).`,
              `  bundle_id: ${bundle_id}`,
              "",
              "Will return: android_version, android_store_state, google_key_valid",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
