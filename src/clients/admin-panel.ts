/**
 * Admin Panel API client.
 *
 * Wraps the Trainerize Admin API endpoints used by the read tools.
 * All requests authenticate via the user-supplied ADMIN_PANEL_API_KEY
 * passed as `apiKey` in the request body.
 *
 * Base URL: ADMIN_PANEL_DOMAIN (operator-configured, e.g. https://api.trainerize.com)
 *
 * Endpoints:
 *   POST /v03/sys/getNativeApp             — live app metadata by appCode
 *   GET  /v03/CBA/GetNativeAppGroupSettings — deep group settings by groupID
 *   GET  /v03/CBA/getAppBuildQueue         — apps in a given build queue state
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";
import type {
  GetNativeAppResponse,
  GetNativeAppGroupSettingsResponse,
  GetAppBuildQueueResponse,
} from "../types/index.js";

// ─── Singleton client ─────────────────────────────────────────────────────────

let _client: AxiosInstance | undefined;

function getClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: config.adminPanelDomain,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 15_000,
    });

    _client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            [
              "Admin Panel API returned 401 Unauthorized.",
              "Your ADMIN_PANEL_API_KEY was rejected by the server.",
              "Verify the key is correct and has not expired.",
            ].join("\n")
          );
        }
        if (error.response?.status === 403) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            [
              "Admin Panel API returned 403 Forbidden.",
              "Your ADMIN_PANEL_API_KEY does not have permission for this endpoint.",
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

// ─── API Methods ──────────────────────────────────────────────────────────────

/**
 * Fetches live app metadata for a given appCode (bundle ID).
 *
 * POST /v03/sys/getNativeApp
 * Body: { apiKey, appCode }
 */
export async function getNativeApp(appCode: string): Promise<GetNativeAppResponse> {
  const { data } = await getClient().post<GetNativeAppResponse>(
    "/v03/sys/getNativeApp",
    { apiKey: config.adminPanelApiKey, appCode }
  );
  return data;
}

/**
 * Fetches deep group settings for a given groupID.
 * Note: this endpoint uses GET with a JSON body (unusual but required).
 *
 * GET /v03/CBA/GetNativeAppGroupSettings
 * Body: { apiKey, groupID }
 */
export async function getNativeAppGroupSettings(
  groupID: number
): Promise<GetNativeAppGroupSettingsResponse> {
  const { data } = await getClient().get<GetNativeAppGroupSettingsResponse>(
    "/v03/CBA/GetNativeAppGroupSettings",
    { data: { apiKey: config.adminPanelApiKey, groupID } }
  );
  return data;
}

/**
 * Fetches the list of app bundle IDs currently in a given build queue state.
 *
 * GET /v03/CBA/getAppBuildQueue
 * Body: { apiKey, platform, status }
 *
 * @param platform  "ios" | "android"
 * @param status    e.g. "ReadyToBuild" | "Building" | "Built" | "Failed"
 */
export async function getAppBuildQueue(
  platform: string,
  status: string
): Promise<GetAppBuildQueueResponse> {
  const { data } = await getClient().get<GetAppBuildQueueResponse>(
    "/v03/CBA/getAppBuildQueue",
    { data: { apiKey: config.adminPanelApiKey, platform, status } }
  );
  return data;
}
