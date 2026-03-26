import { useState } from "react";
import { useLocale, setLocale } from "../lib/i18n";
import { openUrl } from "@tauri-apps/plugin-opener";

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [locale, t] = useLocale();
  const [step, setStep] = useState(0);
  const isHebrew = locale === "he";

  // Step 0: Language chooser — no translation needed, shown in both languages
  if (step === 0) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        padding: "32px",
        textAlign: "center",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>

        <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>
          Choose Your Language
        </h1>
        <p style={{ fontSize: "16px", color: "var(--text-secondary)", marginBottom: "4px" }}>
          Select your preferred language
        </p>
        <p style={{
          fontSize: "16px",
          color: "var(--text-secondary)",
          marginBottom: "32px",
          fontFamily: "var(--font-hebrew), var(--font-sans)",
          direction: "rtl",
        }}>
          בחר את השפה המועדפת עליך
        </p>

        <div style={{ display: "flex", gap: "16px" }}>
          <button
            className="btn"
            onClick={() => { setLocale("en"); setStep(1); }}
            style={{
              padding: "20px 40px",
              fontSize: "18px",
              fontWeight: 600,
              border: "2px solid var(--border)",
              borderRadius: "var(--radius-lg, 12px)",
              cursor: "pointer",
              minWidth: "160px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.background = "var(--accent-light)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.background = "";
            }}
          >
            English
          </button>
          <button
            className="btn"
            onClick={() => { setLocale("he"); setStep(1); }}
            style={{
              padding: "20px 40px",
              fontSize: "18px",
              fontWeight: 600,
              border: "2px solid var(--border)",
              borderRadius: "var(--radius-lg, 12px)",
              cursor: "pointer",
              minWidth: "160px",
              fontFamily: "var(--font-hebrew), var(--font-sans)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.background = "var(--accent-light)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.background = "";
            }}
          >
            עברית
          </button>
        </div>
      </div>
    );
  }

  // Steps 1-6 (after language selection)
  const STEPS = [
    {
      icon: "\uD83D\uDD12",
      title: t("onb.permissions"),
      description: t("onb.permissionsDesc"),
      detail: t("onb.permissionsHint"),
      action: "permissions",
    },
    {
      icon: "\u2328\uFE0F",
      title: t("onb.layoutTitle"),
      description: t("onb.layoutDesc"),
      detail: t("onb.layoutDetail"),
    },
    {
      icon: "\uD83D\uDCCB",
      title: t("onb.clipTitle"),
      description: t("onb.clipDesc"),
      detail: t("onb.clipDetail"),
    },
    {
      icon: "\u26A1",
      title: t("onb.snippetTitle"),
      description: t("onb.snippetDesc"),
      detail: t("onb.snippetDetail"),
    },
    {
      icon: "\uD83E\uDD16",
      title: t("onb.aiTitle"),
      description: t("onb.aiDesc"),
      detail: t("onb.aiDetail"),
    },
    {
      icon: "\uD83C\uDF89",
      title: t("onb.readyTitle"),
      description: t("onb.readyDesc"),
      detail: t("onb.readyDetail"),
    },
  ];

  const currentIdx = step - 1; // offset since step 0 is language chooser
  const current = STEPS[currentIdx];
  const isLast = currentIdx === STEPS.length - 1;
  const dir = isHebrew ? "rtl" : "ltr";

  const handleOpenPermissions = () => {
    openUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  };

  return (
    <div
      dir={dir}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        padding: "32px",
        textAlign: "center",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: isHebrew ? "var(--font-hebrew), var(--font-sans)" : "var(--font-sans)",
      }}
    >
      <div style={{ fontSize: "64px", marginBottom: "16px" }}>{current.icon}</div>

      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "12px" }}>
        {current.title}
      </h1>

      <p style={{
        fontSize: "16px",
        color: "var(--text-secondary)",
        maxWidth: "500px",
        lineHeight: "1.6",
        marginBottom: "8px",
      }}>
        {current.description}
      </p>

      <p style={{
        fontSize: "14px",
        color: "var(--text-tertiary)",
        maxWidth: "450px",
        marginBottom: current.action === "permissions" ? "16px" : "32px",
      }}>
        {current.detail}
      </p>

      {/* Permissions action button */}
      {current.action === "permissions" && (
        <button
          className="btn"
          onClick={handleOpenPermissions}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 24px",
            fontSize: "15px",
            fontWeight: 600,
            border: "2px solid var(--accent)",
            color: "var(--accent)",
            borderRadius: "var(--radius-lg, 12px)",
            cursor: "pointer",
            marginBottom: "32px",
            transition: "all 0.2s ease",
            fontFamily: isHebrew ? "var(--font-hebrew), var(--font-sans)" : "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--accent)";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "";
            e.currentTarget.style.color = "var(--accent)";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          {t("onb.openPermissions")}
        </button>
      )}

      {/* Step indicators */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === currentIdx ? "24px" : "8px",
              height: "8px",
              borderRadius: "var(--radius-full, 9999px)",
              background: i === currentIdx ? "var(--accent)" : "var(--border)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: "12px" }}>
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
