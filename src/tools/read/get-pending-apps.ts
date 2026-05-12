/**
 * Tool: get_pending_apps
 *
 * Returns apps that are stuck in one of the publishing queues:
 *   - PendingPublishList     — queued for publish but not yet triggered
 *   - PendingAppleSubmission — submitted to Apple, awaiting review
 *   - PendingAppleAgreement  — blocked on an Apple legal agreement
 *   - PendingGooglePlayKey   — missing or expired Google Play service account key
 *
 * Auth required: Admin Panel API key (ADMIN_PANEL_API_KEY + ADMIN_PANEL_DOMAIN)
 *
 * Example prompts:
 *   - "What apps are stuck in pending queues?"
 *   - "Show me all apps pending Apple review"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";

const PENDING_QUEUES = [
  "PendingPublishList",
  "PendingAppleSubmission",
  "PendingAppleAgreement",
  "PendingGooglePlayKey",
] as const;

type PendingQueue = (typeof PENDING_QUEUES)[number];

export function registerGetPendingApps(server: McpServer): void {
  server.tool(
    "get_pending_apps",
    "List all CBA apps that are stuck in a pending queue (publish, Apple review, agreement, or missing Google key).",
    {
      queue: z
        .enum(PENDING_QUEUES)
        .optional()
        .describe(
          "Filter to a specific queue. Omit to see all pending apps across every queue."
        ),
    },
    async ({ queue }: { queue?: PendingQueue }) => {
      validateAdminPanelAuth();

      // TODO (Phase 3): Query app registry for apps in the specified queue(s)
      return {
        content: [
          {
            type: "text" as const,
            text: [
              "✓ Auth check passed (ADMIN_PANEL_API_KEY is configured).",
              "",
              `get_pending_apps — implementation pending (Phase 3).`,
              `  queue filter: ${queue ?? "all queues"}`,
              "",
              "Will return apps grouped by queue:",
              "  PendingPublishList | PendingAppleSubmission",
              "  PendingAppleAgreement | PendingGooglePlayKey",
            ].join("\n"),
          },
        ],
      };
    }
  );
}
