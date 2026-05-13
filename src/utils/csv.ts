/**
 * Lightweight CSV serialisation utilities.
 *
 * RFC 4180-compliant: fields containing commas, double-quotes, or newlines
 * are wrapped in double-quotes, and internal double-quotes are escaped by
 * doubling them.
 */

/** Escapes a single cell value for CSV output. */
function escapeCell(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Converts headers + rows to a RFC 4180 CSV string. */
export function toCSV(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(","));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return lines.join("\n");
}
