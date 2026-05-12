/**
 * Tool: get_app_last_updated
 *
 * Returns the last iOS and Android release dates for a CBA app,
 * with a "X days ago" human label and a freshness rating.
 *
 * Freshness scale:
 *   fresh   → updated within 30 days
 *   recent  → 30–90 days
 *   aging   → 90–180 days
 *   stale   → more than 180 days
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "When was com.trainerize.peakfitness last updated?"
 *   - "How old is the iOS build of com.trainerize.peakfitness?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAppByBundleId } from "../../data/appRegistry.js";

/** Returns how many days have passed since a date string, or -1 if unparseable. */
function daysSince(dateStr: string): number {
  if (!dateStr) return -1;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return -1;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** Returns a human-readable freshness label for a given age in days. */
function freshnessLabel(days: number): string {
  if (days < 0) return "unknown";
  if (days <= 30) return "fresh";
  if (days <= 90) return "recent";
  if (days <= 180) return "aging";
  return "stale";
}

export function registerGetAppLastUpdated(server: McpServer): void {
  server.tool(
    "get_app_last_updated",
    "Get the last iOS and Android release dates for a CBA app, with freshness status.",
    {
      bundle_id: z
        .string()
        .describe("Bundle ID of the app, e.g. com.trainerize.peakfitness"),
    },
    async ({ bundle_id }) => {
      validateAdminPanelAuth();

      const app = await getAppByBundleId(bundle_id);

      const iosDays = daysSince(app.last_ios_updated);
      const androidDays = daysSince(app.last_android_updated);

      const fmtDays = (d: number) => (d >= 0 ? `${d} days ago` : "unknown");

      const lines = [
        `Last Updated — ${app.display_name} (${app.bundle_id})`,
        "─".repeat(60),
        "",
        "iOS",
        `  Last release:   ${app.last_ios_updated || "—"}`,
        `  Age:            ${fmtDays(iosDays)}`,
        `  Freshness:      ${freshnessLabel(iosDays)}`,
        `  Version:        ${app.ios_version || "—"}`,
        "",
        "Android",
        `  Last release:   ${app.last_android_updated || "—"}`,
        `  Age:            ${fmtDays(androidDays)}`,
        `  Freshness:      ${freshnessLabel(androidDays)}`,
        `  Version:        ${app.android_version || "—"}`,
        "",
        `Data dump: ${app.dump_date}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
