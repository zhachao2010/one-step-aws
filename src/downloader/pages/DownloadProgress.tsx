import { useTranslation } from "react-i18next";
import { formatBytes } from "../../lib/format";
import type { FileProgress, OverallProgress } from "../lib/types";

interface Props {
  overall: OverallProgress;
  fileProgress: Map<string, FileProgress>;
}

export default function DownloadProgress({ overall, fileProgress }: Props) {
  const { t } = useTranslation();

  const files = Array.from(fileProgress.values());
  const computedDownloaded = files.reduce((sum, f) => sum + f.downloaded, 0);
  const computedSpeed = files.reduce((sum, f) => sum + f.speedBps, 0);

  const displayTotal = overall.totalBytes;
  const displayDownloaded = computedDownloaded;
  const displaySpeed = overall.phase === "done" ? 0 : computedSpeed;

  const pct =
    displayTotal > 0
      ? Math.round((displayDownloaded / displayTotal) * 100)
      : 0;

  const remainingMin =
    displaySpeed > 0
      ? Math.ceil((displayTotal - displayDownloaded) / displaySpeed / 60)
      : 0;

  const sortedFiles = [...files].sort((a, b) => {
    const pctA = a.total > 0 ? a.downloaded / a.total : 0;
    const pctB = b.total > 0 ? b.downloaded / b.total : 0;
    return pctB - pctA;
  });

  const statusText = (fp: FileProgress) => {
    if (fp.downloaded >= fp.total) return t("download.status_done");
    if (fp.downloaded > 0)
      return `${Math.round((fp.downloaded / fp.total) * 100)}%`;
    return t("download.status_waiting");
  };

  return (
    <div className="flex flex-col h-full p-6">
      <h1 className="text-xl font-bold mb-4">{t("download.title")}</h1>

      <div className="mb-2 text-sm text-gray-600">
        {t("download.overall_progress")}: {pct}% ({formatBytes(displayDownloaded)}{" "}
        / {formatBytes(displayTotal)})
      </div>

      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
        <div
          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-sm text-gray-500 mb-4">
        <span>
          {t("download.speed")}: {formatBytes(displaySpeed)}/s
        </span>
        <span>
          {t("download.remaining")}:{" "}
          {remainingMin > 0
            ? t("download.about_minutes", { minutes: remainingMin })
            : "--"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto border rounded">
        {sortedFiles.map((fp) => (
          <div
            key={fp.fileKey}
            className="flex items-center px-3 py-2 border-b last:border-b-0 text-sm"
          >
            <span className="flex-1 font-mono truncate">{fp.fileKey}</span>
            <span className="text-gray-500 ml-2 w-16 text-right">
              {formatBytes(fp.total)}
            </span>
            <span className="ml-2 w-12 text-right">{statusText(fp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
