import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { convertClipboardText, captureFullScreen, openScreenshotEditor, getSettings, aiFixGrammar, writeSystemClipboard, checkPermissions, type AppSettings } from "./lib/tauri";
import { showToast } from "./components/Toast";
import type { TranscriptionJobEvent } from "./lib/tauri";
import { ClipboardHistory } from "./components/ClipboardHistory";
import { QuickPaste } from "./components/QuickPaste";
import { UniversalSearch } from "./components/UniversalSearch";
import { SnippetManager } from "./components/SnippetManager";
import { AITools } from "./components/AITools";
import { LayoutConverter } from "./components/LayoutConverter";
import { Settings } from "./components/Settings";
import { Onboarding } from "./components/Onboarding";
import { ToastContainer } from "./components/Toast";
import { WhatsNew } from "./components/WhatsNew";
import { KeyboardLock } from "./components/KeyboardLock";
import { Transcription } from "./components/Transcription";
import { useLocale, setLocale, initLocale } from "./lib/i18n";
import { playConvertSound, playShutterSound } from "./lib/sounds";
import logoMark from "./assets/brava-brand/logos/logo-mark.svg";

type Tab = "clipboard" | "search" | "converter" | "snippets" | "ai" | "transcription" | "settings";

function App() {
  const [locale, t] = useLocale();
  const [activeTab, setActiveTab] = useState<Tab>("clipboard");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [transcriptionBadgeCount, setTranscriptionBadgeCount] = useState(0);
  const [clipboardBadgeCount, setClipboardBadgeCount] = useState(0);
  const [quickPasteOpen, setQuickPasteOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const activeTabRef = useRef(activeTab);
  const appSettingsRef = useRef(appSettings);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { appSettingsRef.current = appSettings; }, [appSettings]);
  useEffect(() => {
    initLocale();
    const hasOnboarded = localStorage.getItem("brava_onboarded");
    if (!hasOnboarded) {
      setShowOnboarding(true);
    }
    void getSettings().then((s) => {
      setAppSettings(s);
      document.documentElement.style.fontSize = `${Math.round(16 * (s.ui_scale || 1))}px`;
    }).catch(() => {});
  }, []);

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "clipboard", label: t("app.clipboard"), icon: "" },
    { id: "search", label: t("app.search"), icon: "" },
    { id: "converter", label: t("app.converter"), icon: "" },
    { id: "snippets", label: t("app.snippets"), icon: "" },
    { id: "ai", label: t("app.ai"), icon: "" },
    { id: "transcription", label: t("app.transcription"), icon: "" },
    { id: "settings", label: t("app.settings"), icon: "" },
  ];

  const navigate = useCallback((tab: string) => {
    if (["clipboard", "search", "converter", "snippets", "ai", "transcription", "settings"].includes(tab)) {
      setActiveTab(tab as Tab);
    }
  }, []);

  useEffect(() => {
    const unsubs: Promise<() => void>[] = [];

    unsubs.push(listen("navigate-tab", (event) => {
      navigate(event.payload as string);
    }));

    // Global hotkey handlers
    unsubs.push(listen("hotkey-convert", async () => {
      try {
        const result = await convertClipboardText();
        playConvertSound();
        showToast(`${t("conv.convertedPrefix")}: ${result.slice(0, 50)}...`, "success");

        // Auto grammar correction if enabled
        const settings = await getSettings();
        if (settings.grammar_enabled) {
          try {
            const fixed = await aiFixGrammar(result);
            if (fixed.content !== result) {
              await writeSystemClipboard(fixed.content);
              showToast(t("ai.grammarCorrected"), "success");
            }
          } catch (err) {
            if (String(err).includes("API key") || String(err).includes("NoApiKey")) {
              showToast(t("ai.keyError"), "warning");
            }
          }
        }
      } catch (err) {
        showToast(`${t("conv.failed")}: ${String(err)}`, "error");
      }
    }));

    unsubs.push(listen("hotkey-clipboard", () => {
      setQuickPasteOpen(true);
    }));

    unsubs.push(listen("hotkey-quick-paste", () => {
      setQuickPasteOpen(true);
    }));

    unsubs.push(listen("hotkey-enhance", () => {
      navigate("ai");
    }));

    unsubs.push(listen("hotkey-translate", () => {
      navigate("ai");
    }));
    unsubs.push(listen("hotkey-voice", () => {
      navigate("transcription");
      showToast(t("trans.quickRecordHint"), "info");
    }));

    unsubs.push(listen("hotkey-screenshot", async () => {
      try {
        // Check screen recording permission first (macOS)
        const perms = await checkPermissions();
        if (!perms.screen_recording) {
          showToast(t("shot.needsPermission"), "warning");
          return;
        }
        const imagePath = await captureFullScreen();
        playShutterSound();
        await openScreenshotEditor(imagePath);
      } catch (err) {
        if (!String(err).includes("cancelled")) {
          showToast(`${t("shot.failed")}: ${String(err)}`, "error");
        }
      }
    }));

    unsubs.push(listen<TranscriptionJobEvent>("transcription-completed", (event) => {
      const payload = event.payload;
      if (activeTabRef.current !== "transcription") {
        setTranscriptionBadgeCount((prev) => prev + 1);
      }
      if (appSettingsRef.current?.notification_transcription_complete ?? true) {
        showToast(`${t("trans.readyPrefix")}: ${payload.file_name}`, "success");
      }
    }));

    unsubs.push(listen("clipboard-changed", () => {
      if (activeTabRef.current !== "clipboard") {
        setClipboardBadgeCount(prev => prev + 1);
      }
    }));

    return () => { unsubs.forEach((u) => u.then((fn) => fn())); };
  }, [navigate, t]);

  useEffect(() => {
    if (activeTab === "transcription") {
      setTranscriptionBadgeCount(0);
    }
    if (activeTab === "clipboard") {
      setClipboardBadgeCount(0);
    }
  }, [activeTab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setQuickPasteOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem("brava_onboarded", "true");
    setShowOnboarding(false);
  };

  if (showOnboarding) {
    return (
      <>
        <Onboarding onComplete={completeOnboarding} />
        <ToastContainer />
      </>
    );
  }

  // Custom SVG icons for each tab (unique, no emoji)
  const tabIcons: Record<Tab, React.ReactNode> = {
    clipboard: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="8" height="12" rx="1.5"/>
        <path d="M6 2V1.5A.5.5 0 016.5 1h3a.5.5 0 01.5.5V2"/>
        <line x1="6.5" y1="6" x2="9.5" y2="6"/><line x1="6.5" y1="8.5" x2="9.5" y2="8.5"/><line x1="6.5" y1="11" x2="8" y2="11"/>
      </svg>
    ),
    converter: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 5h12M14 5l-3-3M14 11H2M2 11l3 3"/>
      </svg>
    ),
    search: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="4.5"/>
        <line x1="10.5" y1="10.5" x2="14" y2="14"/>
      </svg>
    ),
    snippets: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3l6 5-6 5"/>
        <line x1="2" y1="14" x2="14" y2="14"/>
      </svg>
    ),
    ai: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6"/>
        <circle cx="8" cy="8" r="2"/>
        <line x1="8" y1="2" x2="8" y2="4"/><line x1="8" y1="12" x2="8" y2="14"/>
        <line x1="2" y1="8" x2="4" y2="8"/><line x1="12" y1="8" x2="14" y2="8"/>
      </svg>
    ),
    transcription: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="1" width="6" height="9" rx="3"/>
        <path d="M3 7a5 5 0 0010 0"/>
        <line x1="8" y1="12" x2="8" y2="15"/>
        <line x1="5" y1="15" x2="11" y2="15"/>
      </svg>
    ),
    settings: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="2.5"/>
        <path d="M13.5 8a5.5 5.5 0 00-.4-1.3l1.2-1.2-1.4-1.4-1.2 1.2A5.5 5.5 0 008 4.5V3H6.5v1.5a5.5 5.5 0 00-1.8.7L3.5 4.1 2.1 5.5l1.1 1.2A5.5 5.5 0 002.5 8H1v1.5h1.5c.1.5.3 1 .7 1.3L2.1 12l1.4 1.4 1.2-1.1c.4.3.8.5 1.3.6V14.5H7.5V13c.5-.1 1-.3 1.3-.7l1.2 1.2 1.4-1.4-1.1-1.2c.3-.4.6-.8.7-1.3H12.5V8z"/>
      </svg>
    ),
  };

  return (
    <div className="app">
      <nav className="nav-tabs">
        <div className="nav-logo">
          <img src={logoMark} alt="Brava" width="22" height="22" />
        </div>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-tab-icon">{tabIcons[tab.id]}</span>
            {tab.label}
            {tab.id === "clipboard" && clipboardBadgeCount > 0 && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--accent)", display: "inline-block",
                marginLeft: 2, verticalAlign: "top",
              }} />
            )}
            {tab.id === "transcription" && transcriptionBadgeCount > 0 && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--accent)", display: "inline-block",
                marginLeft: 2, verticalAlign: "top",
              }} />
            )}
          </button>
        ))}
        <div className="lang-toggle">
          <button className={`lang-btn ${locale === "en" ? "active" : ""}`} onClick={() => setLocale("en")}>EN</button>
          <button className={`lang-btn ${locale === "he" ? "active" : ""}`} onClick={() => setLocale("he")}>עב</button>
        </div>
      </nav>

      <main className="content">
        {activeTab === "clipboard" && <ClipboardHistory />}
        {activeTab === "search" && <UniversalSearch />}
        {activeTab === "converter" && <LayoutConverter />}
        {activeTab === "snippets" && <SnippetManager />}
        {activeTab === "ai" && <AITools />}
        {activeTab === "transcription" && <Transcription />}
        {activeTab === "settings" && <Settings />}
      </main>

      <ToastContainer />
      <WhatsNew />
      <KeyboardLock />
      <QuickPaste open={quickPasteOpen} onClose={() => setQuickPasteOpen(false)} />
    </div>
  );
}

export default App;
