/**
 * Tool: get_app_info
 *
 * Returns a comprehensive view of a CBA app by combining three sources:
 *
 *   1. CSV registry  — base record (type, team, CI/CD, key validity)
 *   2. getNativeApp  — live status, planCode, groupId, store accounts
 *   3. GetNativeAppGroupSettings — deep config: push cert expiry, store links,
 *      theme settings, team IDs, CI settings, watch face, figma file, etc.
 *
 * The tool always returns CSV data. Live API data is fetched in parallel and
 * gracefully falls back (shows "unavailable") if either call fails, so a
 * network issue never causes the whole tool to error out.
 *
 * Auth required: ADMIN_PANEL_API_KEY
 *
 * Example prompts:
 *   - "Give me all info about com.trainerize.abcplus"
 *   - "What Bitrise workflow and push cert expiry does com.trainerize.abcplus use?"
 *   - "Is the push cert for com.trainerize.abcplus still valid?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";
import { getAppByBundleId } from "../../data/appRegistry.js";
import { getNativeApp, getNativeAppGroupSettings } from "../../clients/admin-panel.js";
import type { GetNativeAppResponse, NativeAppGroupSettings } from "../../types/index.js";

/** Formats a value — shows "—" for empty / falsy strings. */
function val(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/** Parses a push cert expiry string and returns a human-friendly label. */
function pushCertStatus(expiryStr: string): string {
  if (!expiryStr) return "—";
  const expiry = new Date(expiryStr);
  if (isNaN(expiry.getTime())) return expiryStr;
  const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0) return `EXPIRED (${Math.abs(daysLeft)}d ago) ⚠️`;
  if (daysLeft <= 30) return `Expires ${expiryStr} — ${daysLeft}d left ⚠️`;
  return `${expiryStr} (${daysLeft}d remaining)`;
}

