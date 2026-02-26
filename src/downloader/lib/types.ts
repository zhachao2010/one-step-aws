export interface DownloadParams {
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  project: string;
  expires: string | null;
}

export interface S3FileInfo {
  key: string;
  size: number;
  isMd5File: boolean;
}

export interface FileProgress {
  fileKey: string;
  downloaded: number;
  total: number;
  speedBps: number;
}

export interface OverallProgress {
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  downloadedBytes: number;
  speedBps: number;
  phase: "listing" | "downloading" | "verifying" | "done";
}

export interface VerifyResult {
  fileKey: string;
  status: "match" | "mismatch" | "no_md5" | "error";
  expected: string | null;
  calculated: string | null;
}
