/**
 * Tool: get_stale_apps
 *
 * Finds apps that haven't been updated on iOS or Android (or both)
 * within a configurable number of days.
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "Which enterprise apps haven't been updated in 6 months?"
 *   - "Show me stale studio apps older than 90 days"
 *   - "List apps stale on both platforms"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAllApps } from "../../data/appRegistry.js";
import type { AppType, AppRecord } from "../../types/index.js";

/** Days since a date string; returns Infinity if unparseable (always stale). */
function daysSince(dateStr: string): number {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function fmtDays(d: number): string {
  return isFinite(d) ? `${d}d ago` : "unknown";
}

interface StaleEntry {
  app: AppRecord;
  iosDays: number;
  androidDays: number;
  reason: string;
}

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
        .describe("Limit check to a specific app type. Omit for all types."),
      platform: z
        .enum(["ios", "android", "either", "both"])
        .default("either")
        .describe(
          "'either' = stale on at least one platform (default). 'both' = stale on both platforms."
        ),
    },
    async ({ days_threshold, app_type, platform }) => {
      validateAdminPanelAuth();

      const apps = await getAllApps(app_type as AppType | undefined);

      const staleEntries: StaleEntry[] = [];

      for (const app of apps) {
        const iosDays = daysSince(app.last_ios_updated);
        const androidDays = daysSince(app.last_android_updated);

        const iosStale = iosDays > days_threshold;
        const androidStale = androidDays > days_threshold;

        let isStale = false;
        let reason = "";

        if (platform === "ios") {
          isStale = iosStale;
          reason = `iOS stale (${fmtDays(iosDays)})`;
        } else if (platform === "android") {
          isStale = androidStale;
          reason = `Android stale (${fmtDays(androidDays)})`;
        } else if (platform === "both") {
          isStale = iosStale && androidStale;
          reason = `iOS (${fmtDays(iosDays)}) + Android (${fmtDays(androidDays)}) both stale`;
        } else {
          // "either" — default
          isStale = iosStale || androidStale;
          const parts: string[] = [];
          if (iosStale) parts.push(`iOS ${fmtDays(iosDays)}`);
          if (androidStale) parts.push(`Android ${fmtDays(androidDays)}`);
          reason = parts.join(", ");
        }

        if (isStale) {
          staleEntries.push({ app, iosDays, androidDays, reason });
        }
      }

      // Sort by worst staleness (max of ios/android days, descending)
      staleEntries.sort(
        (a, b) =>
          Math.max(b.iosDays, b.androidDays) - Math.max(a.iosDays, a.androidDays)
      );

      if (staleEntries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No stale apps found${app_type ? ` for type "${app_type}"` : ""} with threshold ${days_threshold} days.`,
            },
          ],
        };
      }

      const header = [
        "Bundle ID".padEnd(50),
        "Display Name".padEnd(30),
        "iOS Last Updated".padEnd(18),
        "Android Last Updated".padEnd(22),
        "Reason",
      ].join(" | ");

      const divider = "-".repeat(header.length);

      const rows = staleEntries.map(({ app, reason }) =>
        [
          app.bundle_id.padEnd(50),
          app.display_name.padEnd(30),
          (app.last_ios_updated || "—").padEnd(18),
          (app.last_android_updated || "—").padEnd(22),
          reason,
        ].join(" | ")
      );

      const lines = [
        `${staleEntries.length} stale app${staleEntries.length !== 1 ? "s" : ""} found (threshold: ${days_threshold} days, platform: ${platform}${app_type ? `, type: ${app_type}` : ""})`,
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
