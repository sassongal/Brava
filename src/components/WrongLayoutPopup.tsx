import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logoMark from "../assets/brava-brand/logos/logo-mark.svg";

export function WrongLayoutPopup() {
  const params = new URLSearchParams(window.location.search);
  const wrongText = decodeURIComponent(params.get("wrong") || "");
  const suggestedText = decodeURIComponent(params.get("suggested") || "");
  const source = decodeURIComponent(params.get("source") || "");
  const target = decodeURIComponent(params.get("target") || "");

  const dismissedRef = useRef(false);

  const close = async () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    const win = getCurrentWindow();
    await win.close();
  };

  const handleFix = async () => {
    try {
      // Write the already-converted text to clipboard
      await invoke("write_system_clipboard", { text: suggestedText });
      // Brief delay then simulate paste and close
      setTimeout(async () => {
        try {
          await invoke("simulate_paste_action");
        } catch {}
        await close();
      }, 100);
    } catch {
      await close();
    }
  };

  const handleDismiss = async () => {
    await close();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        try {
          await invoke("write_system_clipboard", { text: suggestedText });
          setTimeout(async () => {
            try { await invoke("simulate_paste_action"); } catch {}
            await close();
          }, 100);
        } catch {}
      }
      if (e.key === "Escape") {
        await close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [suggestedText]);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    const timer = setTimeout(() => close(), 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      padding: "12px 16px",
      background: "#FFF4EA",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      height: "100vh",
      overflow: "hidden",
      borderRadius: 0,
    }}>
      {/* Header with logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <img src={logoMark} width={18} height={18} alt="" />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#2C1E1E", letterSpacing: "0.02em" }}>
          Wrong layout detected
        </span>
      </div>

      {/* Content */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <div style={{
          flex: 1, fontSize: 13, color: "#5C4040",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          <span style={{ textDecoration: "line-through", opacity: 0.5 }}>{wrongText.slice(0, 30)}</span>
          <span style={{ margin: "0 6px", color: "#BF4646" }}>&rarr;</span>
          <strong style={{ color: "#2C1E1E" }}>{suggestedText.slice(0, 30)}</strong>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleFix}
          style={{
            padding: "5px 14px", fontSize: 12, fontWeight: 600,
            background: "#BF4646", color: "#fff", border: "none",
            borderRadius: 5, cursor: "pointer",
          }}
        >
          Fix (Enter)
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: "5px 14px", fontSize: 12,
            background: "transparent", color: "#9A7A7A",
            border: "1px solid #EDDCC6", borderRadius: 5, cursor: "pointer",
          }}
        >
          Dismiss (Esc)
        </button>
        <span style={{ fontSize: 10, color: "#9A7A7A", marginLeft: "auto" }}>
          {source} &rarr; {target}
        </span>
      </div>
    </div>
  );
}
