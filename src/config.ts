/**
 * Central configuration module.
 *
 * Reads all environment variables, applies defaults, and exposes a
 * single typed `config` object consumed throughout the application.
 * Call `logConfigStatus()` at startup to surface any missing keys.
 */

import "dotenv/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Config {
  /** MCP transport mode: "stdio" for local agents, "http" for remote agents */
  transport: "stdio" | "http";
  /** HTTP server port — only relevant when transport === "http" */
  port: number;

  // ── Admin Panel ─────────────────────────────────
  adminPanelApiKey: string | undefined;
  adminPanelDomain: string | undefined;

  // ── Bitrise ─────────────────────────────────────
  bitriseToken: string | undefined;

  // ── Jenkins ─────────────────────────────────────
  jenkinsUrl: string | undefined;
  jenkinsUser: string | undefined;
  jenkinsApiKey: string | undefined;

  // ── AWS / S3 ────────────────────────────────────
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

  adminPanelApiKey: process.env.ADMIN_PANEL_API_KEY,
  adminPanelDomain: process.env.ADMIN_PANEL_DOMAIN,

  bitriseToken: process.env.BITRISE_TOKEN,

  jenkinsUrl: process.env.JENKINS_URL,
  jenkinsUser: process.env.JENKINS_USER,
  jenkinsApiKey: process.env.JENKINS_API_KEY,

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
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: "ADMIN_PANEL_API_KEY (read tools)", ok: !!config.adminPanelApiKey },
    { label: "ADMIN_PANEL_DOMAIN   (read tools)", ok: !!config.adminPanelDomain },
    { label: "BITRISE_TOKEN        (action tools)", ok: !!config.bitriseToken },
    {
      label: "JENKINS credentials  (action tools)",
      ok: !!(config.jenkinsUrl && config.jenkinsUser && config.jenkinsApiKey),
    },
    {
      label: "AWS credentials      (data layer)",
      ok: !!(config.awsAccessKeyId && config.awsSecretAccessKey),
    },
    {
      label: "S3 path              (data layer)",
      ok: !!(config.s3Bucket && config.s3Key),
    },
  ];

  const pad = (s: string) => s.padEnd(44);
  console.error("[cba-mcp] Credential status:");
  for (const { label, ok } of checks) {
    console.error(`  ${ok ? "✓" : "✗"} ${pad(label)} ${ok ? "configured" : "MISSING"}`);
  }
  console.error("");
}
