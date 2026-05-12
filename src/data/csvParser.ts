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
 * Unknown app_type values default to "enterprise".
 */
function mapRowToAppRecord(row: Record<string, string>): AppRecord {
  return {
    bundle_id: row["bundle_id"] ?? "",
    display_name: row["display_name"] ?? "",
    app_type: (row["app_type"] as AppRecord["app_type"]) ?? "enterprise",
    team_name: row["team_name"] ?? "",
    group_id: row["group_id"] ?? "",
    apple_id: row["apple_id"] ?? "",
    abc_app_type: row["abc_app_type"] ?? "N/A",
    ios_version: row["ios_version"] ?? "",
    app_store_state: row["app_store_state"] ?? "",
    apple_key_valid: row["apple_key_valid"] ?? "",
    watch_face: row["watch_face"] ?? "",
    android_version: row["android_version"] ?? "",
    android_store_state: row["android_store_state"] ?? "",
    google_key_valid: row["google_key_valid"] ?? "",
    last_ios_updated: row["last_ios_updated"] ?? "",
    last_android_updated: row["last_android_updated"] ?? "",
    bitrise_workflow: row["bitrise_workflow"] ?? "",
    dump_date: row["dump_date"] ?? "",
  };
}
