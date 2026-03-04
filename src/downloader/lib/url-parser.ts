import pako from "pako";
import type { DownloadParams, S3FileInfo } from "./types";

export type { DownloadParams };

export interface ParsedUrl {
  params: DownloadParams;
  manifest: S3FileInfo[] | null;
}

function base64urlToBytes(b64: string): Uint8Array {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeManifest(raw: string): S3FileInfo[] | null {
  if (!raw) return null;
  try {
    let json: string;
    if (raw.startsWith("z:")) {
      // Compressed (deflate) manifest
      const bytes = base64urlToBytes(raw.slice(2));
      json = pako.inflate(bytes, { to: "string" });
    } else {
      // Legacy uncompressed base64url
      json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    }
    const items = JSON.parse(json) as Array<{ k: string; s: number; m: number }>;
    return items.map((item) => ({
      key: item.k,
      size: item.s,
      isMd5File: item.m === 1,
    }));
  } catch {
    return null;
  }
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
    project: params.get("project") || "",
    expires: params.get("expires") || null,
  };

  const manifest = decodeManifest(hash.replace(/^#/, ""));

  return { params: downloadParams, manifest };
}
