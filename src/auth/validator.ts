/**
 * Authentication validator.
 *
 * Each function checks that the credentials required for a specific
 * service are present in the environment. If not, it throws a
 * descriptive McpError so the agent receives an actionable message
 * instead of a silent failure.
 *
 * Call the appropriate validator at the TOP of every tool handler,
 * before any API work begins.
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";

// ─── Read Tools (Admin Panel) ─────────────────────────────────────────────────

/**
 * Validates Admin Panel credentials.
 * Required by all read tools: list_apps, get_app_info, get_ios_status,
 * get_android_status, get_app_last_updated, get_pending_apps, get_stale_apps.
 */
export function validateAdminPanelAuth(): void {
  const missing: string[] = [];

  if (!config.adminPanelApiKey) missing.push("ADMIN_PANEL_API_KEY");
  if (!config.adminPanelDomain) missing.push("ADMIN_PANEL_DOMAIN");

  if (missing.length === 0) return;

  throw new McpError(
    ErrorCode.InvalidRequest,
    [
      `Authentication failed — missing Admin Panel credentials: ${missing.join(", ")}.`,
      "",
      "Read tools (list_apps, get_app_info, get_ios_status, etc.) require access to the",
      "Trainerize Admin Panel API. Set the following in your .env or mcp.json env block:",
      "",
      "  ADMIN_PANEL_API_KEY=your-api-key",
      "  ADMIN_PANEL_DOMAIN=https://your-admin-panel.trainerize.com",
      "",
      "See .env.example for the full template.",
    ].join("\n")
  );
}

// ─── Action Tools (Bitrise) ───────────────────────────────────────────────────

/**
 * Validates Bitrise credentials.
 * Required by action tools when provider === "bitrise".
 */
export function validateBitriseAuth(): void {
  if (config.bitriseToken) return;

  throw new McpError(
    ErrorCode.InvalidRequest,
    [
      "Authentication failed — BITRISE_TOKEN is not configured.",
      "",
      "Bitrise action tools (trigger_app_build, get_build_status) require a",
      "Personal Access Token from your Bitrise account.",
      "",
      "How to get one:",
      "  1. Log in to bitrise.io",
      "  2. Go to Profile → Security → Personal Access Tokens",
      "  3. Generate a new token with build read/write permissions",
      "",
      "Then set it in your .env or mcp.json env block:",
      "  BITRISE_TOKEN=your-token-here",
    ].join("\n")
  );
}

// ─── Action Tools (Jenkins) ───────────────────────────────────────────────────

/**
 * Validates Jenkins credentials.
 * Required by action tools when provider === "jenkins".
 */
export function validateJenkinsAuth(): void {
  const missing: string[] = [];

  if (!config.jenkinsUrl) missing.push("JENKINS_URL");
  if (!config.jenkinsUser) missing.push("JENKINS_USER");
  if (!config.jenkinsApiKey) missing.push("JENKINS_API_KEY");

  if (missing.length === 0) return;

  throw new McpError(
    ErrorCode.InvalidRequest,
    [
      `Authentication failed — missing Jenkins credentials: ${missing.join(", ")}.`,
      "",
      "Jenkins action tools require HTTP Basic Auth against your Jenkins instance.",
      "",
      "How to get a Jenkins API key:",
      "  1. Log in to your Jenkins instance",
      "  2. Go to <your-username> → Configure → API Token → Add new Token",
      "",
      "Then set the following in your .env or mcp.json env block:",
      "  JENKINS_URL=https://your-jenkins.example.com",
      "  JENKINS_USER=your-username",
      "  JENKINS_API_KEY=your-api-token",
    ].join("\n")
  );
}

// ─── Data Layer (AWS / S3) ────────────────────────────────────────────────────

/**
 * Validates AWS credentials and S3 path.
 * Required by the data layer when fetching the CSV dump from S3.
 */
export function validateAwsAuth(): void {
  const missing: string[] = [];

  if (!config.awsAccessKeyId) missing.push("AWS_ACCESS_KEY_ID");
  if (!config.awsSecretAccessKey) missing.push("AWS_SECRET_ACCESS_KEY");
  if (!config.s3Bucket) missing.push("S3_BUCKET");
  if (!config.s3Key) missing.push("S3_KEY");

  if (missing.length === 0) return;

  throw new McpError(
    ErrorCode.InvalidRequest,
    [
      `Authentication failed — missing AWS/S3 credentials: ${missing.join(", ")}.`,
      "",
      "The data layer downloads the CBA app dump from an S3 bucket.",
      "Credentials need read-only S3 access to the cbfa-scripts bucket.",
      "",
      "Set the following in your .env or mcp.json env block:",
      "  AWS_ACCESS_KEY_ID=your-key-id",
      "  AWS_SECRET_ACCESS_KEY=your-secret",
      "  AWS_REGION=us-east-1",
      "  S3_BUCKET=your-bucket-name",
      "  S3_KEY=path/to/cba_apps_dump.csv",
    ].join("\n")
  );
}
