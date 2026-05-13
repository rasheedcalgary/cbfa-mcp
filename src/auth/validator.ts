/**
 * Authentication validator.
 *
 * Credential ownership model:
 *   - ADMIN_PANEL_API_KEY  → supplied by each end user (the only user-facing credential)
 *   - Everything else      → pre-loaded by the server operator in the mcp.json env block
 *                            (S3, Bitrise, Jenkins, Admin Panel domain)
 *
 * Each function checks that its required credentials are present in the environment.
 * If not, it throws a descriptive McpError so the agent receives an actionable message.
 *
 * Call the appropriate validator at the TOP of every tool handler,
 * before any API work begins.
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";

// ─── Read Tools (Admin Panel) ─────────────────────────────────────────────────

/**
 * Validates that the user has provided their Admin Panel API key.
 * ADMIN_PANEL_DOMAIN is a server-operator concern — not checked here.
 *
 * Required by all read tools: list_apps, get_app_info, get_ios_status,
 * get_android_status, get_app_last_updated, get_pending_apps, get_stale_apps.
 */
export function validateAdminPanelAuth(): void {
  if (config.adminPanelApiKey) return;

  throw new McpError(
    ErrorCode.InvalidRequest,
    [
      "Authentication failed — ADMIN_PANEL_API_KEY is not set.",
      "",
      "Please provide your Admin Panel API key via the ADMIN_PANEL_API_KEY environment variable.",
      "All other server credentials are pre-configured — this is the only key you need to supply.",
    ].join("\n")
  );
}

// ─── Action Tools (Bitrise) ───────────────────────────────────────────────────

/**
 * Validates Bitrise credentials.
 * These are server-operator credentials, pre-loaded in mcp.json.
 * If missing it is a server configuration error, not a user error.
 */
export function validateBitriseAuth(): void {
  if (config.bitriseToken) return;

  throw new McpError(
    ErrorCode.InternalError,
    [
      "Server configuration error — BITRISE_TOKEN is not configured.",
      "",
      "This is a server-side credential that should be pre-loaded by the operator.",
      "Contact the server administrator to set BITRISE_TOKEN in the mcp.json env block.",
    ].join("\n")
  );
}

// ─── Action Tools (Jenkins) ───────────────────────────────────────────────────

/**
 * Validates Jenkins credentials.
 * These are server-operator credentials, pre-loaded in mcp.json.
 * If missing it is a server configuration error, not a user error.
 */
export function validateJenkinsAuth(): void {
  const missing: string[] = [];

  if (!config.jenkinsUrl) missing.push("JENKINS_URL");
  if (!config.jenkinsUser) missing.push("JENKINS_USER");
  if (!config.jenkinsApiKey) missing.push("JENKINS_API_KEY");

  if (missing.length === 0) return;

  throw new McpError(
    ErrorCode.InternalError,
    [
      `Server configuration error — missing Jenkins credentials: ${missing.join(", ")}.`,
      "",
      "These are server-side credentials that should be pre-loaded by the operator.",
      "Contact the server administrator to set them in the mcp.json env block.",
    ].join("\n")
  );
}

// ─── Action Tools (CircleCI) ──────────────────────────────────────────────────

/**
 * Validates CircleCI credentials.
 * These are server-operator credentials, pre-loaded in the .env file.
 * If missing it is a server configuration error, not a user error.
 */
export function validateCircleCiAuth(): void {
  if (config.circleCiToken) return;

  throw new McpError(
    ErrorCode.InternalError,
    [
      "Server configuration error — CIRCLE_CI_TOKEN is not configured.",
      "",
      "This is a server-side credential that should be pre-loaded by the operator.",
      "Contact the server administrator to set CIRCLE_CI_TOKEN in the server .env file.",
    ].join("\n")
  );
}

// ─── Data Layer (AWS / S3) ────────────────────────────────────────────────────

/**
 * Validates AWS credentials and S3 path.
 * These are server-operator credentials, pre-loaded in mcp.json.
 * If missing it is a server configuration error, not a user error.
 */
export function validateAwsAuth(): void {
  const missing: string[] = [];

  if (!config.awsAccessKeyId) missing.push("AWS_ACCESS_KEY_ID");
  if (!config.awsSecretAccessKey) missing.push("AWS_SECRET_ACCESS_KEY");
  if (!config.s3Bucket) missing.push("S3_BUCKET");
  if (!config.s3Key) missing.push("S3_KEY");

  if (missing.length === 0) return;

  throw new McpError(
    ErrorCode.InternalError,
    [
      `Server configuration error — missing AWS/S3 credentials: ${missing.join(", ")}.`,
      "",
      "These are server-side credentials that should be pre-loaded by the operator.",
      "Contact the server administrator to set them in the mcp.json env block.",
    ].join("\n")
  );
}
