/**
 * CSV parser.
 *
 * Parses the raw CBA apps CSV string into a typed AppRecord array.
 * Uses `csv-parse` for robust RFC 4180 parsing with header mapping.
 *
 * Phase 2 will implement the full parsing logic. The column mapping
 * matches the unified CSV schema defined in the implementation plan.
 */

import { parse } from "csv-parse/sync";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { AppRecord } from "../types/index.js";

/**
 * Parses a raw CSV string into an array of AppRecord objects.
 * Columns are mapped directly by the header row.
 *
 * @param csvContent - Raw CSV string from S3
 * @returns Parsed array of AppRecord
 */
export function parseCsv(csvContent: string): AppRecord[] {
  try {
    const records = parse(csvContent, {
      columns: true,          // use first row as column headers
      skip_empty_lines: true,
      trim: true,
      cast: false,            // keep everything as strings; callers cast as needed
      relax_column_count: true, // tolerate rows with extra/missing columns (data quality)
    }) as Record<string, string>[];

    return records.map(mapRowToAppRecord);
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to parse CBA CSV: ${(error as Error).message}`
    );
  }
}

/**
 * Maps a raw CSV row (string dict) to a typed AppRecord.
 *
 * Actual CSV headers (as dumped from the Admin Panel):
 *   ID, Name, Code, Status, GroupID, iTuneID, AppType, BusinessType,
 *   AppleStoreAccount, PlayStoreAccount, Created, WaitingForArtwork,
 *   ArtworkReceived, Submitted, PendingToPublish, Published,
 *   AndroidVersion, AndroidStoreStatus, iOSVersion, AppleStoreVersion,
 *   TeamID, IOSStoreStatus, IOSMembership
 */
function mapRowToAppRecord(row: Record<string, string>): AppRecord {
  const rawType = (row["AppType"] ?? "").toLowerCase();
  const appType: AppRecord["app_type"] =
    rawType === "enterprise" ? "enterprise"
    : rawType === "studio"   ? "studio"
    : rawType === "pro"      ? "pro"
    : rawType === "abc"      ? "abc"
    : "enterprise";

  return {
    bundle_id:            row["Code"]              ?? "",
    display_name:         row["Name"]              ?? "",
    app_type:             appType,
    team_name:            row["BusinessType"]      ?? "",
    group_id:             row["GroupID"]           ?? "",
    apple_id:             row["AppleStoreAccount"] ?? "",
    abc_app_type:         row["AppType"]           ?? "N/A",
    status:               row["Status"]            ?? "",

    ios_version:          row["iOSVersion"]        ?? "",
    app_store_state:      row["IOSStoreStatus"]    ?? "",
    apple_key_valid:      row["AppleStoreAccount"] ?? "",
    watch_face:           "",

    android_version:      row["AndroidVersion"]    ?? "",
    android_store_state:  row["AndroidStoreStatus"] ?? "",
    google_key_valid:     row["PlayStoreAccount"]  ?? "",

    last_ios_updated:     row["Published"]         ?? "",
    last_android_updated: row["Created"]           ?? "",

    bitrise_workflow:     row["TeamID"]            ?? "",
    dump_date:            row["Created"]           ?? "",
  };
}
