/**
 * Tool: get_build_queue
 *
 * Returns the list of CBA apps currently in a given build queue state
 * by calling GET /v03/CBA/getAppBuildQueue on the Admin Panel API.
 *
 * The raw API returns only bundle IDs; this tool cross-references them
 * against the CSV registry to show display names and app types as well.
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "What iOS apps are ready to build?"
 *   - "Which apps are currently building on Android?"
 *   - "Show me all failed iOS builds in the queue"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAppBuildQueue } from "../../clients/admin-panel.js";
import { getAllApps } from "../../data/appRegistry.js";

const BUILD_PLATFORMS = ["ios", "android"] as const;
const BUILD_STATUSES = [
  "ReadyToBuild",
  "Building",
  "Built",
  "Failed",
  "Queued",
] as const;

export function registerGetBuildQueue(server: McpServer): void {
  server.tool(
    "get_build_queue",
    "List apps currently in a CI build queue state (ReadyToBuild, Building, Built, Failed, etc.) for a given platform.",
    {
      platform: z
        .enum(BUILD_PLATFORMS)
        .describe("Platform to check: 'ios' or 'android'."),
      status: z
        .enum(BUILD_STATUSES)
        .default("ReadyToBuild")
        .describe(
          "Build queue status to filter by. Defaults to 'ReadyToBuild'."
        ),
    },
    async ({ platform, status }) => {
      validateAdminPanelAuth();

      const queueRes = await getAppBuildQueue(platform, status);
      const bundleIds: string[] = queueRes.apps ?? [];

      if (bundleIds.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No apps found in queue: platform=${platform}, status=${status}.`,
            },
          ],
        };
      }

      // Cross-reference with CSV registry for display names + types
      // (registry may not have all apps — fall back to bundle ID only)
      const allApps = await getAllApps().catch(() => []);
      const registryMap = new Map(allApps.map((a) => [a.bundle_id, a]));

      const header = [
        "Bundle ID".padEnd(50),
        "Display Name".padEnd(35),
        "Type",
      ].join(" | ");

      const divider = "-".repeat(header.length);

      const rows = bundleIds.map((id) => {
        const app = registryMap.get(id);
        return [
          id.padEnd(50),
          (app?.display_name ?? "—").padEnd(35),
          app?.app_type ?? "—",
        ].join(" | ");
      });

      const lines = [
        `${bundleIds.length} app${bundleIds.length !== 1 ? "s" : ""} — platform: ${platform}, status: ${status}`,
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
