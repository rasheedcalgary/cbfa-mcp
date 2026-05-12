/**
 * In-memory app registry.
 *
 * Holds the parsed AppRecord array in memory after the first load.
 * Provides query helpers used by the read tools.
 *
 * Loading flow:
 *   1. On first call to `getRegistry()`, the CSV is downloaded from S3
 *      and parsed into memory.
 *   2. Subsequent calls return the cached registry instantly.
 *   3. Call `refreshRegistry()` to force a re-download (e.g. after a
 *      new CSV dump is published to S3).
 *
 * Phase 2 will fully wire up the S3 download. For now the module is
 * ready to receive data and the query helpers are stubbed.
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { downloadCsvFromS3 } from "./s3Client.js";
import { parseCsv } from "./csvParser.js";
import type { AppRecord, AppType } from "../types/index.js";

// ─── State ────────────────────────────────────────────────────────────────────

let _apps: AppRecord[] = [];
let _loadedAt: Date | null = null;
let _loading: Promise<void> | null = null;

// ─── Load / Refresh ───────────────────────────────────────────────────────────

/**
 * Loads the app registry from S3 if not already loaded.
 * Deduplicates concurrent calls — only one download happens at a time.
 */
async function ensureLoaded(): Promise<void> {
  if (_loadedAt !== null) return;

  // Prevent concurrent loads
  if (_loading) {
    await _loading;
    return;
  }

  _loading = (async () => {
    const csv = await downloadCsvFromS3();
    _apps = parseCsv(csv);
    _loadedAt = new Date();
    console.error(`[cba-mcp] Registry loaded — ${_apps.length} apps (dump: ${_apps[0]?.dump_date ?? "unknown"})`);
  })();

  await _loading;
  _loading = null;
}

/**
 * Forces a re-download of the CSV from S3 and refreshes the in-memory cache.
 * Returns a summary of the refresh.
 */
export async function refreshRegistry(): Promise<{ count: number; dump_date: string }> {
  _loadedAt = null;
  _apps = [];
  await ensureLoaded();
  return { count: _apps.length, dump_date: _apps[0]?.dump_date ?? "unknown" };
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Returns all apps, optionally filtered by type.
 * Triggers a load if the registry is empty.
 */
export async function getAllApps(app_type?: AppType): Promise<AppRecord[]> {
  await ensureLoaded();
  if (!app_type) return _apps;
  return _apps.filter((a) => a.app_type === app_type);
}

/**
 * Returns a single app by bundle ID, or throws if not found.
 */
export async function getAppByBundleId(bundleId: string): Promise<AppRecord> {
  await ensureLoaded();
  const app = _apps.find((a) => a.bundle_id === bundleId);
  if (!app) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `App not found: "${bundleId}". Use list_apps to see all available bundle IDs.`
    );
  }
  return app;
}

/**
 * Returns metadata about the current registry state.
 * Useful for debugging data freshness.
 */
export function getRegistryMeta(): { count: number; loadedAt: string | null } {
  return {
    count: _apps.length,
    loadedAt: _loadedAt?.toISOString() ?? null,
  };
}
