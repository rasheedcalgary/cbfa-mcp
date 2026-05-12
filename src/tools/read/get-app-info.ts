/**
 * Tool: get_app_info
 *
 * Returns the full record for a single Custom Branded App identified by
 * its bundle ID — including team, group, Apple account, Bitrise workflow,
 * watch face support, and both platform statuses.
 *
 * Auth required: Admin Panel API key (ADMIN_PANEL_API_KEY + ADMIN_PANEL_DOMAIN)
 *
 * Example prompts:
 *   - "Give me all info about com.trainerize.peakfitness"
 *   - "What Bitrise workflow does com.trainerize.peakfitness use?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";

export function registerGetAppInfo(server: McpServer): void {
  server.tool(
    "get_app_info",
    "Get full details for a single CBA app by its bundle ID.",
    {
      bundle_id: z
        .string()
        .describe(
          "Reverse-DNS bundle identifier, e.g. com.trainerize.peakfitness"
        ),
    },
    async ({ bundle_id }) => {
      validateAdminPanelAuth();

      // TODO (Phase 3): Look up app in registry by bundle_id and return full record
      return {
        content: [
          {
            type: "text" as const,
            text: [
              "✓ Auth check passed (ADMIN_PANEL_API_KEY is configured).",
              "",
              `get_app_info — implementation pending (Phase 3).`,
              `  bundle_id: ${bundle_id}`,
              "",
              "Will return: bundle_id, display_name, app_type, team_name, group_id,",
              "             apple_id, abc_app_type, bitrise_workflow, watch_face,",
              "             ios_version, app_store_state, android_version, android_store_state",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
