#!/usr/bin/env node
/**
 * Generate a delivery URL with embedded file manifest.
 *
 * Usage:
 *   node scripts/generate-link.mjs \
 *     --ak YOUR_ACCESS_KEY \
 *     --sk YOUR_SECRET_KEY \
 *     --bucket YOUR_BUCKET \
 *     --region ap-northeast-1 \
 *     --project YOUR_PROJECT \
 *     --expires 2026-04-30
 *
 * This script:
 * 1. Lists all files under the project prefix in S3
 * 2. Encodes the file manifest as base64url in the URL hash
 * 3. Outputs a ready-to-send delivery URL (no CORS needed)
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    result[key] = args[i + 1];
  }
  for (const required of ["ak", "sk", "bucket", "region", "project"]) {
    if (!result[required]) {
      console.error(`Missing required argument: --${required}`);
      process.exit(1);
    }
  }
  return result;
}

function isMd5File(key) {
  const lower = key.toLowerCase();
  return lower.endsWith(".md5") || lower.endsWith("md5.txt") || lower.endsWith("md5sum.txt");
}

async function listFiles(client, bucket, project) {
  const prefix = project.endsWith("/") ? project : `${project}/`;
  const files = [];
  let token;

  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: token,
    }));

    for (const obj of resp.Contents ?? []) {
      const key = obj.Key ?? "";
      if (key.endsWith("/")) continue;
      files.push({
        k: key,
        s: obj.Size ?? 0,
        m: isMd5File(key) ? 1 : 0,
      });
    }

    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);

  return files;
}

async function main() {
  const args = parseArgs();

  const client = new S3Client({
    region: args.region,
    credentials: {
      accessKeyId: args.ak,
      secretAccessKey: args.sk,
    },
  });

  console.error("Listing files in S3...");
  const files = await listFiles(client, args.bucket, args.project);
  console.error(`Found ${files.length} files`);

  // Encode manifest as base64url
  const manifest = JSON.stringify(files);
  const base64 = Buffer.from(manifest).toString("base64url");

  // Build URL
  const baseUrl = "https://zhachao2010.github.io/one-step-aws/downloader.html";
  const params = new URLSearchParams({
    ak: args.ak,
    sk: args.sk,
    bucket: args.bucket,
    region: args.region,
    project: args.project,
  });
  if (args.expires) {
    params.set("expires", args.expires);
  }

  const url = `${baseUrl}?${params.toString()}#${base64}`;

  console.log("\n=== Delivery URL ===\n");
  console.log(url);
  console.log(`\nURL length: ${url.length} chars`);
  console.log(`Files: ${files.filter(f => !f.m).length} data + ${files.filter(f => f.m).length} md5`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
