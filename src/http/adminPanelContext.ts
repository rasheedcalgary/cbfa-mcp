/**
 * Per-request Admin Panel API key for HTTP/SSE transports.
 *
 * stdio clients continue to use process.env.ADMIN_PANEL_API_KEY (config).
 * HTTP clients may send the key on each request so multiple users can share
 * one server process without storing user keys in server .env.
 *
 * Supported headers (first match wins):
 *   - X-Admin-Panel-Api-Key: <key>
 *   - Authorization: Bearer <key>
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";

type Store = { adminPanelApiKey: string | undefined };

const als = new AsyncLocalStorage<Store>();

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const v = headers[name];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

/**
 * Reads user API key from incoming HTTP headers (Express lowercases keys).
 */
export function parseAdminPanelApiKeyFromHttpHeaders(headers: IncomingHttpHeaders): string | undefined {
  const custom = headerValue(headers, "x-admin-panel-api-key");
  if (custom?.trim()) return custom.trim();

  const auth = headerValue(headers, "authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return undefined;
}

/** Key supplied for the current async chain (HTTP request), if any. */
export function getRequestAdminPanelApiKey(): string | undefined {
  const v = als.getStore()?.adminPanelApiKey;
  return v?.trim() ? v.trim() : undefined;
}

export function runWithAdminPanelApiKeyAsync<T>(apiKey: string | undefined, fn: () => Promise<T>): Promise<T> {
  return als.run({ adminPanelApiKey: apiKey }, fn);
}
