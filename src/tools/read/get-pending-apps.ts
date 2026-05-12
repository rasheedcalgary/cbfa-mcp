/**
 * Tool: get_pending_apps
 *
 * Returns apps that are stuck in a publishing queue.
 * Matches against app_store_state / android_store_state using case-insensitive
 * keyword matching, plus explicit key-validity checks for PendingGooglePlayKey.
 *
 * Queue → matching logic:
 *   PendingPublishList     → app_store_state or android_store_state contains "pending"
 *                            but NOT "submission" or "agreement"
 *   PendingAppleSubmission → app_store_state contains "waiting for review"
 *                            OR "pending apple submission"
 *   PendingAppleAgreement  → app_store_state contains "pending agreement"
 *                            OR "pending contract"
 *   PendingGooglePlayKey   → google_key_valid is not a truthy value ("true" / "yes" / "valid")
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "What apps are stuck in pending queues?"
 *   - "Show me all apps pending Apple review"
 *   - "Which apps have a missing Google Play key?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAllApps } from "../../data/appRegistry.js";
import type { AppRecord } from "../../types/index.js";

const PENDING_QUEUES = [
  "PendingPublishList",
  "PendingAppleSubmission",
  "PendingAppleAgreement",
  "PendingGooglePlayKey",
] as const;

type PendingQueue = (typeof PENDING_QUEUES)[number];

/** Returns true if the value indicates a valid key (truthy strings). */
function isKeyValid(val: string): boolean {
  const v = val.toLowerCase().trim();
  return v === "true" || v === "yes" || v === "valid" || v === "1";
}

/** Classifies an app into whichever pending queues it belongs to. */
function getPendingQueues(app: AppRecord): PendingQueue[] {
  const iosState = app.app_store_state.toLowerCase();
  const androidState = app.android_store_state.toLowerCase();
  const queues: PendingQueue[] = [];

  // PendingAppleSubmission — in Apple's review pipeline
  if (
    iosState.includes("waiting for review") ||
    iosState.includes("in review") ||
    iosState.includes("pending apple submission") ||
    iosState.includes("pending developer release")
  ) {
    queues.push("PendingAppleSubmission");
  }

  // PendingAppleAgreement — blocked on a legal/contract issue
  if (
    iosState.includes("pending agreement") ||
    iosState.includes("pending contract") ||
    iosState.includes("removed from sale")
  ) {
    queues.push("PendingAppleAgreement");
  }

  // PendingPublishList — queued on Trainerize side, not yet submitted
  if (
    (iosState.includes("pending") || androidState.includes("pending")) &&
    queues.length === 0
  ) {
    queues.push("PendingPublishList");
  }

  // PendingGooglePlayKey — missing or invalid Google Play service account key
  if (app.google_key_valid && !isKeyValid(app.google_key_valid)) {
    queues.push("PendingGooglePlayKey");
  }

  return queues;
}

function formatAppRow(app: AppRecord): string {
  return `  ${app.bundle_id.padEnd(50)} ${app.display_name.padEnd(30)} (${app.app_type})`;
}

export function registerGetPendingApps(server: McpServer): void {
  server.tool(
    "get_pending_apps",
    "List all CBA apps stuck in a publishing queue — pending publish, Apple review, Apple agreement, or missing Google Play key.",
    {
      queue: z
        .enum(PENDING_QUEUES)
        .optional()
        .describe("Filter to a specific queue. Omit to see all pending apps across every queue."),
    },
    async ({ queue }: { queue?: PendingQueue }) => {
      validateAdminPanelAuth();

      const allApps = await getAllApps();

      // Map each app to its pending queues
      const classified = allApps
        .map((app) => ({ app, queues: getPendingQueues(app) }))
        .filter(({ queues }) => queues.length > 0);

      const queuesToShow: PendingQueue[] = queue ? [queue] : [...PENDING_QUEUES];
      const lines: string[] = [];

      let totalFound = 0;

      for (const q of queuesToShow) {
        const appsInQueue = classified
          .filter(({ queues }) => queues.includes(q))
          .map(({ app }) => app);

        lines.push(`${q} (${appsInQueue.length})`);
        lines.push("─".repeat(50));

        if (appsInQueue.length === 0) {
          lines.push("  No apps in this queue.");
        } else {
          for (const app of appsInQueue) {
            lines.push(formatAppRow(app));
          }
          totalFound += appsInQueue.length;
        }
        lines.push("");
      }

      const summary = queue
        ? `${totalFound} app${totalFound !== 1 ? "s" : ""} in queue: ${queue}`
        : `${totalFound} app${totalFound !== 1 ? "s" : ""} across all pending queues`;

      return {
        content: [
          {
            type: "text" as const,
            text: [summary, "", ...lines].join("\n"),
          },
        ],
      };
    }
  );
}
