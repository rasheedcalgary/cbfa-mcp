/**
 * Shared TypeScript types for the CBA-MCP server.
 *
 * These interfaces mirror the unified CSV schema and are used
 * across tools, clients, and the data layer.
 */

// ─── App Data ─────────────────────────────────────────────────────────────────

/** A single Custom Branded App, as parsed from the data source. */
export interface AppRecord {
  /** Primary key — reverse-DNS bundle ID, e.g. "com.trainerize.peakfitness" */
  bundle_id: string;
  /** Human-readable app name shown in stores */
  display_name: string;
  /** Product line this app belongs to */
  app_type: AppType;
  /** Gym / business name */
  team_name: string;
  /** Gym group identifier */
  group_id: string;
  /** Apple account email (without @trainerize.com) */
  apple_id: string;
  /** ABC sub-type, or "N/A" for non-ABC apps */
  abc_app_type: string;

  // ── iOS ──────────────────────────────────────────
  ios_version: string;
  app_store_state: string;
  apple_key_valid: string;
  watch_face: string;

  // ── Android ──────────────────────────────────────
  android_version: string;
  android_store_state: string;
  google_key_valid: string;

  // ── Timestamps ───────────────────────────────────
  last_ios_updated: string;
  last_android_updated: string;

  // ── CI/CD ─────────────────────────────────────────
  /** Bitrise workflow name mapped to this app */
  bitrise_workflow: string;
  /** ISO datetime when this CSV dump was generated */
  dump_date: string;
}

/** Supported app product lines */
export type AppType = "enterprise" | "studio" | "pro" | "abc";

// ─── CI/CD ────────────────────────────────────────────────────────────────────

/** Supported CI/CD providers for action tools */
export type CiProvider = "bitrise" | "jenkins";

/** Supported build target platforms */
export type BuildPlatform = "ios" | "android" | "both";

/** Result returned after triggering a build */
export interface BuildTriggerResult {
  build_id: string;
  status: "queued";
  provider: CiProvider;
  triggered_at: string;
  build_url: string;
}

/** Status of an in-progress or completed build */
export interface BuildStatusResult {
  build_id: string;
  status: BuildStatus;
  provider: CiProvider;
  triggered_at: string;
  duration_seconds?: number;
  build_url: string;
  logs_url?: string;
}

export type BuildStatus = "queued" | "running" | "succeeded" | "failed" | "aborted";

// ─── Tool Responses ───────────────────────────────────────────────────────────

/** Standard MCP tool text response */
export interface McpTextContent {
  type: "text";
  text: string;
}
