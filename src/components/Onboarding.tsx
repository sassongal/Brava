import { useState, useEffect, useCallback } from "react";
import { useLocale, setLocale } from "../lib/i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkPermissions, getAppInfo, type PermissionStatus } from "../lib/tauri";

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [locale, t] = useLocale();
  const [step, setStep] = useState(0);
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [currentPlatform, setCurrentPlatform] = useState<string>("macos");
  const isHebrew = locale === "he";

  // Detect platform on mount
  useEffect(() => {
    getAppInfo().then((info) => setCurrentPlatform(info.platform)).catch(() => {});
  }, []);

  const refreshPermissions = useCallback(async () => {
    try {
      const status = await checkPermissions();
      setPermissions(status);
    } catch {
      setPermissions({ accessibility: false, screen_recording: false });
    }
  }, []);

  // Poll permissions when on the permissions step
  useEffect(() => {
    if (step !== 1) return;
    refreshPermissions();
    const interval = setInterval(refreshPermissions, 2000);
    return () => clearInterval(interval);
  }, [step, refreshPermissions]);

  // Step 0: Language chooser
  if (step === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100vh", padding: "32px",
        textAlign: "center", background: "var(--bg-primary)", color: "var(--text-primary)",
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>

        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-display)" }}>
          Choose Your Language
        </h1>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", marginBottom: 4 }}>
          Select your preferred language
        </p>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", marginBottom: 32, fontFamily: "var(--font-hebrew)", direction: "rtl" }}>
          בחר את השפה המועדפת עליך
        </p>

        <div style={{ display: "flex", gap: 16 }}>
          {[
            { code: "en" as const, label: "English", font: "var(--font-sans)" },
            { code: "he" as const, label: "עברית", font: "var(--font-hebrew)" },
          ].map((lang) => (
            <button
              key={lang.code}
              className="btn"
              onClick={() => { setLocale(lang.code); setStep(1); }}
              style={{
                padding: "20px 40px", fontSize: 18, fontWeight: 600,
                border: "2px solid var(--border)", borderRadius: "var(--radius-lg)",
                minWidth: 160, fontFamily: lang.font,
              }}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isMacOS = currentPlatform === "macos";
  const isWindows = currentPlatform === "windows";

  // Step definitions — permissions step adapts to platform
  const permStepTitle = isMacOS ? t("onb.permissions") : isWindows ? t("onb.windowsTips") : t("onb.permissions");
  const permStepDesc = isMacOS ? t("onb.permissionsDesc") : isWindows ? t("onb.windowsTipsDesc") : t("onb.permissionsDesc");
  const permStepDetail = isMacOS ? t("onb.permissionsHint") : isWindows ? t("onb.windowsTipsHint") : t("onb.permissionsHint");

  const STEPS = [
    { id: "permissions", icon: "shield", title: permStepTitle, description: permStepDesc, detail: permStepDetail },
    { id: "layout", icon: "arrows", title: t("onb.layoutTitle"), description: t("onb.layoutDesc"), detail: t("onb.layoutDetail") },
    { id: "clipboard", icon: "clipboard", title: t("onb.clipTitle"), description: t("onb.clipDesc"), detail: t("onb.clipDetail") },
    { id: "snippets", icon: "code", title: t("onb.snippetTitle"), description: t("onb.snippetDesc"), detail: t("onb.snippetDetail") },
    { id: "ai", icon: "sparkle", title: t("onb.aiTitle"), description: t("onb.aiDesc"), detail: t("onb.aiDetail") },
    { id: "ready", icon: "check", title: t("onb.readyTitle"), description: t("onb.readyDesc"), detail: t("onb.readyDetail") },
  ];

  const stepIcons: Record<string, React.ReactNode> = {
    shield: <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke="var(--success)" strokeWidth="2"/></svg>,
    arrows: <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M2 7h20M22 7l-4-4M22 17H2M2 17l4 4"/></svg>,
    clipboard: <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3V1.5A.5.5 0 019.5 1h5a.5.5 0 01.5.5V3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>,
    code: <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M7 4l10 8-10 8"/><line x1="3" y1="22" x2="21" y2="22"/></svg>,
    sparkle: <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="4" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="20"/><line x1="4" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="20" y2="12"/></svg>,
    check: <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5" strokeWidth="2"/></svg>,
  };

  const currentIdx = step - 1;
  const current = STEPS[currentIdx];
  const isLast = currentIdx === STEPS.length - 1;
  const dir = isHebrew ? "rtl" : "ltr";

  // macOS: show accessibility permission with deeplink
  // Windows: show tips instead (no permissions needed)
  // Linux: show accessibility info
  const permissionItems = isMacOS ? [
    {
      key: "accessibility" as const,
      label: t("onb.perm.accessibility"),
      desc: t("onb.perm.accessibilityDesc"),
      url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="4" r="2"/><path d="M12 6v6m-4-2l4 2 4-2m-8 4l4 6 4-6"/></svg>,
    },
    {
      key: "screen_recording" as const,
      label: "Screen Recording",
      desc: "Required for fullscreen screenshot capture",
      url: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>,
    },
  ] : [];

  return (
    <div
      dir={dir}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100vh", padding: "32px",
        textAlign: "center", background: "var(--bg-primary)", color: "var(--text-primary)",
        fontFamily: isHebrew ? "var(--font-hebrew), var(--font-sans)" : "var(--font-sans)",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        {stepIcons[current.icon] || <div style={{ fontSize: 56 }}>{current.icon}</div>}
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, fontFamily: isHebrew ? "var(--font-hebrew)" : "var(--font-display)" }}>
        {current.title}
      </h1>

      <p style={{ fontSize: 16, color: "var(--text-secondary)", maxWidth: 500, lineHeight: 1.6, marginBottom: 8 }}>
        {current.description}
      </p>

      <p style={{ fontSize: 14, color: "var(--text-tertiary)", maxWidth: 450, marginBottom: 24 }}>
        {current.detail}
      </p>

      {/* Permission cards — only on permissions step */}
      {current.id === "permissions" && (
        <div style={{ width: "100%", maxWidth: 420, marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          {permissionItems.map((perm) => {
            const granted = permissions?.[perm.key] ?? false;
            return (
              <div
                key={perm.key}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 16px", background: "var(--bg-secondary)",
                  border: `1.5px solid ${granted ? "var(--success)" : "var(--accent)"}`,
                  borderRadius: "var(--radius-lg)", textAlign: isHebrew ? "right" : "left",
                }}
              >
                <div style={{ color: granted ? "var(--success)" : "var(--accent)", flexShrink: 0 }}>
                  {perm.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
                    {perm.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                    {perm.desc}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {granted ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: "var(--radius-full)",
                      background: "rgba(61, 153, 112, 0.1)", color: "var(--success)",
                      fontSize: 12, fontWeight: 600,
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
                      {t("onb.perm.granted")}
                    </span>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => openUrl(perm.url)}
                      style={{
                        background: "var(--accent)", color: "white",
                        border: "none", fontWeight: 600, fontSize: 12,
                        padding: "5px 12px", borderRadius: "var(--radius-md)",
                      }}
                    >
                      {t("onb.perm.grant")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Refresh button */}
          <button
            className="btn btn-sm"
            onClick={refreshPermissions}
            style={{ alignSelf: "center", marginTop: 4, color: "var(--text-tertiary)", fontSize: 12 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
              <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8"/>
              <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/>
            </svg>
            {t("onb.perm.refresh")}
          </button>
        </div>
      )}

      {/* Step indicators */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === currentIdx ? 24 : 8, height: 8,
              borderRadius: "var(--radius-full)",
              background: i === currentIdx ? "var(--accent)" : "var(--border)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 12 }}>
        <button className="btn" onClick={() => setStep(step - 1)}>
          {step === 1 ? t("set.language") : t("onb.back")}
        </button>
        {!isLast && (
          <button className="btn" onClick={onComplete} style={{ color: "var(--text-tertiary)" }}>
            {t("onb.skip")}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => isLast ? onComplete() : setStep(step + 1)}
        >
          {isLast ? t("onb.getStarted") : t("onb.next")}
        </button>
      </div>
    </div>
  );
}
