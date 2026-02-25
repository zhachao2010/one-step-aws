import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  DownloadParams,
  ProjectInfo as ProjectInfoType,
  VerifyResult as VerifyResultType,
  getInitialUrl,
  parseDownloadUrl,
  fetchProjectInfo,
  startDownload,
} from "./lib/tauri-api";
import ProjectInfo from "./pages/ProjectInfo";
import DownloadProgress from "./pages/DownloadProgress";
import VerifyResult from "./pages/VerifyResult";

type Page = "loading" | "project-info" | "downloading" | "results" | "error";

export default function App() {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>("loading");
  const [params, setParams] = useState<DownloadParams | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfoType | null>(null);
  const [results, setResults] = useState<VerifyResultType[]>([]);
  const [savePath, setSavePath] = useState("");
  const [error, setError] = useState("");

  const handleDeepLink = useCallback(async (url: string) => {
    try {
      setPage("loading");
      const p = await parseDownloadUrl(url);
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

      const info = await fetchProjectInfo(p);
      setProjectInfo(info);
      setPage("project-info");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  }, [t]);

  // Check for initial deep link URL stored by Rust (with retry for timing edge cases)
  useEffect(() => {
    let cancelled = false;
    const tryGetUrl = async (retries: number) => {
      const url = await getInitialUrl();
      if (cancelled) return;
      if (url) {
        handleDeepLink(url);
      } else if (retries > 0) {
        setTimeout(() => tryGetUrl(retries - 1), 300);
      }
    };
    tryGetUrl(5);
    return () => { cancelled = true; };
  }, [handleDeepLink]);

  // Listen for deep links while the app is already running
  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    (async () => {
      unlisteners.push(
        await listen<string>("deep-link", (e) => {
          handleDeepLink(e.payload);
        })
      );
    })();
    return () => unlisteners.forEach((fn) => fn());
  }, [handleDeepLink]);

  const handleStartDownload = async (path: string) => {
    if (!params) return;
    setSavePath(path);
    setPage("downloading");
    try {
      const r = await startDownload(params, path);
      setResults(r);
      setPage("results");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  };

  const handleRetryFailed = async () => {
    if (!params) return;
    setPage("downloading");
    try {
      const r = await startDownload(params, savePath);
      setResults(r);
      setPage("results");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900">
      <div className="h-8 flex items-center px-4 bg-gray-50 border-b text-sm font-medium select-none"
        data-tauri-drag-region="">
        {t("app_name")}
        {projectInfo && (
          <span className="ml-2 text-gray-400">&mdash; {projectInfo.project}</span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {page === "loading" && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>{t("app_name")}</p>
          </div>
        )}

        {page === "project-info" && params && projectInfo && (
          <ProjectInfo
            params={params}
            info={projectInfo}
            onStartDownload={handleStartDownload}
          />
        )}

        {page === "downloading" && (
          <DownloadProgress onComplete={() => {}} />
        )}

        {page === "results" && (
          <VerifyResult
            results={results}
            savePath={savePath}
            onRetryFailed={handleRetryFailed}
          />
        )}

        {page === "error" && (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <p className="text-red-600 text-center">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
