/**
 * Tool: check_cert_validity
 *
 * Checks Apple push notification certificate and provisioning profile validity
 * for one app or a filtered set of apps, using data from GetNativeAppGroupSettings.
 *
 * Modes:
 *   Single  — provide `bundle_id` → full cert details for one app
 *   Bulk    — omit `bundle_id`, optionally filter by `app_type` / `business_type`
 *             → scan up to `limit` apps, return those expiring within
 *             `expires_within_days` (default 60) or already expired
 *
 * Data source: GET /v03/CBA/GetNativeAppGroupSettings
 * Fields used: pushNotificationExpiryDate, profileName, profileUUID,
 *              teamID, itcTeamID, appStoreApiKey, issuerID, appleStoreAccount
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "Check cert validity for com.trainerize.peakfitness"
 *   - "Which enterprise apps have expiring push certs?"
 *   - "Show me all ABC studio apps with certs expiring in the next 30 days"
 *   - "Are there any expired push certs?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAllApps, getAppByBundleId } from "../../data/appRegistry.js";
import { getNativeAppGroupSettings } from "../../clients/admin-panel.js";
import type { NativeAppGroupSettings, AppType } from "../../types/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Days remaining until a date string, or null if unparseable. */
function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
}

type CertHealth = "✅ Healthy" | "⚠️  Warning" | "🔴 Critical" | "💀 Expired" | "— Unknown";

function certHealth(days: number | null): CertHealth {
  if (days === null) return "— Unknown";
  if (days < 0)   return "💀 Expired";
  if (days <= 30)  return "🔴 Critical";
  if (days <= 60)  return "⚠️  Warning";
  return "✅ Healthy";
}

function val(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined || v === "" || v === 0) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/** Format a single app's cert block (used in both modes). */
function formatCertBlock(
  bundleId: string,
  displayName: string,
  s: NativeAppGroupSettings
): string {
  const days = daysUntil(s.pushNotificationExpiryDate);
  const health = certHealth(days);
  const daysLabel =
    days === null ? "" : days < 0 ? ` (${Math.abs(days)}d ago)` : ` (${days}d remaining)`;

  return [
    `${displayName} — ${bundleId}`,
    `  Push Cert:    ${health}  ${val(s.pushNotificationExpiryDate)}${daysLabel}`,
    `  Profile:      ${val(s.profileName)}`,
    `  Profile UUID: ${val(s.profileUUID)}`,
    `  Apple Acct:   ${val(s.appleStoreAccount)}`,
    `  Team ID:      ${val(s.teamID)}   ITC Team: ${val(s.itcTeamID)}`,
    `  API Key Set:  ${s.appStoreApiKey ? "yes" : "no"}   Issuer ID: ${val(s.issuerID)}`,
  ].join("\n");
}

// ─── Concurrency-limited batch helper ─────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value !== null) results.push(r.value);
    }
  }
  return results;
}

// ─── Tool registration ─────────────────────────────────────────────────────────

