import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3FileInfo } from "./types";

export type { S3FileInfo };

export function createS3Client(
  accessKey: string,
  secretKey: string,
  region: string,
): S3Client {
  return new S3Client({
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
}

export function isMd5File(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.endsWith(".md5") ||
    lower.endsWith("md5.txt") ||
    lower.endsWith("md5sum.txt")
  );
}

export async function listProjectFiles(
  client: S3Client,
  bucket: string,
  project: string,
): Promise<S3FileInfo[]> {
  const prefix = project.endsWith("/") ? project : `${project}/`;
  const files: S3FileInfo[] = [];
  let continuationToken: string | undefined;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    ).catch((e: Error) => {
      const msg = e.message || e.toString();
      if (msg.includes("InvalidAccessKeyId")) {
        throw new Error("Invalid AWS Access Key. Please check your credentials.");
      } else if (msg.includes("SignatureDoesNotMatch")) {
        throw new Error("Invalid AWS Secret Key. Please check your credentials.");
      } else if (msg.includes("AccessDenied")) {
        throw new Error("Access denied. The credentials do not have permission to access this bucket.");
      } else if (msg.includes("NoSuchBucket")) {
        throw new Error("The specified S3 bucket does not exist.");
      }
      throw new Error(`S3 error: ${msg}`);
    });

    for (const obj of resp.Contents ?? []) {
      const key = obj.Key ?? "";
      if (key.endsWith("/")) continue; // skip directory markers
      files.push({
        key,
        size: obj.Size ?? 0,
        isMd5File: isMd5File(key),
      });
    }

    continuationToken = resp.IsTruncated
      ? resp.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return files;
}

export async function getObjectStream(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<ReadableStream<Uint8Array>> {
  const resp = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  return resp.Body!.transformToWebStream() as ReadableStream<Uint8Array>;
}

export async function getObjectText(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<string> {
  const resp = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  return await resp.Body!.transformToString();
}
