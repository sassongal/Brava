import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error" | "info" | "warning";
}

let toastId = 0;
const listeners: ((msg: ToastMessage) => void)[] = [];

export function showToast(text: string, type: ToastMessage["type"] = "info") {
  const msg: ToastMessage = { id: ++toastId, text, type };
  listeners.forEach((fn) => fn(msg));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: ToastMessage) => {
    setToasts((prev) => [...prev, msg]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== msg.id));
    }, 3000);
  }, []);

  useEffect(() => {
    listeners.push(addToast);
    return () => {
      const idx = listeners.indexOf(addToast);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, [addToast]);

  // Listen for backend toast events (explicit notifications only, not clipboard-changed)
  useEffect(() => {
    const unsub = listen<string>("toast", (event) => {
      showToast(event.payload, "info");
    });
    return () => { unsub.then((fn) => fn()); };
  }, []);

  if (toasts.length === 0) return null;

  const typeColors: Record<string, string> = {
    success: "var(--success)",
    error: "var(--error)",
    warning: "var(--warning)",
    info: "var(--accent)",
  };

  const typeIcons: Record<string, string> = {
    success: "\u2713",
    error: "\u2717",
    warning: "\u26A0",
    info: "\u2139",
  };

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast"
          style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: `3px solid ${typeColors[t.type]}` }}
        >
          <span style={{ color: typeColors[t.type], fontWeight: 700 }}>{typeIcons[t.type]}</span>
          <span style={{ fontSize: 13 }}>{t.text}</span>
          <button
            className="btn-icon"
            style={{ marginLeft: 8, fontSize: 11 }}
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          >
            {"\u2715"}
          </button>
        </div>
      ))}
    </div>
  );
}
