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
  const lang = params.get("lang") || "en";
  const isHe = lang === "he";

  const dismissedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Focus container on mount so keyboard events work
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Play piano chime on popup open
  useEffect(() => {
    try {
      const ctx = new AudioContext();
      const play = (freq: number, delay: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur);
      };
      play(880, 0, 0.15);   // A5
      play(1108, 0.08, 0.2); // C#6
    } catch {}
  }, []);

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
    <div
      tabIndex={0}
      ref={containerRef}
      style={{
        display: "flex", flexDirection: "column",
        padding: "12px 16px",
        background: "#FFF4EA",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        height: "100vh",
        overflow: "hidden",
        borderRadius: 0,
        direction: isHe ? "rtl" : "ltr",
      }}
    >
      {/* Header with logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <img src={logoMark} width={18} height={18} alt="" />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#2C1E1E", letterSpacing: "0.02em" }}>
          {isHe ? "\u05D6\u05D5\u05D4\u05EA\u05D4 \u05E4\u05E8\u05D9\u05E1\u05D4 \u05E9\u05D2\u05D5\u05D9\u05D4" : "Wrong layout detected"}
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
          {isHe ? "\u05EA\u05E7\u05DF (Enter)" : "Fix (Enter)"}
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: "5px 14px", fontSize: 12,
            background: "transparent", color: "#9A7A7A",
            border: "1px solid #EDDCC6", borderRadius: 5, cursor: "pointer",
          }}
        >
          {isHe ? "\u05D4\u05EA\u05E2\u05DC\u05DD (Esc)" : "Dismiss (Esc)"}
        </button>
        <span style={{ fontSize: 10, color: "#9A7A7A", marginLeft: isHe ? undefined : "auto", marginRight: isHe ? "auto" : undefined }}>
          {source} &rarr; {target}
        </span>
      </div>
    </div>
  );
}
