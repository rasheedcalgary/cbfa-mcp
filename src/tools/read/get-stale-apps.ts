/**
 * Tool: get_stale_apps
 *
 * Finds apps that haven't been updated on either platform within a given
 * number of days. Useful for identifying apps that need a maintenance
 * release or are at risk of App Store / Play Store delisting.
 *
 * Auth required: Admin Panel API key (ADMIN_PANEL_API_KEY + ADMIN_PANEL_DOMAIN)
 *
 * Example prompts:
 *   - "Which enterprise apps haven't been updated in 6 months?"
 *   - "Show me stale studio apps older than 90 days"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";

export function registerGetStaleApps(server: McpServer): void {
  server.tool(
    "get_stale_apps",
    "Find CBA apps that haven't been updated on iOS or Android within a threshold number of days.",
    {
      days_threshold: z
        .number()
        .int()
        .positive()
        .default(180)
        .describe("Apps not updated within this many days are considered stale. Defaults to 180 (6 months)."),
      app_type: z
        .enum(["enterprise", "studio", "pro", "abc"])
        .optional()
        .describe("Limit stale check to a specific app type. Omit for all types."),
      platform: z
        .enum(["ios", "android", "either", "both"])
        .default("either")
        .describe(
          "Which platform to check: 'either' (stale on at least one), 'both' (stale on both). Defaults to 'either'."
        ),
    },
    async ({ days_threshold, app_type, platform }) => {
      validateAdminPanelAuth();

      // TODO (Phase 3): Cross-reference last_ios_updated / last_android_updated against threshold
      return {
        content: [
          {
            type: "text" as const,
            text: [
              "✓ Auth check passed (ADMIN_PANEL_API_KEY is configured).",
              "",
              `get_stale_apps — implementation pending (Phase 3).`,
              `  days_threshold: ${days_threshold}`,
              `  app_type:       ${app_type ?? "all"}`,
              `  platform:       ${platform}`,
              "",
              "Will return: bundle_id, display_name, last_ios_updated, last_android_updated,",
              "             days_stale_ios, days_stale_android, stale_reason",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
