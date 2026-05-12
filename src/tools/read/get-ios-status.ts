/**
 * Tool: get_ios_status
 *
 * Returns the current iOS App Store status for a CBA app — current version,
 * App Store state (Ready for Sale / In Review / Rejected / etc.), and
 * whether the Apple distribution key (.p8) is valid.
 *
 * Auth required: Admin Panel API key (ADMIN_PANEL_API_KEY + ADMIN_PANEL_DOMAIN)
 *
 * Example prompts:
 *   - "What's the iOS App Store status of com.trainerize.peakfitness?"
 *   - "Is com.trainerize.peakfitness live on the App Store?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";

export function registerGetIosStatus(server: McpServer): void {
  server.tool(
    "get_ios_status",
    "Get the iOS App Store status and current version for a CBA app.",
    {
      bundle_id: z
        .string()
        .describe("Bundle ID of the app, e.g. com.trainerize.peakfitness"),
    },
    async ({ bundle_id }) => {
      validateAdminPanelAuth();

      // TODO (Phase 3): Return ios_version, app_store_state, apple_key_valid from registry
      return {
        content: [
          {
            type: "text" as const,
            text: [
              "✓ Auth check passed (ADMIN_PANEL_API_KEY is configured).",
              "",
              `get_ios_status — implementation pending (Phase 3).`,
              `  bundle_id: ${bundle_id}`,
              "",
              "Will return: ios_version, app_store_state, apple_key_valid, apple_id",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
