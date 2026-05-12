/**
 * Jenkins API client.
 *
 * Wraps the Jenkins REST API using HTTP Basic Auth (username + API token).
 * The base URL is configurable via JENKINS_URL so it works with any
 * self-hosted Jenkins instance.
 *
 * Docs: https://www.jenkins.io/doc/book/using/remote-access-api/
 *
 * Usage:
 *   import { getJenkinsClient } from "../clients/jenkins.js";
 *   const client = getJenkinsClient();
 *   const { data } = await client.post("/job/my-job/build", null, {
 *     params: { token: "my-build-token" },
 *   });
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";

let _client: AxiosInstance | undefined;

/** Returns a singleton axios instance configured for Jenkins HTTP Basic Auth. */
export function getJenkinsClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: config.jenkinsUrl,
      // Jenkins uses HTTP Basic Auth: username:apiToken
      auth: {
        username: config.jenkinsUser ?? "",
        password: config.jenkinsApiKey ?? "",
      },
      headers: {
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
              "Jenkins API returned 401 Unauthorized.",
              "Your JENKINS_USER or JENKINS_API_KEY is incorrect.",
              "Verify the credentials:",
              "  Jenkins → <username> → Configure → API Token",
            ].join("\n")
          );
        }
        if (error.response?.status === 403) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            [
              "Jenkins API returned 403 Forbidden.",
              "Your Jenkins user does not have permission for this operation.",
              "Ensure the user has 'Build' and 'Read' permissions on the target job.",
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
export function resetJenkinsClient(): void {
  _client = undefined;
}
