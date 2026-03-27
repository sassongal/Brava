import { useState, useEffect } from "react";
import { getAppVersion } from "../lib/tauri";
import { useLocale } from "../lib/i18n";

// Simple version comparison (assumes semver-like: "0.1.0")
const isUpgrade = (current: string, previous: string): boolean => {
  const c = current.split(".").map(Number);
  const p = previous.split(".").map(Number);
  for (let i = 0; i < Math.max(c.length, p.length); i++) {
    const cv = c[i] || 0;
    const pv = p[i] || 0;
    if (cv > pv) return true;
    if (cv < pv) return false;
  }
  return false;
};

export function WhatsNew() {
  const [, t] = useLocale();
  const [show, setShow] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    getAppVersion().then(v => {
      setVersion(v);
      const lastSeen = localStorage.getItem("brava_whats_new_version");
      if (lastSeen && isUpgrade(v, lastSeen)) {
        setShow(true);
      }
      localStorage.setItem("brava_whats_new_version", v);
    }).catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={() => setShow(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t("whatsNew.title")}</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 4 }}>
          {t("whatsNew.version")} {version}
        </p>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 20, lineHeight: 1.6 }}>
          {t("whatsNew.description")}
        </p>
        <button className="btn btn-primary" onClick={() => setShow(false)}>
          {t("whatsNew.gotIt")}
        </button>
      </div>
    </div>
  );
}
