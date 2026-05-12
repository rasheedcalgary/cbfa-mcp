/**
 * Tool: list_apps
 *
 * Lists all Custom Branded Apps, optionally filtered by product type.
 * Returns app code, display name, group ID, and team for each match.
 *
 * Auth required: Admin Panel API key (ADMIN_PANEL_API_KEY + ADMIN_PANEL_DOMAIN)
 *
 * Example prompts:
 *   - "List all CBA apps"
 *   - "Show me all enterprise apps"
 *   - "What ABC apps do we have?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";

export function registerListApps(server: McpServer): void {
  server.tool(
    "list_apps",
    "List all Custom Branded Apps (CBA). Optionally filter by product type: enterprise, studio, pro, or abc.",
    {
      app_type: z
        .enum(["enterprise", "studio", "pro", "abc"])
        .optional()
        .describe("Filter by app product type. Omit to return all apps."),
    },
    async ({ app_type }) => {
      // Auth guard — throws a descriptive McpError if credentials are missing
      validateAdminPanelAuth();

      // TODO (Phase 3): Query admin panel / app registry for apps, apply filter
      return {
        content: [
          {
            type: "text" as const,
            text: [
              "✓ Auth check passed (ADMIN_PANEL_API_KEY is configured).",
              "",
              `list_apps — implementation pending (Phase 3).`,
              `  Requested filter: app_type = ${app_type ?? "all"}`,
              "",
              "Will return: bundle_id | display_name | group_id | team_name | app_type",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
