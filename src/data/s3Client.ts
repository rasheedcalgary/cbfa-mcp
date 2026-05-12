/**
 * S3 CSV downloader.
 *
 * Downloads the CBA apps dump CSV from S3 and returns it as a string.
 * Uses AWS SDK v3 with credentials loaded from the environment.
 *
 * Phase 2 will fully implement this. For now the structure is in place
 * and auth validation is wired up so misconfiguration surfaces early.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";
import { validateAwsAuth } from "../auth/validator.js";

let _s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: config.awsRegion,
      credentials:
        config.awsAccessKeyId && config.awsSecretAccessKey
          ? {
              accessKeyId: config.awsAccessKeyId,
              secretAccessKey: config.awsSecretAccessKey,
            }
          : undefined, // falls back to instance profile / env chain
    });
  }
  return _s3Client;
}

/**
 * Downloads the CBA CSV dump from S3 and returns the raw CSV string.
 * Throws a descriptive McpError on auth failure or if the object is not found.
 *
 * @returns Raw CSV file content as a string
 */
export async function downloadCsvFromS3(): Promise<string> {
  // Validate credentials before making any network call
  validateAwsAuth();

  const command = new GetObjectCommand({
    Bucket: config.s3Bucket!,
    Key: config.s3Key!,
  });

  try {
    const response = await getS3Client().send(command);

    if (!response.Body) {
      throw new McpError(
        ErrorCode.InternalError,
        `S3 object at s3://${config.s3Bucket}/${config.s3Key} has no body.`
      );
    }

    // AWS SDK v3 returns a readable stream — collect it into a string
    return response.Body.transformToString("utf-8");
  } catch (error) {
    if (error instanceof McpError) throw error;

    const awsError = error as { name?: string; message?: string };

    if (awsError.name === "NoSuchKey") {
      throw new McpError(
        ErrorCode.InternalError,
        [
          `S3 object not found: s3://${config.s3Bucket}/${config.s3Key}`,
          "Verify S3_BUCKET and S3_KEY point to the correct CSV dump.",
        ].join("\n")
      );
    }

    if (awsError.name === "AccessDenied" || awsError.name === "InvalidAccessKeyId") {
      throw new McpError(
        ErrorCode.InvalidRequest,
        [
          "AWS returned an access denied error.",
          "Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are correct",
          "and the IAM user has s3:GetObject on the target bucket.",
        ].join("\n")
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to download CSV from S3: ${awsError.message ?? String(error)}`
    );
  }
}
