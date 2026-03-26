import { useState } from "react";
import { transcribeMedia, writeSystemClipboard, type TranscriptionResult } from "../lib/tauri";
import { useLocale } from "../lib/i18n";
import { showToast } from "./Toast";

export function Transcription() {
  const [, t] = useLocale();
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async () => {
    // Use Tauri dialog to pick a file
    const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
    const selected = await openDialog({
      multiple: false,
      filters: [{
        name: "Media Files",
        extensions: ["mp3", "wav", "m4a", "ogg", "flac", "mp4", "mov", "avi", "mkv", "webm"],
      }],
    });
    if (selected) {
      setFilePath(selected as string);
      handleTranscribe(selected as string);
    }
  };

  const handleTranscribe = async (path: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await transcribeMedia(path);
      setResult(res);
      showToast(t("trans.complete"), "success");
    } catch (err) {
      setError(String(err));
      showToast(String(err), "error");
    }
    setLoading(false);
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await writeSystemClipboard(result.text);
      showToast(t("clip.copied"), "success");
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">{t("trans.title")}</h2>
      </div>

      {/* File drop zone */}
      <div
        className="card"
        onClick={handleFileSelect}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          cursor: "pointer",
          border: "2px dashed var(--border)",
          textAlign: "center",
          marginBottom: "16px",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
          <path d="M12 3v12m0 0l-4-4m4 4l4-4"/>
          <path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/>
        </svg>
        <p style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
          {t("trans.dropOrSelect")}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {t("trans.supported")}
        </p>
        {filePath && (
          <p style={{ fontSize: 12, color: "var(--accent)", marginTop: 8 }}>
            {filePath.split("/").pop()}
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px", marginBottom: "16px" }}>
          <div className="spinner" />
          <span style={{ fontSize: 14 }}>{t("trans.transcribing")}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: "var(--error)", marginBottom: "16px" }}>
          <p style={{ color: "var(--error)", fontSize: 13 }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="badge badge-url" style={{ textTransform: "capitalize" }}>{result.language}</span>
              {result.duration_seconds && (
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {Math.floor(result.duration_seconds / 60)}:{String(Math.floor(result.duration_seconds % 60)).padStart(2, "0")}
                </span>
              )}
            </div>
            <button className="btn btn-sm btn-primary" onClick={handleCopy}>
              {t("trans.copyText")}
            </button>
          </div>
          <pre style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 14,
            lineHeight: 1.7,
            fontFamily: "var(--font-sans)",
            margin: 0,
            maxHeight: "300px",
            overflow: "auto",
          }}>
            {result.text}
          </pre>
        </div>
      )}
    </div>
  );
}
