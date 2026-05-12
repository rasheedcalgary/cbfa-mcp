/**
 * Tool: query_apps
 *
 * Flexible report-style query across all CBA apps with multiple
 * combinable filters. Returns a formatted table.
 *
 * Filters (all optional, AND-combined):
 *   ios_version      — exact iOS version, e.g. "8.16.0"
 *   android_version  — exact Android version
 *   status           — CBA lifecycle status: Published | WaitingForArtwork |
 *                      Notified | Submitted | PendingPublish |
 *                      ReceivedArtifacts | Deactivated
 *   ios_store_status — Apple store status: ReadyForSale | None
 *   app_type         — enterprise | studio | pro | abc
 *   business_type    — "ABC" or "Trainerize"
 *   limit            — max rows to return (default 200)
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "List all iOS 8.16.0 Published apps"
 *   - "Show me enterprise apps with status Published and iOS ReadyForSale"
 *   - "Which ABC apps are still WaitingForArtwork?"
 *   - "How many studio apps are on Android version 8.16.0?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAllApps, getRegistryMeta } from "../../data/appRegistry.js";
import type { AppType } from "../../types/index.js";

const CBA_STATUSES = [
  "Published",
  "WaitingForArtwork",
  "Notified",
  "Submitted",
  "PendingPublish",
  "ReceivedArtifacts",
  "Deactivated",
] as const;

const IOS_STORE_STATUSES = ["ReadyForSale", "None"] as const;

export function registerQueryApps(server: McpServer): void {
  server.tool(
    "query_apps",
    "Flexible report query on CBA apps — filter by iOS/Android version, CBA status, App Store status, app type, or business. All filters are optional and AND-combined.",
    {
      ios_version: z
        .string()
        .optional()
        .describe("Exact iOS version to match, e.g. \"8.16.0\"."),
      android_version: z
        .string()
        .optional()
        .describe("Exact Android version to match, e.g. \"8.16.0\"."),
      status: z
        .enum(CBA_STATUSES)
        .optional()
        .describe(
          "CBA lifecycle status: Published | WaitingForArtwork | Notified | Submitted | PendingPublish | ReceivedArtifacts | Deactivated"
        ),
      ios_store_status: z
        .enum(IOS_STORE_STATUSES)
        .optional()
        .describe("Apple App Store status: ReadyForSale | None"),
      app_type: z
        .enum(["enterprise", "studio", "pro", "abc"])
        .optional()
        .describe("Filter by app product type."),
      business_type: z
        .string()
        .optional()
        .describe("Business owner — \"ABC\" or \"Trainerize\" (case-insensitive)."),
      limit: z
        .number()
        .int()
        .positive()
        .default(200)
        .describe("Maximum number of results to return. Defaults to 200."),
    },
    async ({ ios_version, android_version, status, ios_store_status, app_type, business_type, limit }) => {
      validateAdminPanelAuth();

      const allApps = await getAllApps(app_type as AppType | undefined);
      const meta = getRegistryMeta();

      // AND-combine all active filters
      const results = allApps.filter((app) => {
        if (ios_version      && app.ios_version      !== ios_version)      return false;
        if (android_version  && app.android_version  !== android_version)  return false;
        if (status           && app.status           !== status)           return false;
        if (ios_store_status && app.app_store_state  !== ios_store_status) return false;
        if (business_type    && app.team_name.toLowerCase() !== business_type.toLowerCase()) return false;
        return true;
      });

      const total = results.length;
      const shown = results.slice(0, limit);

      if (shown.length === 0) {
        const filterDesc = buildFilterDesc({ ios_version, android_version, status, ios_store_status, app_type, business_type });
        return {
          content: [
            {
              type: "text" as const,
              text: `No apps found matching: ${filterDesc || "no filters"}`,
            },
          ],
        };
      }

      // Build table
      const header = [
        "#".padStart(4),
        "Bundle ID".padEnd(52),
        "Name".padEnd(38),
        "iOS Ver".padEnd(8),
        "Android Ver".padEnd(12),
        "Status".padEnd(18),
        "Store".padEnd(14),
        "Type".padEnd(10),
        "Business",
      ].join(" | ");

      const divider = "-".repeat(header.length);

      const rows = shown.map((app, i) =>
        [
          String(i + 1).padStart(4),
          app.bundle_id.padEnd(52),
          app.display_name.padEnd(38),
          (app.ios_version || "—").padEnd(8),
          (app.android_version || "—").padEnd(12),
          (app.status || "—").padEnd(18),
          (app.app_store_state || "—").padEnd(14),
          app.app_type.padEnd(10),
          app.team_name,
        ].join(" | ")
      );

      const filterDesc = buildFilterDesc({ ios_version, android_version, status, ios_store_status, app_type, business_type });
      const truncNote = total > limit ? `  (showing first ${limit} of ${total})` : "";

      const lines = [
        `${total} app${total !== 1 ? "s" : ""} found — filters: [${filterDesc || "none"}]${truncNote}`,
        `Data as of: ${meta.loadedAt ?? "unknown"}`,
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

/** Builds a human-readable filter summary string. */
function buildFilterDesc(filters: {
  ios_version?: string;
  android_version?: string;
  status?: string;
  ios_store_status?: string;
  app_type?: string;
  business_type?: string;
}): string {
  const parts: string[] = [];
  if (filters.ios_version)      parts.push(`iOS=${filters.ios_version}`);
  if (filters.android_version)  parts.push(`Android=${filters.android_version}`);
  if (filters.status)           parts.push(`status=${filters.status}`);
  if (filters.ios_store_status) parts.push(`storeStatus=${filters.ios_store_status}`);
  if (filters.app_type)         parts.push(`type=${filters.app_type}`);
  if (filters.business_type)    parts.push(`business=${filters.business_type}`);
  return parts.join(", ");
}
