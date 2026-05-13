/**
 * Tool: list_apps
 *
 * Lists all Custom Branded Apps, optionally filtered by product type.
 * Returns a formatted table with bundle ID, display name, group ID, team, and type.
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "List all CBA apps"
 *   - "Show me all enterprise apps"
 *   - "What ABC apps do we have?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAllApps, getRegistryMeta } from "../../data/appRegistry.js";
import { toCSV } from "../../utils/csv.js";
import type { AppType } from "../../types/index.js";

export function registerListApps(server: McpServer): void {
  server.tool(
    "list_apps",
    "List all Custom Branded Apps (CBA). Optionally filter by product type: enterprise, studio, pro, or abc.",
    {
      app_type: z
        .enum(["enterprise", "studio", "pro", "abc"])
        .optional()
        .describe("Filter by app product type. Omit to return all apps."),
      format: z
        .enum(["table", "csv"])
        .default("table")
        .describe("Output format. 'table' (default) or 'csv' for a downloadable report."),
    },
    async ({ app_type, format }) => {
      validateAdminPanelAuth();

      const apps = await getAllApps(app_type as AppType | undefined);
      const meta = getRegistryMeta();

      if (apps.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No apps found${app_type ? ` for type "${app_type}"` : ""}.`,
            },
          ],
        };
      }

      // ── CSV output ───────────────────────────────────────────────────────
      if (format === "csv") {
        const headers = ["bundle_id", "display_name", "group_id", "team_name", "app_type"];
        const csvRows = apps.map((a) => [a.bundle_id, a.display_name, a.group_id, a.team_name, a.app_type]);
        return {
          content: [{
            type: "text" as const,
            text: `# CBA App List${app_type ? ` — type: ${app_type}` : ""}\n# Generated: ${new Date().toISOString()}\n\n${toCSV(headers, csvRows)}`,
          }],
        };
      }

      // ── Table output ─────────────────────────────────────────────────────
      const header = [
        "Bundle ID".padEnd(50),
        "Display Name".padEnd(35),
        "Group ID".padEnd(12),
        "Team Name".padEnd(30),
        "Type",
      ].join(" | ");

      const divider = "-".repeat(header.length);

      const rows = apps.map((a) =>
        [
          a.bundle_id.padEnd(50),
          a.display_name.padEnd(35),
          a.group_id.padEnd(12),
          a.team_name.padEnd(30),
          a.app_type,
        ].join(" | ")
      );

      const lines = [
        `Found ${apps.length} app${apps.length !== 1 ? "s" : ""}${app_type ? ` (type: ${app_type})` : ""} — data as of ${meta.loadedAt ?? "unknown"}`,
        "",
        header,
        divider,
        ...rows,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
