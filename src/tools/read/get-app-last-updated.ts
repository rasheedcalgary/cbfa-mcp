/**
 * Tool: get_app_last_updated
 *
 * Returns the last release dates for both iOS and Android for a CBA app,
 * including a human-friendly "X days ago" label and a freshness assessment.
 *
 * Auth required: Admin Panel API key (ADMIN_PANEL_API_KEY + ADMIN_PANEL_DOMAIN)
 *
 * Example prompts:
 *   - "When was com.trainerize.peakfitness last updated?"
 *   - "How old is the iOS version of com.trainerize.peakfitness?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";

export function registerGetAppLastUpdated(server: McpServer): void {
  server.tool(
    "get_app_last_updated",
    "Get the last iOS and Android release dates for a CBA app, with freshness status.",
    {
      bundle_id: z
        .string()
        .describe("Bundle ID of the app, e.g. com.trainerize.peakfitness"),
    },
    async ({ bundle_id }) => {
      validateAdminPanelAuth();

      // TODO (Phase 3): Return last_ios_updated, last_android_updated with days-ago calculation
      return {
        content: [
          {
            type: "text" as const,
            text: [
              "✓ Auth check passed (ADMIN_PANEL_API_KEY is configured).",
              "",
              `get_app_last_updated — implementation pending (Phase 3).`,
              `  bundle_id: ${bundle_id}`,
              "",
              "Will return:",
              "  iOS:     last_ios_updated, days_since_ios_update, ios_freshness",
              "  Android: last_android_updated, days_since_android_update, android_freshness",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
