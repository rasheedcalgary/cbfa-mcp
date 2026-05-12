/**
 * In-memory app registry.
 *
 * Loads the CBA apps CSV from S3 on first access, parses it into
 * a typed AppRecord array, and caches it for the lifetime of the process.
 *
 * Loading flow:
 *   1. Any tool that needs data calls getAllApps() or getAppByBundleId().
 *   2. ensureLoaded() downloads + parses the CSV on first call only.
 *   3. Concurrent calls are deduplicated — only one S3 download happens.
 *   4. Call refreshRegistry() to force a re-download (e.g. after a new dump).
 */

import { downloadCsvFromS3 } from "./s3Client.js";
import { parseCsv } from "./csvParser.js";
import { logger } from "../logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { AppRecord, AppType } from "../types/index.js";

// ─── State ────────────────────────────────────────────────────────────────────

let _apps: AppRecord[] = [];
let _loadedAt: Date | null = null;
let _loading: Promise<void> | null = null;

// ─── Load / Refresh ───────────────────────────────────────────────────────────

async function ensureLoaded(): Promise<void> {
  if (_loadedAt !== null) return;

  // Deduplicate concurrent load calls
  if (_loading) {
    await _loading;
    return;
  }

  _loading = (async () => {
    logger.info("Registry: loading CSV from S3...");
    const csv = await downloadCsvFromS3();
    _apps = parseCsv(csv);
    _loadedAt = new Date();
    logger.info(`Registry: loaded ${_apps.length} apps (dump date: ${_apps[0]?.dump_date ?? "unknown"})`);
  })();

  try {
    await _loading;
  } finally {
    _loading = null;
  }
}

/**
 * Forces a re-download of the CSV from S3 and refreshes the in-memory cache.
 */
export async function refreshRegistry(): Promise<{ count: number; dump_date: string }> {
  logger.info("Registry: forcing refresh...");
  _loadedAt = null;
  _apps = [];
  await ensureLoaded();
  return { count: _apps.length, dump_date: _apps[0]?.dump_date ?? "unknown" };
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Returns all apps, optionally filtered by type.
 */
export async function getAllApps(app_type?: AppType): Promise<AppRecord[]> {
  await ensureLoaded();
  if (!app_type) return _apps;
  return _apps.filter((a) => a.app_type === app_type);
}

/**
 * Returns a single app by bundle ID.
 * Throws McpError with a helpful message if not found.
 */
export async function getAppByBundleId(bundleId: string): Promise<AppRecord> {
  await ensureLoaded();
  const app = _apps.find((a) => a.bundle_id === bundleId);
  if (!app) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `App not found: "${bundleId}".\nUse list_apps to see all available bundle IDs.`
    );
  }
  return app;
}

/**
 * Returns apps whose app_store_state or android_store_state contains
 * the given keyword (case-insensitive).
 */
export async function getAppsByStoreState(keyword: string): Promise<AppRecord[]> {
  await ensureLoaded();
  const kw = keyword.toLowerCase();
  return _apps.filter(
    (a) =>
      a.app_store_state.toLowerCase().includes(kw) ||
      a.android_store_state.toLowerCase().includes(kw)
  );
}

/**
 * Returns metadata about the current registry state (count + load time).
 */
export function getRegistryMeta(): { count: number; loadedAt: string | null } {
  return {
    count: _apps.length,
    loadedAt: _loadedAt?.toISOString() ?? null,
  };
}
