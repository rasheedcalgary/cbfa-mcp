/**
 * CircleCI API clients.
 *
 * Two singleton instances — one for each API version:
 *   - v2  (https://circleci.com/api/v2)  — pipeline/workflow/job metadata
 *   - v1.1 (https://circleci.com/api/v1.1) — job step output (logs)
 *
 * Authentication: "Circle-Token" header (personal API token).
 * Docs: https://circleci.com/docs/api/v2/
 *
 * Usage:
 *   import { getCircleCiV2Client, getCircleCiV1Client } from "../clients/circleci.js";
 *   const v2 = getCircleCiV2Client();
 *   const { data } = await v2.get(`/project/github/glofoxinc/standalone-app-builder/pipeline/42`);
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";

const CIRCLECI_V2_BASE  = "https://circleci.com/api/v2";
const CIRCLECI_V1_BASE  = "https://circleci.com/api/v1.1";

function buildInterceptor(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (res) => res,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          [
            "CircleCI API returned 401 Unauthorized.",
            "Your CIRCLE_CI_TOKEN is set but was rejected.",
            "Verify the token is still active:",
            "  CircleCI → User Settings → Personal API Tokens",
          ].join("\n")
        );
      }
      if (error.response?.status === 403) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          [
            "CircleCI API returned 403 Forbidden.",
            "Your CIRCLE_CI_TOKEN does not have permission for this operation.",
            "Ensure the token belongs to a member of the 'glofoxinc' organisation.",
          ].join("\n")
        );
      }
      if (error.response?.status === 404) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          [
            "CircleCI API returned 404 Not Found.",
            "The requested build / workflow / pipeline could not be found.",
            "Check that the URL is correct and belongs to glofoxinc/standalone-app-builder.",
          ].join("\n")
        );
      }
      return Promise.reject(error);
    }
  );
}

let _v2Client: AxiosInstance | undefined;
let _v1Client: AxiosInstance | undefined;

/** Returns a singleton axios instance for CircleCI API v2 (metadata). */
export function getCircleCiV2Client(): AxiosInstance {
  if (!_v2Client) {
    _v2Client = axios.create({
      baseURL: CIRCLECI_V2_BASE,
      headers: {
        "Circle-Token": config.circleCiToken,
        Accept: "application/json",
      },
      timeout: 30_000,
    });
    buildInterceptor(_v2Client);
  }
  return _v2Client;
}

/** Returns a singleton axios instance for CircleCI API v1.1 (job output / logs). */
export function getCircleCiV1Client(): AxiosInstance {
  if (!_v1Client) {
    _v1Client = axios.create({
      baseURL: CIRCLECI_V1_BASE,
      headers: {
        "Circle-Token": config.circleCiToken,
        Accept: "application/json",
      },
      timeout: 60_000,
    });
    buildInterceptor(_v1Client);
  }
  return _v1Client;
}

/** Resets both singletons — useful after credential rotation. */
export function resetCircleCiClients(): void {
  _v2Client = undefined;
  _v1Client = undefined;
}
