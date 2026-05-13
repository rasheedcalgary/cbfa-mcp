/**
 * Central configuration module.
 *
 * Environment variable ownership:
 *
 *   FROM SERVER .env (operator-managed infra — never exposed to users):
 *     TRANSPORT, PORT, ADMIN_PANEL_DOMAIN,
 *     BITRISE_TOKEN, JENKINS_URL, JENKINS_USER, JENKINS_API_KEY,
 *     AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET, S3_KEY
 *
 *   FROM USER'S mcp.json env block (the only thing end users configure):
 *     ADMIN_PANEL_API_KEY
 *
 * dotenv loads the server .env first. The user's ADMIN_PANEL_API_KEY arrives
 * via the mcp.json env block and is merged in by the agent runtime — no conflict.
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { config as dotenvConfig } from "dotenv";

// ─── Load .env ────────────────────────────────────────────────────────────────
// Must run before the config object below reads process.env.
// We derive the path from import.meta.url (= dist/index.js in the bundle) so
// it resolves correctly regardless of the shell's working directory — important
// when Cursor / Claude Desktop spawns the server as an absolute path:
//   node /abs/path/cbfa-mcp/dist/index.js
const __envDir = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__envDir, "../.env") });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Config {
  /** MCP transport mode — set in server .env. "stdio" (default) or "http". */
  transport: "stdio" | "http";
  /** HTTP port — set in server .env. Only used when transport === "http". */
  port: number;

  // ── Admin Panel ─────────────────────────────────
  /** User-supplied via mcp.json env block. The only user-facing credential. */
  adminPanelApiKey: string | undefined;
  /** Operator-supplied via server .env. Base URL for the Admin Panel API. */
  adminPanelDomain: string | undefined;

  // ── Bitrise — operator-supplied via server .env ──
  bitriseToken: string | undefined;
  /**
   * Bitrise app slug for the CBA app. All iOS builds run under this app.
   * Find it in Bitrise → App → Code → App Slug, or the app's URL:
   *   https://app.bitrise.io/app/{BITRISE_APP_SLUG}
   */
  bitriseAppSlug: string | undefined;

  // ── Jenkins — operator-supplied via server .env ──
  jenkinsUrl: string | undefined;
  jenkinsUser: string | undefined;
  jenkinsApiKey: string | undefined;

  // ── CircleCI — operator-supplied via server .env ─
  /** CircleCI personal API token. Used for Glofox CBA build debugging. */
  circleCiToken: string | undefined;

  // ── AWS / S3 — operator-supplied via server .env ─
  awsAccessKeyId: string | undefined;
  awsSecretAccessKey: string | undefined;
  awsRegion: string;
  s3Bucket: string | undefined;
  s3Key: string | undefined;
}

// ─── Config Object ────────────────────────────────────────────────────────────

export const config: Config = {
  transport: (process.env.TRANSPORT as "stdio" | "http") ?? "stdio",
  port: parseInt(process.env.PORT ?? "3000", 10),

  adminPanelApiKey: process.env.ADMIN_PANEL_API_KEY,   // user-supplied
  adminPanelDomain: process.env.ADMIN_PANEL_DOMAIN,    // server .env

  bitriseToken: process.env.BITRISE_TOKEN,
  bitriseAppSlug: process.env.BITRISE_APP_SLUG,

  jenkinsUrl: process.env.JENKINS_URL,
  jenkinsUser: process.env.JENKINS_USER,
  jenkinsApiKey: process.env.JENKINS_API_KEY,

  circleCiToken: process.env.CIRCLE_CI_TOKEN,

  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  s3Bucket: process.env.S3_BUCKET,
  s3Key: process.env.S3_KEY,
};

// ─── Startup Diagnostics ─────────────────────────────────────────────────────

/**
 * Logs a human-readable credential status summary to stderr at startup.
 * Uses stderr so it doesn't pollute the MCP stdio JSON stream.
 */
export function logConfigStatus(): void {
  const infraChecks: Array<{ label: string; ok: boolean }> = [
    { label: "ADMIN_PANEL_DOMAIN   (server .env)", ok: !!config.adminPanelDomain },
    { label: "BITRISE_TOKEN        (server .env)", ok: !!config.bitriseToken },
    { label: "BITRISE_APP_SLUG     (server .env)", ok: !!config.bitriseAppSlug },
    { label: "JENKINS credentials  (server .env)", ok: !!(config.jenkinsUrl && config.jenkinsUser && config.jenkinsApiKey) },
    { label: "CIRCLE_CI_TOKEN      (server .env)", ok: !!config.circleCiToken },
    { label: "AWS credentials      (server .env)", ok: !!(config.awsAccessKeyId && config.awsSecretAccessKey) },
    { label: "S3 path              (server .env)", ok: !!(config.s3Bucket && config.s3Key) },
  ];

  const pad = (s: string) => s.padEnd(44);

  console.error("[cba-mcp] Server infra credentials (.env):");
  for (const { label, ok } of infraChecks) {
    console.error(`  ${ok ? "✓" : "✗"} ${pad(label)} ${ok ? "configured" : "MISSING"}`);
  }

  console.error("");
}
