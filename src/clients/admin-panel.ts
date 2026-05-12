/**
 * Admin Panel API client.
 *
 * Provides a pre-configured axios instance for all requests to the
 * Trainerize Admin Panel REST API. Authentication uses a Bearer token
 * passed via the Authorization header.
 *
 * Usage:
 *   import { getAdminPanelClient } from "../clients/admin-panel.js";
 *   const client = getAdminPanelClient();
 *   const { data } = await client.get("/apps");
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";

let _client: AxiosInstance | undefined;

/**
 * Returns a singleton axios instance configured for the Admin Panel API.
 * Re-creates the instance if credentials change (rare in practice).
 */
export function getAdminPanelClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: config.adminPanelDomain,
      headers: {
        Authorization: `Bearer ${config.adminPanelApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 15_000,
    });

    // Intercept 401/403 responses and surface them as clear MCP errors
    _client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            [
              "Admin Panel API returned 401 Unauthorized.",
              "Your ADMIN_PANEL_API_KEY is set but was rejected by the server.",
              "Please verify the key is valid and has not expired.",
            ].join("\n")
          );
        }
        if (error.response?.status === 403) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            [
              "Admin Panel API returned 403 Forbidden.",
              "Your ADMIN_PANEL_API_KEY does not have permission for this endpoint.",
              "Check that the key has the required read scopes.",
            ].join("\n")
          );
        }
        return Promise.reject(error);
      }
    );
  }
  return _client;
}

/** Resets the singleton — useful in tests or after credential rotation. */
export function resetAdminPanelClient(): void {
  _client = undefined;
}
