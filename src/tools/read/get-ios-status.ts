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

      // IOSStoreStatus values from Apple: "ReadyForSale", "None", etc.
      const state = app.app_store_state.toLowerCase().replace(/\s/g, "");
      const isLive = state === "readyforsale" || app.status.toLowerCase() === "published";

      const lines = [
        `iOS Status — ${app.display_name} (${app.bundle_id})`,
        "─".repeat(60),
        "",
        `  Version:          ${app.ios_version || "—"}`,
        `  App Store Status: ${app.app_store_state || "—"}  ${isLive ? "✓ Live" : "✗ Not live"}`,
        `  CBA Status:       ${app.status || "—"}`,
        `  iOS Membership:   ${app.ios_membership || "—"}`,
        `  Apple Account:    ${app.apple_id || "—"}`,
        `  Last Published:   ${app.last_ios_updated || "—"}`,
        "",
        `Data dump: ${app.dump_date}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
