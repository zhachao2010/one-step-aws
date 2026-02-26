import { useTranslation } from "react-i18next";
import { formatBytes, daysUntil } from "../../lib/format";
import type { S3FileInfo } from "../lib/types";

interface Props {
  project: string;
  expires: string | null;
  files: S3FileInfo[];
  totalSize: number;
  onStartDownload: (dirHandle: FileSystemDirectoryHandle) => void;
}

export default function ProjectInfo({
  project,
  expires,
  files,
  totalSize,
  onStartDownload,
}: Props) {
  const { t } = useTranslation();
  const dataFiles = files.filter((f) => !f.isMd5File);
  const days = expires ? daysUntil(expires) : null;

  const handleSelectFolder = async () => {
    const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    onStartDownload(dirHandle);
  };

  return (
    <div className="flex flex-col h-full p-6">
      <h1 className="text-xl font-bold mb-6">{t("project_info.title")}</h1>

      <div className="space-y-3 mb-6">
        <div className="flex justify-between">
          <span className="text-gray-500">{t("project_info.file_count")}</span>
          <span className="font-mono">{dataFiles.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t("project_info.total_size")}</span>
          <span className="font-mono">{formatBytes(totalSize)}</span>
        </div>
        {expires && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t("project_info.expires")}</span>
            <span
              className={`font-mono ${days !== null && days < 3 ? "text-red-500" : ""}`}
            >
              {expires}
              {days !== null && days > 0
                ? ` (${t("project_info.days_left", { days })})`
                : ` (${t("project_info.expired")})`}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto border rounded mb-6">
        <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium text-gray-600">
          {project}
        </div>
        {dataFiles.map((f) => {
          const prefix = project.endsWith("/") ? project : `${project}/`;
          const relPath = f.key.startsWith(prefix)
            ? f.key.slice(prefix.length)
            : f.key;
          return (
            <div
              key={f.key}
              className="flex items-center px-3 py-2 border-b last:border-b-0 text-sm"
            >
              <span className="flex-1 font-mono truncate">{relPath}</span>
              <span className="text-gray-500 ml-2">{formatBytes(f.size)}</span>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-gray-500 mb-3">
        {t("browser.select_folder_desc")}
      </p>

      <button
        onClick={handleSelectFolder}
        disabled={days !== null && days <= 0}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {t("browser.select_folder")}
      </button>
    </div>
  );
}
