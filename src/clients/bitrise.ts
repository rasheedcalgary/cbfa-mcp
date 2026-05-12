/**
 * Bitrise API client.
 *
 * Wraps the Bitrise REST API (https://api.bitrise.io/v0.1) with a
 * pre-configured axios instance. The Personal Access Token is passed
 * in the "Authorization" header (no "Bearer" prefix — Bitrise-specific).
 *
 * Docs: https://devcenter.bitrise.io/en/api/api-reference.html
 *
 * Usage:
 *   import { getBitriseClient } from "../clients/bitrise.js";
 *   const client = getBitriseClient();
 *   const { data } = await client.post(`/apps/${appSlug}/builds`, payload);
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";

const BITRISE_API_BASE = "https://api.bitrise.io/v0.1";

let _client: AxiosInstance | undefined;

/** Returns a singleton axios instance configured for the Bitrise API. */
export function getBitriseClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: BITRISE_API_BASE,
      headers: {
        // Bitrise uses the token directly, no "Bearer" prefix
        Authorization: config.bitriseToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 30_000,
    });

    _client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            [
              "Bitrise API returned 401 Unauthorized.",
              "Your BITRISE_TOKEN is set but was rejected.",
              "Verify the token is still active:",
              "  Bitrise → Profile → Security → Personal Access Tokens",
            ].join("\n")
          );
        }
        if (error.response?.status === 403) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            [
              "Bitrise API returned 403 Forbidden.",
              "Your BITRISE_TOKEN does not have permission for this operation.",
              "Ensure the token has 'build:read' and 'build:write' scopes.",
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
export function resetBitriseClient(): void {
  _client = undefined;
}
