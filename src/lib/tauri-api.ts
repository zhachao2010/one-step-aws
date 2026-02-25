import { invoke } from "@tauri-apps/api/core";

export interface DownloadParams {
  access_key: string;
  secret_key: string;
  bucket: string;
  region: string;
  project: string;
  expires: string | null;
}

export interface FileInfo {
  name: string;
  size: number;
  is_md5_file: boolean;
}

export interface ProjectInfo {
  project: string;
  bucket: string;
  region: string;
  expires: string | null;
  files: FileInfo[];
  total_size: number;
  has_existing_state: boolean;
}

export interface VerifyResult {
  file_key: string;
  status: string;
  expected: string | null;
  calculated: string | null;
}

export function getInitialUrl(): Promise<string | null> {
  return invoke("get_initial_url");
}

export function parseDownloadUrl(url: string): Promise<DownloadParams> {
  return invoke("parse_download_url", { url });
}

export function fetchProjectInfo(params: DownloadParams): Promise<ProjectInfo> {
  return invoke("fetch_project_info", { params });
}

export function startDownload(
  params: DownloadParams,
  savePath: string,
  concurrency?: number
): Promise<VerifyResult[]> {
  return invoke("start_download", { params, savePath, concurrency });
}
