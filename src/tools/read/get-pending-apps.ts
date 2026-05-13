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
import { toCSV } from "../../utils/csv.js";
import type { AppRecord } from "../../types/index.js";

const PENDING_QUEUES = [
  "PendingPublishList",
  "PendingAppleSubmission",
  "PendingAppleAgreement",
  "MissingIOSMembership",
  "PendingGooglePlayKey",
] as const;

type PendingQueue = (typeof PENDING_QUEUES)[number];


/** Classifies an app into whichever pending queues it belongs to. */
function getPendingQueues(app: AppRecord): PendingQueue[] {
  const cbaStatus = app.status; // Published | WaitingForArtwork | Notified | Submitted |
                                // PendingPublish | ReceivedArtifacts | Deactivated
  const queues: PendingQueue[] = [];

  // PendingAppleSubmission — submitted to Apple, awaiting review
  if (cbaStatus === "Submitted" || cbaStatus === "ReceivedArtifacts") {
    queues.push("PendingAppleSubmission");
  }

  // PendingAppleAgreement — notified (waiting on Trainerize/Apple agreement step)
  if (cbaStatus === "Notified") {
    queues.push("PendingAppleAgreement");
  }

  // MissingIOSMembership — Apple Developer Program membership issue (AgreementIsMissing, Expired, etc.)
  if (app.ios_membership && app.ios_membership.toLowerCase() !== "active" && app.ios_membership.trim() !== "") {
    queues.push("MissingIOSMembership");
  }

  // PendingPublishList — queued on Trainerize side, not yet pushed to Apple
  if (cbaStatus === "PendingPublish" || cbaStatus === "WaitingForArtwork") {
    queues.push("PendingPublishList");
  }

  // PendingGooglePlayKey — no Play Store account configured
  if (!app.google_key_valid || app.google_key_valid.trim() === "") {
    queues.push("PendingGooglePlayKey");
  }

  return queues;
}

function formatAppRow(app: AppRecord): string {
  const membership = app.ios_membership ? ` [${app.ios_membership}]` : "";
  return `  ${app.bundle_id.padEnd(50)} ${app.display_name.padEnd(30)} (${app.app_type})${membership}`;
}

export function registerGetPendingApps(server: McpServer): void {
  server.tool(
    "get_pending_apps",
    "List all CBA apps stuck in a publishing queue — pending publish, Apple review, Apple agreement, missing iOS membership (AgreementIsMissing), or missing Google Play key.",
    {
      queue: z
        .enum(PENDING_QUEUES)
        .optional()
        .describe("Filter to a specific queue. Omit to see all pending apps across every queue."),
      format: z
        .enum(["table", "csv"])
        .default("table")
        .describe("Output format. 'table' (default) or 'csv' for a downloadable report."),
    },
    async ({ queue, format }: { queue?: PendingQueue; format: "table" | "csv" }) => {
      validateAdminPanelAuth();

      const allApps = await getAllApps();

      // Map each app to its pending queues
      const classified = allApps
        .map((app) => ({ app, queues: getPendingQueues(app) }))
        .filter(({ queues }) => queues.length > 0);

      const queuesToShow: PendingQueue[] = queue ? [queue] : [...PENDING_QUEUES];

      // ── CSV output ───────────────────────────────────────────────────────
      if (format === "csv") {
        const headers = ["bundle_id", "display_name", "app_type", "ios_membership", "queues"];
        const csvRows = classified.flatMap(({ app, queues }) => {
          const filtered = queue ? queues.filter((q) => q === queue) : queues;
          if (filtered.length === 0) return [];
          return [[app.bundle_id, app.display_name, app.app_type, app.ios_membership, filtered.join("|")]];
        });
        const qLabel = queue ?? "all queues";
        return {
          content: [{
            type: "text" as const,
            text: `# Pending Apps Report — ${qLabel}\n# Generated: ${new Date().toISOString()}\n\n${toCSV(headers, csvRows)}`,
          }],
        };
      }

      // ── Table output ─────────────────────────────────────────────────────
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
