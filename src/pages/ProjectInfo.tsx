import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { downloadDir } from "@tauri-apps/api/path";
import { DownloadParams, ProjectInfo as ProjectInfoType } from "../lib/tauri-api";
import { formatBytes, daysUntil } from "../lib/format";

interface Props {
  params: DownloadParams;
  info: ProjectInfoType;
  onStartDownload: (savePath: string) => void;
}

export default function ProjectInfo({ params: _params, info, onStartDownload }: Props) {
  const { t } = useTranslation();
  const [savePath, setSavePath] = useState<string>("");
  const [defaultPath, setDefaultPath] = useState<string>(`~/Downloads/${info.project}`);

  useEffect(() => {
    downloadDir().then((dir) => {
      setDefaultPath(`${dir}/${info.project}`);
    }).catch(() => {});
  }, [info.project]);

  const dataFiles = info.files.filter((f) => !f.is_md5_file);
  const days = info.expires ? daysUntil(info.expires) : null;

  const handleChangePath = async () => {
    const selected = await open({ directory: true });
    if (selected) setSavePath(selected as string);
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
          <span className="font-mono">{formatBytes(info.total_size)}</span>
        </div>
        {info.expires && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t("project_info.expires")}</span>
            <span className={`font-mono ${days !== null && days < 3 ? "text-red-500" : ""}`}>
              {info.expires}
              {days !== null && days > 0
                ? ` (${t("project_info.days_left", { days })})`
                : ` (${t("project_info.expired")})`}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded mb-6">
        <span className="text-gray-500 text-sm">{t("project_info.save_to")}:</span>
        <span className="flex-1 font-mono text-sm truncate">
          {savePath || defaultPath}
        </span>
        <button
          onClick={handleChangePath}
          className="text-sm text-blue-600 hover:underline"
        >
          {t("project_info.change")}
        </button>
      </div>

      <div className="mt-auto">
        <button
          onClick={() => onStartDownload(savePath || defaultPath)}
          disabled={days !== null && days <= 0}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {info.has_existing_state
            ? t("project_info.resume_download")
            : t("project_info.start_download")}
        </button>
      </div>
    </div>
  );
}
