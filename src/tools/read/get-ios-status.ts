/**
 * Tool: get_ios_status
 *
 * Returns the iOS App Store status for a CBA app — current version,
 * App Store state, and Apple key validity.
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "What's the iOS App Store status of com.trainerize.peakfitness?"
 *   - "Is com.trainerize.peakfitness live on the App Store?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAppByBundleId } from "../../data/appRegistry.js";

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

      const app = await getAppByBundleId(bundle_id);

      // Derive a simple live/not-live flag from the App Store state
      const state = app.app_store_state.toLowerCase();
      const isLive = state.includes("ready for sale") || state.includes("published");

      const lines = [
        `iOS Status — ${app.display_name} (${app.bundle_id})`,
        "─".repeat(60),
        "",
        `  Version:          ${app.ios_version || "—"}`,
        `  App Store State:  ${app.app_store_state || "—"}  ${isLive ? "✓ Live" : "✗ Not live"}`,
        `  Apple Key Valid:  ${app.apple_key_valid || "—"}`,
        `  Apple Account:    ${app.apple_id || "—"}`,
        `  Last Updated:     ${app.last_ios_updated || "—"}`,
        "",
        `Data dump: ${app.dump_date}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
