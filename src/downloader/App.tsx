import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { parseUrlParams, type DownloadParams } from "./lib/url-parser";
import { createS3Client, listProjectFiles, type S3FileInfo } from "./lib/s3-browser";
import { runDownload } from "./lib/download-engine";
import type { FileProgress, OverallProgress, VerifyResult as VerifyResultType } from "./lib/types";
import ProjectInfo from "./pages/ProjectInfo";
import DownloadProgress from "./pages/DownloadProgress";
import VerifyResult from "./pages/VerifyResult";
import FallbackDownload from "./pages/FallbackDownload";
import type { S3Client } from "@aws-sdk/client-s3";

interface ProjectData {
  project: string;
  bucket: string;
  region: string;
  expires: string | null;
  files: S3FileInfo[];
  totalSize: number;
}

type Page = "loading" | "project-info" | "downloading" | "results" | "error";

const supportsFileSystemAccess = "showDirectoryPicker" in window;

export default function App() {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>("loading");
  const [params, setParams] = useState<DownloadParams | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectData | null>(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<VerifyResultType[]>([]);
  const [overall, setOverall] = useState<OverallProgress>({
    totalFiles: 0, completedFiles: 0,
    totalBytes: 0, downloadedBytes: 0,
    speedBps: 0, phase: "listing",
  });
  const [fileProgress, setFileProgress] = useState<Map<string, FileProgress>>(new Map());
  const clientRef = useRef<S3Client | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const loadProject = useCallback(async (p: DownloadParams) => {
    try {
      if (p.expires) {
        const expDate = new Date(p.expires);
        if (expDate < new Date()) {
          setError(t("error.expired_message", { date: p.expires }));
          setPage("error");
          return;
        }
      }

      const client = createS3Client(p.accessKey, p.secretKey, p.region);
      clientRef.current = client;
      const files = await listProjectFiles(client, p.bucket, p.project);
      const totalSize = files.filter((f) => !f.isMd5File).reduce((sum, f) => sum + f.size, 0);

      setProjectInfo({
        project: p.project,
        bucket: p.bucket,
        region: p.region,
        expires: p.expires,
        files,
        totalSize,
      });
      setPage("project-info");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  }, [t]);

  useEffect(() => {
    try {
      const p = parseUrlParams(window.location.search);
      setParams(p);
      loadProject(p);
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  }, [loadProject]);

  const handleStartDownload = useCallback(async (dirHandle: FileSystemDirectoryHandle) => {
    if (!params || !projectInfo || !clientRef.current) return;
    dirHandleRef.current = dirHandle;
    setPage("downloading");
    setFileProgress(new Map());

    try {
      const r = await runDownload({
        client: clientRef.current,
        bucket: projectInfo.bucket,
        project: projectInfo.project,
        files: projectInfo.files,
        dirHandle,
        concurrency: 3,
        onFileProgress: (fp) => {
          setFileProgress((prev) => {
            const next = new Map(prev);
            next.set(fp.fileKey, fp);
            return next;
          });
        },
        onOverallProgress: (op) => {
          setOverall(op);
        },
      });
      setResults(r);
      setPage("results");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  }, [params, projectInfo]);

  const handleRetryFailed = useCallback(async () => {
    if (!params || !projectInfo || !clientRef.current || !dirHandleRef.current) return;
    // Filter to only failed files for retry
    const failedKeys = new Set(
      results.filter((r) => r.status === "mismatch" || r.status === "error").map((r) => r.fileKey),
    );
    const prefix = projectInfo.project.endsWith("/") ? projectInfo.project : `${projectInfo.project}/`;
    const retryFiles = projectInfo.files.filter((f) => {
      const relPath = f.key.startsWith(prefix) ? f.key.slice(prefix.length) : f.key;
      return failedKeys.has(relPath) || failedKeys.has(f.key);
    });

    setPage("downloading");
    setFileProgress(new Map());
    try {
      const r = await runDownload({
        client: clientRef.current,
        bucket: projectInfo.bucket,
        project: projectInfo.project,
        files: retryFiles,
        dirHandle: dirHandleRef.current,
        concurrency: 3,
        onFileProgress: (fp) => {
          setFileProgress((prev) => {
            const next = new Map(prev);
            next.set(fp.fileKey, fp);
            return next;
          });
        },
        onOverallProgress: (op) => {
          setOverall(op);
        },
      });
      // Merge retry results with previous successful results
      const successfulPrevious = results.filter(
        (r) => r.status === "match" || r.status === "no_md5",
      );
      setResults([...successfulPrevious, ...r]);
      setPage("results");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  }, [params, projectInfo, results]);

  // Loading spinner
  if (page === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-400">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p>{t("app_name")}</p>
        </div>
      </div>
    );
  }

  // Error page
  if (page === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
        <div className="max-w-md text-center">
          <p className="text-red-600 mb-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      <header className="h-12 flex items-center px-6 bg-gray-50 border-b">
        <span className="text-sm font-medium">{t("app_name")}</span>
        {projectInfo && (
          <span className="ml-2 text-sm text-gray-400">
            &mdash; {projectInfo.project}
          </span>
        )}
      </header>

      <main className="flex-1 overflow-hidden">
        {page === "project-info" && params && projectInfo && (
          supportsFileSystemAccess ? (
            <ProjectInfo
              project={projectInfo.project}
              expires={projectInfo.expires}
              files={projectInfo.files}
              totalSize={projectInfo.totalSize}
              onStartDownload={handleStartDownload}
            />
          ) : (
            <FallbackDownload
              params={params}
              files={projectInfo.files}
              project={projectInfo.project}
              expires={projectInfo.expires}
              totalSize={projectInfo.totalSize}
            />
          )
        )}

        {page === "downloading" && (
          <DownloadProgress overall={overall} fileProgress={fileProgress} />
        )}

        {page === "results" && (
          <VerifyResult results={results} onRetryFailed={handleRetryFailed} />
        )}
      </main>
    </div>
  );
}
