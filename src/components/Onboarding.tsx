import { useState, useEffect, useCallback, useRef } from "react";
import { useLocale, setLocale } from "../lib/i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkPermissions, getAppInfo, type PermissionStatus } from "../lib/tauri";
import logoMark from "../assets/brava-brand/logos/logo-mark.svg";

interface OnboardingProps {
  onComplete: () => void;
}

interface PermStepConfig {
  key: keyof PermissionStatus;
  titleKey: string;
  whyKey: string;
  featuresKey: string;
  url: string;
  icon: React.ReactNode;
  noteKey?: string;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [locale, t] = useLocale();
  const [step, setStep] = useState(0);
  const [permStatus, setPermStatus] = useState<PermissionStatus | null>(null);
  const [platform, setPlatform] = useState("macos");
  const [skippedPerms, setSkippedPerms] = useState<Set<string>>(new Set());
  const isHebrew = locale === "he";
  const dir = isHebrew ? "rtl" : "ltr";
  const prevGrantedRef = useRef<Record<string, boolean>>({});

  // Detect platform
  useEffect(() => {
    getAppInfo().then(info => setPlatform(info.platform)).catch(() => {});
  }, []);

  const isMacOS = platform === "macos";

  // macOS permission steps
  const permSteps: PermStepConfig[] = isMacOS ? [
    {
      key: "accessibility",
      titleKey: "onb.perm.accessibilityTitle",
      whyKey: "onb.perm.accessibilityWhy",
      featuresKey: "onb.perm.accessibilityFeatures",
      url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    },
    {
      key: "screen_recording",
      titleKey: "onb.perm.screenRecordingTitle",
      whyKey: "onb.perm.screenRecordingWhy",
      featuresKey: "onb.perm.screenRecordingFeatures",
      url: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
    },
    {
      key: "automation",
      titleKey: "onb.perm.automationTitle",
      whyKey: "onb.perm.automationWhy",
      featuresKey: "onb.perm.automationFeatures",
      url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
      icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>,
      noteKey: "onb.perm.automationNote",
    },
  ] : [];

