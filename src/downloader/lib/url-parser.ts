import pako from "pako";
import type { DownloadParams, S3FileInfo } from "./types";

export type { DownloadParams };

export interface ParsedUrl {
  params: DownloadParams;
  manifest: S3FileInfo[] | null;
}

function base64urlToBytes(b64: string): Uint8Array {
  let std = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (std.length % 4 !== 0) std += "=";
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
      let std = raw.replace(/-/g, "+").replace(/_/g, "/");
      while (std.length % 4 !== 0) std += "=";
      json = atob(std);
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

declare global {
  interface Window {
    __INJECTED_SEARCH?: string;
    __INJECTED_HASH?: string;
  }
}

export function parseUrlParams(search: string, hash: string): ParsedUrl {
  // Support S3-hosted mode: injected params override URL
  const effectiveSearch = window.__INJECTED_SEARCH || search;
  const effectiveHash = window.__INJECTED_HASH || hash;
  const params = new URLSearchParams(effectiveSearch);

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

  const manifest = decodeManifest(effectiveHash.replace(/^#/, ""));

  return { params: downloadParams, manifest };
}
