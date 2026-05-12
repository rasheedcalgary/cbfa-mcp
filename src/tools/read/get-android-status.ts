/**
 * Tool: get_android_status
 *
 * Returns the Google Play Store status for a CBA app — current version,
 * Play Store state, and Google Play key validity.
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "Is com.trainerize.peakfitness live on Android?"
 *   - "What's the Play Store status of com.trainerize.peakfitness?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAppByBundleId } from "../../data/appRegistry.js";

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

      const app = await getAppByBundleId(bundle_id);

      const state = app.android_store_state.toLowerCase();
      const isLive = state.includes("published") || state.includes("production");

      const lines = [
        `Android Status — ${app.display_name} (${app.bundle_id})`,
        "─".repeat(60),
        "",
        `  Version:           ${app.android_version || "—"}`,
        `  Play Store State:  ${app.android_store_state || "—"}  ${isLive ? "✓ Live" : "✗ Not live"}`,
        `  Google Key Valid:  ${app.google_key_valid || "—"}`,
        `  Last Updated:      ${app.last_android_updated || "—"}`,
        "",
        `Data dump: ${app.dump_date}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
