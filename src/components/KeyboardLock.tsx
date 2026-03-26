import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useLocale } from "../lib/i18n";

export function KeyboardLock() {
  const [, t] = useLocale();
  const [locked, setLocked] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    // Check initial status
    invoke<boolean>("get_keyboard_lock_status").then(setLocked);

    const unsub = listen("keyboard-lock-changed", (event) => {
      setLocked(event.payload as boolean);
    });
    return () => { unsub.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    if (!locked) { setTimer(0); return; }
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [locked]);

  const handleUnlock = useCallback(async () => {
    await invoke("toggle_keyboard_lock");
    setLocked(false);
  }, []);

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Block all keyboard events when locked (except the unlock button click)
  useEffect(() => {
    if (!locked) return;
    const blockKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", blockKey, true);
    window.addEventListener("keyup", blockKey, true);
    window.addEventListener("keypress", blockKey, true);
    return () => {
      window.removeEventListener("keydown", blockKey, true);
      window.removeEventListener("keyup", blockKey, true);
      window.removeEventListener("keypress", blockKey, true);
    };
  }, [locked]);

  if (!locked) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.85)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10000,
      color: "#fff",
    }}>
      <div style={{ fontSize: 80, marginBottom: 16 }}>{"\uD83D\uDD12"}</div>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{t("lock.title")}</h1>
      <p style={{ fontSize: 18, color: "var(--brava-beige)", marginBottom: 24 }}>
        {t("lock.elapsed")}: {formatTimer(timer)}
      </p>
      <p style={{ fontSize: 14, color: "var(--brava-ink-soft)", marginBottom: 32 }}>
        {t("lock.clickUnlock")}
      </p>
      <button
        onClick={handleUnlock}
        style={{
          padding: "12px 32px",
          fontSize: 16,
          fontWeight: 600,
          borderRadius: 8,
          border: "none",
          background: "var(--accent)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        {"\uD83D\uDD13"} {t("lock.unlock")}
      </button>
    </div>
  );
}
