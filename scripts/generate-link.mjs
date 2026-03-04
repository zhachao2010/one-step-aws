#!/usr/bin/env node
/**
 * Generate a delivery URL for S3 data downloads.
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
 * 2. Builds a self-contained downloader HTML with embedded credentials
 * 3. Uploads it to the same S3 bucket (same-origin = no CORS needed)
 * 4. Generates a presigned URL (7-day access) as the delivery link
 *
 * Also outputs a GitHub Pages fallback URL with compressed manifest.
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    result[key] = args[i + 1];
  }
  if (!result.project) result.project = "";
  for (const required of ["ak", "sk", "bucket", "region"]) {
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
  const prefix = project ? (project.endsWith("/") ? project : `${project}/`) : "";
  const files = [];
  let token;

  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ...(prefix ? { Prefix: prefix } : {}),
      MaxKeys: 1000,
      ContinuationToken: token,
    }));

    for (const obj of resp.Contents ?? []) {
      const key = obj.Key ?? "";
      if (key.endsWith("/")) continue;
      if (key.startsWith("_dl/")) continue;
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

  const dataCount = files.filter(f => !f.m).length;
  const md5Count = files.filter(f => f.m).length;

  // === Method 1: S3-hosted single-file HTML (recommended) ===
  const singleHtmlPath = path.resolve(__dirname, "../dist-single/downloader.html");
  if (fs.existsSync(singleHtmlPath)) {
    console.error("\nBuilding S3-hosted downloader...");
    let html = fs.readFileSync(singleHtmlPath, "utf-8");

    // Build manifest as compressed hash (same format as URL hash)
    const manifest = JSON.stringify(files);
    const compressed = zlib.deflateSync(Buffer.from(manifest));
    const base64 = "z:" + Buffer.from(compressed).toString("base64url");

    // Build query params to embed in the HTML
    const params = new URLSearchParams({
      ak: args.ak,
      sk: args.sk,
      bucket: args.bucket,
      region: args.region,
    });
    if (args.project) params.set("project", args.project);
    if (args.expires) params.set("expires", args.expires);

    // Inject params before the app loads (always override URL params from presigned URL)
    const configScript = `<script>
window.__INJECTED_SEARCH = "?${params.toString()}";
window.__INJECTED_HASH = "#${base64}";
</script>`;
    html = html.replace("<head>", `<head>\n${configScript}`);

    // Upload to S3
    const id = crypto.randomBytes(4).toString("hex");
    const s3Key = `_dl/${args.project || "all"}-${id}.html`;
    await client.send(new PutObjectCommand({
      Bucket: args.bucket,
      Key: s3Key,
      Body: html,
      ContentType: "text/html; charset=utf-8",
    }));
    console.error(`Uploaded to s3://${args.bucket}/${s3Key}`);

    // Generate presigned URL (7 days max for IAM users)
    const presignedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: args.bucket, Key: s3Key }),
      { expiresIn: 604800 },
    );

    console.log("\n=== Download Link (S3-hosted, recommended) ===\n");
    console.log(presignedUrl);
    console.log(`\nURL length: ${presignedUrl.length} chars`);
    console.log(`Valid for: 7 days (re-run this script to regenerate)`);
    console.log(`Features: one-click download, directory structure, MD5 verification`);
    console.log(`Requires: Chrome or Edge browser`);
  } else {
    console.error("\nNote: Run 'SINGLE_FILE=1 npx vite build --config vite.config.downloader.ts' first for S3-hosted mode.");
  }

  // === Method 2: GitHub Pages fallback URL ===
  const manifest = JSON.stringify(files);
  const compressed = zlib.deflateSync(Buffer.from(manifest));
  const base64 = "z:" + Buffer.from(compressed).toString("base64url");

  const baseUrl = "https://zhachao2010.github.io/one-step-aws/downloader.html";
  const ghParams = new URLSearchParams({
    ak: args.ak,
    sk: args.sk,
    bucket: args.bucket,
    region: args.region,
  });
  if (args.project) ghParams.set("project", args.project);
  if (args.expires) ghParams.set("expires", args.expires);

  const ghUrl = `${baseUrl}?${ghParams.toString()}#${base64}`;

  console.log("\n=== Fallback URL (GitHub Pages, per-file download) ===\n");
  console.log(ghUrl);
  console.log(`\nURL length: ${ghUrl.length} chars`);

  console.log(`\nFiles: ${dataCount} data + ${md5Count} md5`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
