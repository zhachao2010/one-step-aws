import type { DownloadParams } from "./types";

export type { DownloadParams };

export function parseUrlParams(search: string): DownloadParams {
  const params = new URLSearchParams(search);

  const get = (name: string): string => {
    const val = params.get(name);
    if (!val) throw new Error(`Missing required parameter: ${name}`);
    return val;
  };

  return {
    accessKey: get("ak"),
    secretKey: get("sk"),
    bucket: get("bucket"),
    region: get("region"),
    project: get("project"),
    expires: params.get("expires") || null,
  };
}
