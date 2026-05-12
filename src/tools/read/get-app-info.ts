/**
 * Tool: get_app_info
 *
 * Returns the full record for a single CBA app — team, group, Apple account,
 * Bitrise workflow, watch face support, and current status on both platforms.
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "Give me all info about com.trainerize.peakfitness"
 *   - "What Bitrise workflow does com.trainerize.peakfitness use?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAppByBundleId } from "../../data/appRegistry.js";

export function registerGetAppInfo(server: McpServer): void {
  server.tool(
    "get_app_info",
    "Get full details for a single CBA app by its bundle ID.",
    {
      bundle_id: z
        .string()
        .describe("Reverse-DNS bundle identifier, e.g. com.trainerize.peakfitness"),
    },
    async ({ bundle_id }) => {
      validateAdminPanelAuth();

      const app = await getAppByBundleId(bundle_id);

      const lines = [
        `${app.display_name} (${app.bundle_id})`,
        "─".repeat(60),
        "",
        "General",
        `  Type:              ${app.app_type}`,
        `  Team:              ${app.team_name}`,
        `  Group ID:          ${app.group_id}`,
        `  Apple Account:     ${app.apple_id}`,
        `  ABC App Type:      ${app.abc_app_type}`,
        `  Watch Face:        ${app.watch_face || "no"}`,
        "",
        "iOS",
        `  Version:           ${app.ios_version || "—"}`,
        `  App Store State:   ${app.app_store_state || "—"}`,
        `  Key Valid:         ${app.apple_key_valid || "—"}`,
        `  Last Updated:      ${app.last_ios_updated || "—"}`,
        "",
        "Android",
        `  Version:           ${app.android_version || "—"}`,
        `  Play Store State:  ${app.android_store_state || "—"}`,
        `  Key Valid:         ${app.google_key_valid || "—"}`,
        `  Last Updated:      ${app.last_android_updated || "—"}`,
        "",
        "CI/CD",
        `  Bitrise Workflow:  ${app.bitrise_workflow || "—"}`,
        "",
        `Data dump: ${app.dump_date}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
