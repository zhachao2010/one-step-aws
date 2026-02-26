import SparkMD5 from "spark-md5";
import type { S3Client } from "@aws-sdk/client-s3";
import { getObjectStream, getObjectText, type S3FileInfo } from "./s3-browser";
import { parseMd5Content } from "./md5-utils";
import type { VerifyResult, FileProgress, OverallProgress } from "./types";

interface DownloadOptions {
  client: S3Client;
  bucket: string;
  project: string;
  files: S3FileInfo[];
  dirHandle: FileSystemDirectoryHandle;
  concurrency?: number;
  onFileProgress?: (progress: FileProgress) => void;
  onOverallProgress?: (progress: OverallProgress) => void;
}

class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

async function getOrCreateSubDir(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = path.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
}

export async function runDownload(
  options: DownloadOptions,
): Promise<VerifyResult[]> {
  const {
    client,
    bucket,
    project,
    files,
    dirHandle,
    concurrency = 3,
    onFileProgress,
    onOverallProgress,
  } = options;

  const prefix = project.endsWith("/") ? project : `${project}/`;

  // Phase: listing
  onOverallProgress?.({
    totalFiles: 0,
    completedFiles: 0,
    totalBytes: 0,
    downloadedBytes: 0,
    speedBps: 0,
    phase: "listing",
  });

  // Separate MD5 and data files
  const md5Files = files.filter((f) => f.isMd5File);
  const dataFiles = files.filter((f) => !f.isMd5File);

  // Download and parse all MD5 files
  const md5Map = new Map<string, string>();
  for (const mf of md5Files) {
    const content = await getObjectText(client, bucket, mf.key);
    for (const [name, hash] of parseMd5Content(content)) {
      md5Map.set(name, hash);
    }
  }

  const totalBytes = dataFiles.reduce((sum, f) => sum + f.size, 0);

  // Phase: downloading
  onOverallProgress?.({
    totalFiles: dataFiles.length,
    completedFiles: 0,
    totalBytes,
    downloadedBytes: 0,
    speedBps: 0,
    phase: "downloading",
  });

  // Track overall progress
  let completedFiles = 0;
  let totalDownloaded = 0;
  const overallStart = performance.now();

  const semaphore = new Semaphore(concurrency);
  const results: VerifyResult[] = [];

  const downloadFile = async (file: S3FileInfo): Promise<VerifyResult> => {
    await semaphore.acquire();
    try {
      const relPath = file.key.startsWith(prefix)
        ? file.key.slice(prefix.length)
        : file.key;
      const basename = relPath.split("/").pop() ?? relPath;

      // Create subdirectories if needed
      const dirParts = relPath.split("/");
      dirParts.pop(); // remove filename
      const parentDir =
        dirParts.length > 0
          ? await getOrCreateSubDir(dirHandle, dirParts.join("/"))
          : dirHandle;

      // Create file handle
      const fileHandle = await parentDir.getFileHandle(basename, {
        create: true,
      });
      const writable = await fileHandle.createWritable();

      // Stream from S3
      const stream = await getObjectStream(client, bucket, file.key);
      const reader = stream.getReader();

      const spark = new SparkMD5.ArrayBuffer();
      let downloaded = 0;
      const fileStart = performance.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await writable.write(value as unknown as BufferSource);
        spark.append(value.buffer as ArrayBuffer);
        downloaded += value.byteLength;
        totalDownloaded += value.byteLength;

        const elapsed = (performance.now() - fileStart) / 1000;
        const speed = elapsed > 0 ? downloaded / elapsed : 0;

        onFileProgress?.({
          fileKey: relPath,
          downloaded,
          total: file.size,
          speedBps: Math.round(speed),
        });

        // Update overall progress
        const overallElapsed = (performance.now() - overallStart) / 1000;
        const overallSpeed =
          overallElapsed > 0 ? totalDownloaded / overallElapsed : 0;
        onOverallProgress?.({
          totalFiles: dataFiles.length,
          completedFiles,
          totalBytes,
          downloadedBytes: totalDownloaded,
          speedBps: Math.round(overallSpeed),
          phase: "downloading",
        });
      }

      await writable.close();
      completedFiles++;

      const md5Calc = spark.end();
      const expectedMd5 = md5Map.get(basename) ?? null;

      let status: VerifyResult["status"];
      if (!expectedMd5) {
        status = "no_md5";
      } else if (expectedMd5 === md5Calc) {
        status = "match";
      } else {
        status = "mismatch";
      }

      return {
        fileKey: relPath,
        status,
        expected: expectedMd5,
        calculated: md5Calc,
      };
    } catch (e) {
      return {
        fileKey: file.key,
        status: "error",
        expected: null,
        calculated: null,
      };
    } finally {
      semaphore.release();
    }
  };

  // Launch all downloads (semaphore limits concurrency)
  const promises = dataFiles.map((f) => downloadFile(f));
  const settled = await Promise.allSettled(promises);

  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      results.push({
        fileKey: "unknown",
        status: "error",
        expected: null,
        calculated: null,
      });
    }
  }

  // Phase: done
  onOverallProgress?.({
    totalFiles: dataFiles.length,
    completedFiles: dataFiles.length,
    totalBytes,
    downloadedBytes: totalBytes,
    speedBps: 0,
    phase: "done",
  });

  return results;
}
