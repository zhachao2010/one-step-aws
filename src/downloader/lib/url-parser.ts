import type { DownloadParams, S3FileInfo } from "./types";

export type { DownloadParams };

export interface ParsedUrl {
  params: DownloadParams;
  manifest: S3FileInfo[] | null;
}

export function parseUrlParams(search: string, hash: string): ParsedUrl {
  const params = new URLSearchParams(search);

  const get = (name: string): string => {
    const val = params.get(name);
    if (!val) throw new Error(`Missing required parameter: ${name}`);
    return val;
  };

  const downloadParams: DownloadParams = {
    accessKey: get("ak"),
    secretKey: get("sk"),
    bucket: get("bucket"),
    region: get("region"),
    project: get("project"),
    expires: params.get("expires") || null,
  };

  // Decode embedded file manifest from URL hash (base64url)
  let manifest: S3FileInfo[] | null = null;
  const raw = hash.replace(/^#/, "");
  if (raw) {
    try {
      const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
      const items = JSON.parse(json) as Array<{ k: string; s: number; m: number }>;
      manifest = items.map((item) => ({
        key: item.k,
        size: item.s,
        isMd5File: item.m === 1,
      }));
    } catch {
      // Manifest decode failed, will fall back to S3 listing
    }
  }

  return { params: downloadParams, manifest };
}
