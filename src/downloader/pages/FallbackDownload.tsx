import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { formatBytes, daysUntil } from "../../lib/format";
import type { DownloadParams, S3FileInfo } from "../lib/types";
import { createS3Client } from "../lib/s3-browser";

interface Props {
  params: DownloadParams;
  files: S3FileInfo[];
  project: string;
  expires: string | null;
  totalSize: number;
}

export default function FallbackDownload({
  params,
  files,
  project,
  expires,
  totalSize,
}: Props) {
  const { t } = useTranslation();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const dataFiles = files.filter((f) => !f.isMd5File);
  const days = expires ? daysUntil(expires) : null;
  const prefix = project.endsWith("/") ? project : `${project}/`;

  const handleDownload = async (file: S3FileInfo) => {
    setLoadingKey(file.key);
    try {
      const client = createS3Client(params.accessKey, params.secretKey, params.region);
      const command = new GetObjectCommand({
        Bucket: params.bucket,
        Key: file.key,
      });
      const url = await getSignedUrl(client, command, { expiresIn: 3600 });

      // Trigger native browser download via temporary anchor
      const a = document.createElement("a");
      a.href = url;
      a.download = file.key.split("/").pop() ?? file.key;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="flex flex-col h-full p-6">
      <h1 className="text-xl font-bold mb-4">{t("project_info.title")}</h1>

      <div className="space-y-3 mb-4">
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

      {/* Browser compatibility notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <p className="text-sm font-medium text-amber-800 mb-1">
          {t("browser.unsupported_title")}
        </p>
        <p className="text-sm text-amber-700">
          {t("browser.unsupported_message")}
        </p>
      </div>

      <p className="text-sm font-medium text-gray-600 mb-2">
        {t("browser.download_individual")}
      </p>

      <div className="flex-1 overflow-y-auto border rounded mb-4">
        {dataFiles.map((f) => {
          const relPath = f.key.startsWith(prefix)
            ? f.key.slice(prefix.length)
            : f.key;
          const isLoading = loadingKey === f.key;
          return (
            <div
              key={f.key}
              className="flex items-center px-3 py-2 border-b last:border-b-0 text-sm"
            >
              <span className="flex-1 font-mono truncate">{relPath}</span>
              <span className="text-gray-500 ml-2 shrink-0">
                {formatBytes(f.size)}
              </span>
              <button
                onClick={() => handleDownload(f)}
                disabled={isLoading || (days !== null && days <= 0)}
                className="ml-3 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isLoading
                  ? t("browser.generating_link")
                  : t("browser.fallback_download")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