export function registerGetAppInfo(server: McpServer): void {
  server.tool(
    "get_app_info",
    "Get full details for a CBA app — combines CSV registry data with live Admin API data (status, group settings, push cert expiry, store links, theme config).",
    {
      bundle_id: z
        .string()
        .describe("Reverse-DNS bundle identifier, e.g. com.trainerize.abcplus"),
    },
    async ({ bundle_id }) => {
      validateAdminPanelAuth();

      // 1. CSV registry — always available, fast
      const app = await getAppByBundleId(bundle_id);

      // 2. Live API calls — run in parallel, fail gracefully
      let liveApp: GetNativeAppResponse | null = null;
      let settings: NativeAppGroupSettings | null = null;

      const [liveAppResult, settingsResult] = await Promise.allSettled([
        getNativeApp(bundle_id),
        (async () => {
          // GetNativeAppGroupSettings needs a groupID — prefer live API's groupId,
          // fall back to CSV group_id
          const groupIdStr = app.group_id;
          const groupIdNum = groupIdStr ? parseInt(groupIdStr, 10) : NaN;
          if (isNaN(groupIdNum)) throw new Error("No groupID available");
          const res = await getNativeAppGroupSettings(groupIdNum);
          return res.settings;
        })(),
      ]);

      if (liveAppResult.status === "fulfilled") liveApp = liveAppResult.value;
      if (settingsResult.status === "fulfilled") settings = settingsResult.value;

      // ── Compose output ────────────────────────────────────────────────────
      const lines: string[] = [
        `${app.display_name} (${app.bundle_id})`,
        "═".repeat(64),
        "",
      ];

      // ── General ──────────────────────────────────────────────────────────
      lines.push(
        "GENERAL",
        `  Type:                  ${val(liveApp?.appType ?? app.app_type)}`,
        `  Status (live):         ${val(liveApp?.status)}`,
        `  Plan Code:             ${val(liveApp?.planCode)}`,
        `  Business Type:         ${val(liveApp?.businessType ?? app.abc_app_type)}`,
        `  Team:                  ${val(settings?.teamName || app.team_name)}`,
        `  Group ID:              ${val(settings?.groupID ?? app.group_id)}`,
        `  Native App ID:         ${val(settings?.nativeAppID)}`,
        `  Rebranding Status:     ${val(settings?.appRebrandStatus)}`,
        `  Created:               ${val(settings?.created)}`,
        ""
      );

      // ── iOS ───────────────────────────────────────────────────────────────
      lines.push(
        "iOS",
        `  App Store ID:          ${val(settings?.iOSID)}`,
        `  Store Link:            ${val(settings?.iOSStoreLink)}`,
        `  App Store State:       ${val(app.app_store_state)}`,
        `  Version (CSV):         ${val(app.ios_version)}`,
        `  Apple Account:         ${val(settings?.appleStoreAccount ?? app.apple_id)}`,
        `  Key Valid:             ${val(app.apple_key_valid)}`,
        `  Push Cert Expiry:      ${pushCertStatus(settings?.pushNotificationExpiryDate ?? "")}`,
        `  Last Updated (CSV):    ${val(app.last_ios_updated)}`,
        `  Team ID:               ${val(settings?.teamID)}`,
        `  ITC Team ID:           ${val(settings?.itcTeamID)}`,
        `  App Store API Key:     ${val(settings?.appStoreApiKey)}`,
        `  Issuer ID:             ${val(settings?.issuerID)}`,
        `  Profile:               ${val(settings?.profileName)} (${val(settings?.profileUUID)})`,
        `  Publish After Approve: ${val(settings?.publishAfterApprove)}`,
        `  Submit For Review:     ${val(settings?.submitForReview)}`,
        `  Skip Metadata:         ${val(settings?.skipMetadata)}`,
        ""
      );

      // ── Android ───────────────────────────────────────────────────────────
      lines.push(
        "Android",
        `  Store Link:            ${val(settings?.androidStoreLink)}`,
        `  Play Store State:      ${val(app.android_store_state)}`,
        `  Version (CSV):         ${val(app.android_version)}`,
        `  Play Account:          ${val(settings?.playStoreAccount)}`,
        `  Key Valid:             ${val(app.google_key_valid)}`,
        `  Use New Android Key:   ${val(settings?.useNewAndroidKey)}`,
        `  Android Project ID:    ${val(settings?.androidProjectID)}`,
        `  Pro Android Account:   ${val(settings?.proAndroidAccount)}`,
        `  Last Updated (CSV):    ${val(app.last_android_updated)}`,
        ""
      );

      // ── Branding / Theme ──────────────────────────────────────────────────
      lines.push(
        "BRANDING & THEME",
        `  White Label Type:      ${val(settings?.whiteLabelAppType)}`,
        `  ABC App Type:          ${val(settings?.abcAppType ?? app.abc_app_type)}`,
        `  App Bar Mode:          ${val(settings?.appBarMode)}`,
        `  Login Mode:            ${val(settings?.loginMode)}`,
        `  Sign-in Button Theme:  ${val(settings?.signinButtonTheme)}`,
        `  App Theme Mode:        ${val(settings?.appThemeMode)}`,
        `  Watch Face Download:   ${val(settings?.showWatchFaceDownload)}`,
        `  Figma File ID:         ${val(settings?.figmaFileID)}`,
        `  Market URL:            ${val(settings?.marketUrl)}`,
        ""
      );

      // ── Support / Help Links ──────────────────────────────────────────────
      lines.push(
        "SUPPORT",
        `  Support Email:         ${val(settings?.supportEmail)}`,
        `  Login Help Email:      ${val(settings?.loginHelpEmail)}`,
        `  Login Help Phone:      ${val(settings?.loginHelpPhone)}`,
        ""
      );

      // ── CI/CD ─────────────────────────────────────────────────────────────
      lines.push(
        "CI/CD",
        `  Bitrise Workflow:      ${val(app.bitrise_workflow)}`,
        ""
      );

      // ── Data freshness ────────────────────────────────────────────────────
      const csvFreshness = liveApp ? "" : " (live API unavailable — showing CSV only)";
      lines.push(`CSV dump: ${app.dump_date}${csvFreshness}`);

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
