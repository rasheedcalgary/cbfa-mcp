/**
 * Tool registry.
 *
 * Single entry point that registers every MCP tool on the server.
 * Add new tools here — import the register function and call it.
 *
 * Read tools   → require ADMIN_PANEL_API_KEY + ADMIN_PANEL_DOMAIN
 * Action tools → require BITRISE_TOKEN and/or JENKINS credentials
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Read tools
import { registerListApps } from "./read/list-apps.js";
import { registerGetAppInfo } from "./read/get-app-info.js";
import { registerGetIosStatus } from "./read/get-ios-status.js";
import { registerGetAndroidStatus } from "./read/get-android-status.js";
import { registerGetAppLastUpdated } from "./read/get-app-last-updated.js";
import { registerGetPendingApps } from "./read/get-pending-apps.js";
import { registerGetStaleApps } from "./read/get-stale-apps.js";

// Action tools
import { registerTriggerAppBuild } from "./action/trigger-build.js";
import { registerGetBuildStatus } from "./action/get-build-status.js";

/**
 * Registers all CBA-MCP tools on the given McpServer instance.
 * Called once during server initialisation.
 */
export function registerAllTools(server: McpServer): void {
  // ── Read tools (Admin Panel API key) ──────────────────────────────────────
  registerListApps(server);
  registerGetAppInfo(server);
  registerGetIosStatus(server);
  registerGetAndroidStatus(server);
  registerGetAppLastUpdated(server);
  registerGetPendingApps(server);
  registerGetStaleApps(server);

  // ── Action tools (Bitrise / Jenkins API keys) ─────────────────────────────
  registerTriggerAppBuild(server);
  registerGetBuildStatus(server);
}
