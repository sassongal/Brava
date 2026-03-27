import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  enqueueTranscription,
  enqueueTranscriptionBlob,
  listTranscriptions,
  writeSystemClipboard,
  type TranscriptionJobEvent,
  type TranscriptionJobRecord,
} from "../lib/tauri";
import { useLocale } from "../lib/i18n";
import { showToast } from "./Toast";

export function Transcription() {
  const [, t] = useLocale();
  const [jobs, setJobs] = useState<TranscriptionJobRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const refreshJobs = async () => {
    setLoadingList(true);
    try {
      const data = await listTranscriptions(100, 0);
      setJobs(data);
    } catch (err) {
      showToast(String(err), "error");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void refreshJobs();
    let unlisten: (() => void) | null = null;
    void listen<TranscriptionJobEvent>("transcription-job-updated", (event) => {
      const payload = event.payload;
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === payload.id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: payload.status,
          error_message: payload.status === "failed" ? payload.message : next[idx].error_message,
        };
        return next;
      });
      void refreshJobs();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleFileSelect = async () => {
    if (enqueuing || loadingList) return;
    // Use Tauri dialog to pick a file
    const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
    const selected = await openDialog({
      multiple: false,
      filters: [{
        name: t("trans.mediaFiles"),
        extensions: ["mp3", "wav", "m4a", "ogg", "flac", "mp4", "mov", "avi", "mkv", "webm"],
      }],
    });
    if (selected) {
      setFilePath(selected as string);
      await handleEnqueue(selected as string);
    }
  };

  const handleEnqueue = async (path: string) => {
    setEnqueuing(true);
    setError(null);
    try {
      await enqueueTranscription(path);
      showToast(t("trans.queued"), "success");
      await refreshJobs();
    } catch (err) {
      setError(String(err));
      showToast(String(err), "error");
    }
    setEnqueuing(false);
  };

  const toBase64 = async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const startQuickRecording = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (blob.size === 0) {
          showToast(t("trans.recordingEmpty"), "warning");
          return;
        }
        setEnqueuing(true);
        try {
          const base64 = await toBase64(blob);
          await enqueueTranscriptionBlob(base64, "audio/webm");
          showToast(t("trans.recordingQueued"), "success");
          await refreshJobs();
        } catch (err) {
          showToast(String(err), "error");
        } finally {
          setEnqueuing(false);
        }
      };
      recorder.start(300);
      setMediaRecorder(recorder);
      setRecording(true);
      showToast(t("trans.recordingStarted"), "info");
    } catch (err) {
      showToast(String(err), "error");
    }
  };

  const stopQuickRecording = () => {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    setMediaRecorder(null);
    setRecording(false);
  };

  const latestCompleted = useMemo(
    () => jobs.find((job) => job.status === "completed" && job.text),
    [jobs],
  );

  const handleCopy = async (text: string) => {
    try {
      await writeSystemClipboard(text);
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
          cursor: enqueuing ? "not-allowed" : "pointer",
          opacity: enqueuing ? 0.6 : 1,
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

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {!recording ? (
          <button className="btn btn-primary" onClick={startQuickRecording}>
            🎙️ {t("trans.quickRecord")}
          </button>
        ) : (
          <button className="btn btn-danger" onClick={stopQuickRecording}>
            ⏹️ {t("trans.stopRecord")}
          </button>
        )}
      </div>

      {/* Loading */}
      {(enqueuing || loadingList) && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px", marginBottom: "16px" }}>
          <div className="spinner" />
          <span style={{ fontSize: 14 }}>{enqueuing ? t("trans.queueing") : t("trans.loading")}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: "var(--error)", marginBottom: "16px" }}>
          <p style={{ color: "var(--error)", fontSize: 13 }}>{error}</p>
        </div>
      )}

      {/* Latest result quick view */}
      {latestCompleted && latestCompleted.text && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="badge badge-url" style={{ textTransform: "capitalize" }}>{latestCompleted.language ?? "unknown"}</span>
              {latestCompleted.duration_seconds && (
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {Math.floor(latestCompleted.duration_seconds / 60)}:{String(Math.floor(latestCompleted.duration_seconds % 60)).padStart(2, "0")}
                </span>
              )}
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => handleCopy(latestCompleted.text!)}>
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
            {latestCompleted.text}
          </pre>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("trans.history")}</div>
        {jobs.length === 0 && <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{t("trans.none")}</div>}
        {jobs.map((job) => (
          <div key={job.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job.file_name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {new Date(job.created_at).toLocaleString()}
                </div>
              </div>
              <span className="badge badge-url" style={{ textTransform: "capitalize" }}>{job.status}</span>
            </div>
            {job.status === "failed" && job.error_message && (
              <div style={{ fontSize: 12, color: "var(--error)", marginTop: 6 }}>{job.error_message}</div>
            )}
            {job.status === "completed" && job.text && (
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job.text.slice(0, 120)}
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => handleCopy(job.text ?? "")}>
                  {t("trans.copyText")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
