/**
 * Lightweight structured logger.
 *
 * All output goes to stderr so it never pollutes the MCP stdio JSON stream.
 * Every line is prefixed with an ISO timestamp and a severity tag.
 */

const PREFIX = "[cba-mcp]";

/** Sensitive field names to redact from any logged object. */
const REDACT_KEYS = new Set(["apikey", "api_key", "token", "secret", "password", "authorization"]);

/**
 * Recursively redacts known sensitive fields from an object before logging.
 * Prevents API keys from appearing in log output even if accidentally included.
 */
function redact(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? "***" : redact(v);
  }
  return out;
}

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (msg: string, ...args: unknown[]) =>
    console.error(`${ts()} ${PREFIX} INFO  ${msg}`, ...args),

  warn: (msg: string, ...args: unknown[]) =>
    console.error(`${ts()} ${PREFIX} WARN  ${msg}`, ...args),

  error: (msg: string, ...args: unknown[]) =>
    console.error(`${ts()} ${PREFIX} ERROR ${msg}`, ...args),

  /** Log an inbound tool call with its parameters (sensitive fields redacted). */
  toolCall: (name: string, params: unknown) =>
    console.error(
      `${ts()} ${PREFIX} CALL  ${name.padEnd(28)} params=${JSON.stringify(redact(params))}`
    ),

  /** Log a successful tool response and how long it took. */
  toolOk: (name: string, ms: number) =>
    console.error(
      `${ts()} ${PREFIX} OK    ${name.padEnd(28)} ${ms}ms`
    ),

  /** Log a tool error with message and duration. */
  toolError: (name: string, ms: number, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `${ts()} ${PREFIX} ERROR ${name.padEnd(28)} ${ms}ms — ${msg}`
    );
  },

  /** Log an inbound HTTP request. */
  httpRequest: (method: string, path: string, status: number, ms: number) =>
    console.error(
      `${ts()} ${PREFIX} HTTP  ${method.padEnd(6)} ${path.padEnd(14)} ${status}  ${ms}ms`
    ),
};
