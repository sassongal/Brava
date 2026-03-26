import { useState } from "react";

interface OnboardingProps {
  onComplete: () => void;
}

const STEPS = [
  {
    title: "Welcome to Brava",
    icon: "\u{1F4A1}",
    description: "Your cross-platform productivity toolkit. Smart keyboard layout conversion, clipboard management, and AI-powered text tools.",
    detail: "Works on macOS, Windows, and Linux.",
  },
  {
    title: "Smart Layout Conversion",
    icon: "\u{2328}\u{FE0F}",
    description: "Typed in the wrong language? Brava instantly detects and converts your text between Hebrew, English, Arabic, and Russian.",
    detail: "Use Ctrl+Shift+T (or Cmd+Shift+T on Mac) to convert selected text.",
  },
  {
    title: "Clipboard History",
    icon: "\u{1F4CB}",
    description: "Never lose copied text again. Brava saves your clipboard history with smart categorization - URLs, emails, code, and more.",
    detail: "Use Ctrl+Shift+V (or Cmd+Shift+V on Mac) to open clipboard history.",
  },
  {
    title: "Smart Snippets",
    icon: "\u{26A1}",
    description: "Create text shortcuts that expand as you type. Use dynamic variables like {date}, {time}, and {clipboard} for smart expansion.",
    detail: "Example: Type '/sig' to expand into your full email signature.",
  },
  {
    title: "AI-Powered Tools",
    icon: "\u{1F916}",
    description: "Enhance prompts, translate text, and get AI assistance. Choose from Gemini, OpenAI, Claude, OpenRouter, or run locally with Ollama.",
    detail: "Free tiers available - no credit card required to start.",
  },
  {
    title: "You're All Set!",
    icon: "\u{1F389}",
    description: "Brava lives in your system tray. Click the icon to access all features, or use keyboard shortcuts for quick actions.",
    detail: "Head to Settings to configure your AI provider and customize shortcuts.",
  },
];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      padding: "32px",
      textAlign: "center",
    }}>
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
        marginBottom: "32px",
      }}>
        {current.detail}
      </p>

      {/* Step indicators */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? "24px" : "8px",
              height: "8px",
              borderRadius: "var(--radius-full)",
              background: i === step ? "var(--accent)" : "var(--border)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: "12px" }}>
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {!isLast && (
          <button className="btn" onClick={onComplete} style={{ color: "var(--text-tertiary)" }}>
            Skip
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => isLast ? onComplete() : setStep(step + 1)}
        >
          {isLast ? "Get Started" : "Next"}
        </button>
      </div>
    </div>
  );
}