export function registerCheckCertValidity(server: McpServer): void {
  server.tool(
    "check_cert_validity",
    [
      "Check Apple push certificate and provisioning profile validity.",
      "Single mode: provide bundle_id for a detailed report on one app.",
      "Bulk mode: omit bundle_id — scans filtered apps for certs expiring within",
      "expires_within_days (default 60) or already expired.",
    ].join(" "),
    {
      bundle_id: z
        .string()
        .optional()
        .describe("Bundle ID for single-app check. Omit to scan multiple apps."),
      app_type: z
        .enum(["enterprise", "studio", "pro", "abc"])
        .optional()
        .describe("Filter bulk scan by app type."),
      business_type: z
        .string()
        .optional()
        .describe('Filter bulk scan by business — "ABC" or "Trainerize" (case-insensitive).'),
      expires_within_days: z
        .number()
        .int()
        .min(0)
        .default(60)
        .describe("Bulk mode: include certs expiring within this many days (default 60). Use 0 to show only already-expired."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max apps to scan in bulk mode (default 50, max 100)."),
    },
    async ({ bundle_id, app_type, business_type, expires_within_days, limit }) => {
      validateAdminPanelAuth();

      // ── SINGLE APP MODE ──────────────────────────────────────────────────────
      if (bundle_id) {
        const app = await getAppByBundleId(bundle_id);
        const groupId = parseInt(app.group_id, 10);
        if (isNaN(groupId)) {
          return {
            content: [{
              type: "text" as const,
              text: `No Group ID found for ${bundle_id} — cannot fetch cert data.`,
            }],
          };
        }

        const { settings } = await getNativeAppGroupSettings(groupId);
        const days = daysUntil(settings.pushNotificationExpiryDate);
        const health = certHealth(days);

        const lines = [
          `Push Certificate & Profile — ${app.display_name} (${bundle_id})`,
          "═".repeat(64),
          "",
          `  Status:       ${health}`,
          `  Expiry Date:  ${val(settings.pushNotificationExpiryDate)}`,
          `  Days Left:    ${days === null ? "unknown" : days < 0 ? `EXPIRED ${Math.abs(days)}d ago` : `${days}d`}`,
          "",
          "PROVISIONING PROFILE",
          `  Name:         ${val(settings.profileName)}`,
          `  UUID:         ${val(settings.profileUUID)}`,
          "",
          "APP STORE CONNECT",
          `  Apple Acct:   ${val(settings.appleStoreAccount)}`,
          `  Team ID:      ${val(settings.teamID)}`,
          `  ITC Team ID:  ${val(settings.itcTeamID)}`,
          `  API Key Set:  ${settings.appStoreApiKey ? "yes" : "no"}`,
          `  Issuer ID:    ${val(settings.issuerID)}`,
          "",
          "SUBMISSION FLAGS",
          `  Publish After Approve: ${val(settings.publishAfterApprove)}`,
          `  Submit For Review:     ${val(settings.submitForReview)}`,
          `  Skip Metadata:         ${val(settings.skipMetadata)}`,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      // ── BULK SCAN MODE ───────────────────────────────────────────────────────
      let apps = await getAllApps();

      // Apply filters
      if (app_type)      apps = apps.filter(a => a.app_type === app_type);
      if (business_type) apps = apps.filter(a =>
        a.team_name.toLowerCase() === business_type.toLowerCase()
      );

      // Only scan apps with a valid group ID and non-deactivated status
      const scannable = apps
        .filter(a => a.status.toLowerCase() !== "deactivated" && a.group_id)
        .slice(0, limit);

      if (scannable.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "No apps matched the filter criteria for cert scanning.",
          }],
        };
      }

      interface ScanResult {
        bundleId: string;
        displayName: string;
        days: number | null;
        health: CertHealth;
        settings: NativeAppGroupSettings;
      }

      // Fetch certs in batches of 5 concurrent requests
      const scanResults = await mapWithConcurrency(
        scannable,
        5,
        async (app): Promise<ScanResult | null> => {
          const groupId = parseInt(app.group_id, 10);
          if (isNaN(groupId)) return null;
          try {
            const { settings } = await getNativeAppGroupSettings(groupId);
            const days = daysUntil(settings.pushNotificationExpiryDate);
            // Include if expired OR expiring within threshold
            if (days !== null && days > expires_within_days) return null;
            return {
              bundleId: app.bundle_id,
              displayName: app.display_name,
              days,
              health: certHealth(days),
              settings,
            };
          } catch {
            return null;
          }
        }
      );

      if (scanResults.length === 0) {
        const filterDesc = [
          app_type      ? `type=${app_type}`           : null,
          business_type ? `business=${business_type}`  : null,
        ].filter(Boolean).join(", ");
        return {
          content: [{
            type: "text" as const,
            text: [
              `✅ All scanned apps have healthy push certs (>${expires_within_days}d remaining).`,
              filterDesc ? `Filters: ${filterDesc}` : "",
              `Scanned ${scannable.length} apps.`,
            ].filter(Boolean).join("\n"),
          }],
        };
      }

      // Sort: expired first, then by days ascending
      scanResults.sort((a, b) => {
        const da = a.days ?? 9999;
        const db = b.days ?? 9999;
        return da - db;
      });

      // Tally by severity
      const expired  = scanResults.filter(r => (r.days ?? 0) < 0).length;
      const critical = scanResults.filter(r => r.days !== null && r.days >= 0 && r.days <= 30).length;
      const warning  = scanResults.filter(r => r.days !== null && r.days > 30 && r.days <= 60).length;
      const unknown  = scanResults.filter(r => r.days === null).length;

      const filterDesc = [
        app_type      ? `type=${app_type}`           : null,
        business_type ? `business=${business_type}`  : null,
      ].filter(Boolean).join(", ");

      const header = [
        `Push Cert Scan — ${scanResults.length} app(s) need attention`,
        filterDesc ? `Filters: ${filterDesc}` : null,
        `Scanned: ${scannable.length} apps   Threshold: ≤${expires_within_days}d`,
        `💀 Expired: ${expired}   🔴 Critical (≤30d): ${critical}   ⚠️ Warning (≤60d): ${warning}   — Unknown: ${unknown}`,
        "═".repeat(64),
        "",
      ].filter(v => v !== null).join("\n");

      const body = scanResults
        .map(r => formatCertBlock(r.bundleId, r.displayName, r.settings))
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: `${header}\n${body}` }],
      };
    }
  );
}