  // Feature steps
  const featureSteps = [
    { titleKey: "onb.layoutTitle", descKey: "onb.layoutDesc", detailKey: "onb.layoutDetail",
      icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M2 7h20M22 7l-4-4M22 17H2M2 17l4 4"/></svg> },
    { titleKey: "onb.clipTitle", descKey: "onb.clipDesc", detailKey: "onb.clipDetail",
      icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3V1.5A.5.5 0 019.5 1h5a.5.5 0 01.5.5V3"/></svg> },
    { titleKey: "onb.aiTitle", descKey: "onb.aiDesc", detailKey: "onb.aiDetail",
      icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg> },
    { titleKey: "onb.screenshotTitle", descKey: "onb.screenshotDesc", detailKey: "onb.screenshotDetail",
      icon: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg> },
  ];

  // Total steps: 0 (lang) + 1 (welcome) + permSteps.length + featureSteps.length + 1 (allSet)
  const totalSteps = 2 + permSteps.length + featureSteps.length;
  const permStartStep = 2;
  const featureStartStep = 2 + permSteps.length;
  const allSetStep = totalSteps;

  // Poll permissions on permission steps
  const refreshPerms = useCallback(async () => {
    try {
      const status = await checkPermissions();
      setPermStatus(status);

      // Play sound when a permission gets newly granted
      for (const perm of permSteps) {
        const key = perm.key as string;
        const wasGranted = prevGrantedRef.current[key];
        const isNowGranted = status[perm.key as keyof PermissionStatus];
        if (!wasGranted && isNowGranted) {
          // Play success sound
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
            setTimeout(() => ctx.close(), 300);
          } catch {
            // ignore audio errors
          }
        }
        prevGrantedRef.current[key] = Boolean(isNowGranted);
      }
    } catch {
      setPermStatus({ accessibility: false, screen_recording: false, microphone: false, automation: false, platform: "macos", arch: "", os_version: "", app_version: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permSteps.length]);

  useEffect(() => {
    const isPermStep = step >= permStartStep && step < featureStartStep;
    if (!isPermStep && step !== allSetStep) return;
    refreshPerms();
    const interval = setInterval(refreshPerms, 1000);
    return () => clearInterval(interval);
  }, [step, refreshPerms, permStartStep, featureStartStep, allSetStep]);

  // Common wrapper styles
  const wrapperStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100vh", padding: 32,
    textAlign: "center", background: "var(--bg-primary)", color: "var(--text-primary)",
    fontFamily: isHebrew ? "var(--font-hebrew), var(--font-sans)" : "var(--font-sans)",
    direction: dir,
  };

  // Step 0: Language
  if (step === 0) {
    return (
      <div style={wrapperStyle}>
        <img src={logoMark} width={56} height={56} alt="" style={{ marginBottom: 20 }} />
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-display)" }}>
          {t("onb.chooseLang")}
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 4 }}>Select your preferred language</p>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, fontFamily: "var(--font-hebrew)", direction: "rtl" }}>בחר את השפה המועדפת עליך</p>
        <div style={{ display: "flex", gap: 16 }}>
          {[{ code: "en" as const, label: "English" }, { code: "he" as const, label: "עברית" }].map(lang => (
            <button key={lang.code} className="btn" onClick={() => { setLocale(lang.code); setStep(1); }}
              style={{ padding: "20px 40px", fontSize: 18, fontWeight: 600, borderRadius: 12, minWidth: 160,
                fontFamily: lang.code === "he" ? "var(--font-hebrew)" : "var(--font-sans)" }}>
              {lang.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 1: Welcome
  if (step === 1) {
    return (
      <div style={wrapperStyle}>
        <img src={logoMark} width={72} height={72} alt="" style={{ marginBottom: 20 }} />
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12, fontFamily: isHebrew ? "var(--font-hebrew)" : "var(--font-display)" }}>
          {t("onb.welcome")}
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", maxWidth: 480, lineHeight: 1.7, marginBottom: 32 }}>
          {t("onb.welcomeTagline")}
        </p>
        <button className="btn btn-primary" onClick={() => setStep(2)}
          style={{ padding: "12px 32px", fontSize: 16, fontWeight: 600, borderRadius: 10 }}>
          {isMacOS ? t("onb.letsSetup") : t("onb.next")}
        </button>
        <button className="btn" onClick={onComplete}
          style={{ marginTop: 12, color: "var(--text-tertiary)", border: "none", background: "none" }}>
          {t("onb.skip")}
        </button>
      </div>
    );
  }

  // Permission steps (macOS only)
  const permStepIndex = step - permStartStep;
  if (isMacOS && permStepIndex >= 0 && permStepIndex < permSteps.length) {
    const perm = permSteps[permStepIndex];
    const isGranted = permStatus ? Boolean(permStatus[perm.key as keyof PermissionStatus]) : false;
    const features = t(perm.featuresKey as Parameters<typeof t>[0]).split(", ");

    return (
      <div style={wrapperStyle}>
        <div style={{ marginBottom: 16, opacity: isGranted ? 0.5 : 1, transition: "opacity 0.3s" }}>
          {perm.icon}
        </div>

        {/* Status indicator */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 16px", borderRadius: 20, marginBottom: 16,
          background: isGranted ? "rgba(61,153,112,0.1)" : "rgba(191,70,70,0.08)",
          border: `1px solid ${isGranted ? "var(--success)" : "var(--accent)"}`,
          transition: "all 0.3s ease",
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isGranted ? "var(--success)" : "var(--accent)",
            animation: isGranted ? "none" : "pulse 2s infinite",
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: isGranted ? "var(--success)" : "var(--accent)" }}>
            {isGranted ? t("onb.perm.grantedLabel") : t("onb.perm.notGranted")}
          </span>
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 10 }}>{t(perm.titleKey as Parameters<typeof t>[0])}</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.6, marginBottom: 16 }}>
          {t(perm.whyKey as Parameters<typeof t>[0])}
        </p>

        {/* Feature list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20, textAlign: isHebrew ? "right" : "left" }}>
          {features.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--success)", fontWeight: 700 }}>&#10003;</span> {f}
            </div>
          ))}
        </div>

        {perm.noteKey && (
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 16, fontStyle: "italic" }}>
            {t(perm.noteKey as Parameters<typeof t>[0])}
          </p>
        )}

        {/* Grant button */}
        {!isGranted && (
          <button className="btn btn-primary" onClick={() => openUrl(perm.url)}
            style={{ padding: "10px 28px", fontSize: 15, fontWeight: 600, borderRadius: 10, marginBottom: 12 }}>
            {t("onb.perm.grantButton")}
          </button>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button className="btn" onClick={() => setStep(step - 1)}>{t("onb.back")}</button>
          {!isGranted && (
            <button className="btn" onClick={() => { setSkippedPerms(s => new Set(s).add(perm.key)); setStep(step + 1); }}
              style={{ color: "var(--text-tertiary)" }}>
              {t("onb.perm.skipButton")}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}
            disabled={!isGranted && !skippedPerms.has(perm.key)}
            style={{ opacity: isGranted ? 1 : 0.5 }}>
            {t("onb.perm.continueButton")}
          </button>
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 4, marginTop: 20 }}>
          {Array.from({ length: totalSteps + 1 }).map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 6, height: 6, borderRadius: 3,
              background: i === step ? "var(--accent)" : i < step ? "var(--success)" : "var(--border)",
              transition: "all 0.3s",
            }} />
          ))}
        </div>
      </div>
    );
  }

  // Feature steps
  const featureIndex = step - featureStartStep;
  if (featureIndex >= 0 && featureIndex < featureSteps.length) {
    const feat = featureSteps[featureIndex];
    return (
      <div style={wrapperStyle}>
        <div style={{ marginBottom: 16 }}>{feat.icon}</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 10, fontFamily: isHebrew ? "var(--font-hebrew)" : "var(--font-display)" }}>
          {t(feat.titleKey as Parameters<typeof t>[0])}
        </h2>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", maxWidth: 480, lineHeight: 1.6, marginBottom: 8 }}>
          {t(feat.descKey as Parameters<typeof t>[0])}
        </p>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 32 }}>
          {t(feat.detailKey as Parameters<typeof t>[0])}
        </p>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn" onClick={() => setStep(step - 1)}>{t("onb.back")}</button>
          <button className="btn" onClick={onComplete} style={{ color: "var(--text-tertiary)" }}>{t("onb.skip")}</button>
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>{t("onb.next")}</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 20 }}>
          {Array.from({ length: totalSteps + 1 }).map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 6, height: 6, borderRadius: 3,
              background: i === step ? "var(--accent)" : i < step ? "var(--success)" : "var(--border)",
              transition: "all 0.3s",
            }} />
          ))}
        </div>
      </div>
    );
  }

  // All Set step (last)
  const permChecklist = isMacOS ? permSteps.map(p => ({
    label: t(p.titleKey as Parameters<typeof t>[0]),
    granted: permStatus ? Boolean(permStatus[p.key as keyof PermissionStatus]) : false,
    skipped: skippedPerms.has(p.key),
  })) : [];

  return (
    <div style={wrapperStyle}>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5" style={{ marginBottom: 16 }}>
        <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5" strokeWidth="2"/>
      </svg>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, fontFamily: isHebrew ? "var(--font-hebrew)" : "var(--font-display)" }}>
        {t("onb.readyTitle")}
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
        {t("onb.allSet.subtitle")}
      </p>

      {/* Permission checklist */}
      {permChecklist.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, width: "100%", maxWidth: 360 }}>
          {permChecklist.map((p, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
              background: "var(--bg-secondary)", borderRadius: 8,
              border: `1px solid ${p.granted ? "var(--success)" : "var(--warning, #D4940A)"}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: p.granted ? "var(--success)" : "#D4940A",
              }} />
              <span style={{ flex: 1, fontSize: 13, textAlign: isHebrew ? "right" : "left" }}>{p.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: p.granted ? "var(--success)" : "#D4940A" }}>
                {p.granted ? t("onb.allSet.granted") : t("onb.allSet.skipped")}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary" onClick={onComplete}
          style={{ padding: "12px 32px", fontSize: 16, fontWeight: 600, borderRadius: 10 }}>
          {t("onb.getStarted")}
        </button>
      </div>
    </div>
  );
}
