import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { parseUrlParams } from "./lib/url-parser";
import { createS3Client, listProjectFiles } from "./lib/s3-browser";
import { runDownload } from "./lib/download-engine";
import type { DownloadParams, S3FileInfo, FileProgress, OverallProgress, VerifyResult as VerifyResultType } from "./lib/types";
import DownloadProgress from "./pages/DownloadProgress";
import VerifyResult from "./pages/VerifyResult";
import PresignedDownload from "./pages/PresignedDownload";
import StreamingDownload from "./pages/StreamingDownload";
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
  const [hasCors, setHasCors] = useState(false);
  const [overall, setOverall] = useState<OverallProgress>({
    totalFiles: 0, completedFiles: 0,
    totalBytes: 0, downloadedBytes: 0,
    speedBps: 0, phase: "listing",
  });
  const [fileProgress, setFileProgress] = useState<Map<string, FileProgress>>(new Map());
  const clientRef = useRef<S3Client | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const buildProjectInfo = useCallback((p: DownloadParams, files: S3FileInfo[]): ProjectData => {
    const totalSize = files.filter((f) => !f.isMd5File).reduce((sum, f) => sum + f.size, 0);
    return {
      project: p.project,
      bucket: p.bucket,
      region: p.region,
      expires: p.expires,
      files,
      totalSize,
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { params: p, manifest } = parseUrlParams(
          window.location.search,
          window.location.hash,
        );
        setParams(p);

        // Check expiry
        if (p.expires) {
          const expDate = new Date(p.expires);
          if (expDate < new Date()) {
            setError(t("error.expired_message", { date: p.expires }));
            setPage("error");
            return;
          }
        }

        // If manifest is embedded in URL, use it directly (no CORS needed)
        if (manifest && manifest.length > 0) {
          setProjectInfo(buildProjectInfo(p, manifest));
          setHasCors(false);
          setPage("project-info");
          return;
        }

        // No manifest — try S3 listing (needs CORS)
        const client = createS3Client(p.accessKey, p.secretKey, p.region);
        clientRef.current = client;
        const files = await listProjectFiles(client, p.bucket, p.project);
        setProjectInfo(buildProjectInfo(p, files));
        setHasCors(true);
        setPage("project-info");
      } catch (e) {
        setError(String(e));
        setPage("error");
      }
    })();
  }, [t, buildProjectInfo]);

  const handleStartStreaming = useCallback(async (dirHandle: FileSystemDirectoryHandle) => {
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
          hasCors && supportsFileSystemAccess ? (
            <StreamingDownload
              project={projectInfo.project}
              expires={projectInfo.expires}
              files={projectInfo.files}
              totalSize={projectInfo.totalSize}
              onStartDownload={handleStartStreaming}
            />
          ) : (
            <PresignedDownload
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
