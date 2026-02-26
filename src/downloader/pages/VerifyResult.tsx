import { useTranslation } from "react-i18next";
import type { VerifyResult as VerifyResultType } from "../lib/types";

interface Props {
  results: VerifyResultType[];
  onRetryFailed: () => void;
}

export default function VerifyResult({ results, onRetryFailed }: Props) {
  const { t } = useTranslation();

  const matched = results.filter((r) => r.status === "match");
  const mismatched = results.filter((r) => r.status === "mismatch");
  const noMd5 = results.filter((r) => r.status === "no_md5");
  const hasFailed = mismatched.length > 0;

  const statusIcon = (status: string) => {
    if (status === "match") return "\u2705";
    if (status === "mismatch") return "\u274C";
    if (status === "no_md5") return "\u26A0\uFE0F";
    return "\u2753";
  };

  const statusText = (status: string) => {
    if (status === "match") return t("verify.md5_match");
    if (status === "mismatch") return t("verify.md5_mismatch");
    if (status === "no_md5") return t("verify.md5_none");
    return status;
  };

  return (
    <div className="flex flex-col h-full p-6">
      <h1 className="text-xl font-bold mb-4">
        {hasFailed ? "\u26A0\uFE0F" : "\u2705"} {t("verify.title")}
      </h1>

      <div className="flex gap-4 mb-4 text-sm">
        <span>
          {t("verify.total")}: {results.length}
          {t("verify.items")}
        </span>
        <span className="text-green-600">
          {t("verify.success")}: {matched.length + noMd5.length}
          {t("verify.items")}
        </span>
        {hasFailed && (
          <span className="text-red-600">
            {t("verify.failed")}: {mismatched.length}
            {t("verify.items")}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto border rounded mb-4">
        {results.map((r) => (
          <div
            key={r.fileKey}
            className={`flex items-center px-3 py-2 border-b last:border-b-0 text-sm ${
              r.status === "mismatch" ? "bg-red-50" : ""
            }`}
          >
            <span className="mr-2">{statusIcon(r.status)}</span>
            <span className="flex-1 font-mono truncate">{r.fileKey}</span>
            <span
              className={`ml-2 ${
                r.status === "mismatch" ? "text-red-600" : "text-gray-500"
              }`}
            >
              {statusText(r.status)}
            </span>
          </div>
        ))}
      </div>

      {hasFailed && (
        <button
          onClick={onRetryFailed}
          className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
        >
          {t("verify.retry_failed")}
        </button>
      )}
    </div>
  );
}
