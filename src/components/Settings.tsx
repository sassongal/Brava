import { useState, useEffect } from "react";
import {
  getSettings,
  updateSettings,
  setApiKey,
  setAiProvider,
  getAiProviders,
  getAppInfo,
  saveSettingsToDb,
  exportSettings,
  importSettings,
  toggleCaffeine,
  getCaffeineStatus,
  toggleKeyboardLock,
  type AppSettings,
  type AIProviderInfo,
  type AppInfo,
} from "../lib/tauri";
import { showToast } from "./Toast";
import { useLocale, setLocale } from "../lib/i18n";

type SettingsTab = "general" | "ai" | "layouts" | "about";

export function Settings() {
  const [locale, t] = useLocale();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [caffeineOn, setCaffeineOn] = useState(false);

  // API key inputs
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
    getAiProviders().then(setProviders).catch(console.error);
    getAppInfo().then(setAppInfo).catch(console.error);
    getCaffeineStatus().then(setCaffeineOn).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await updateSettings(settings);
      await saveSettingsToDb();

      if (geminiKey) await setApiKey("gemini", geminiKey);
      if (openaiKey) await setApiKey("openai", openaiKey);
      if (claudeKey) await setApiKey("claude", claudeKey);
      if (openrouterKey) await setApiKey("openrouter", openrouterKey);

      await setAiProvider(settings.ai_provider);
      showToast("Settings saved", "success");
    } catch (err) {
      showToast("Failed to save settings: " + String(err), "error");
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportSettings();
      await navigator.clipboard.writeText(json);
      showToast("Settings copied to clipboard", "success");
    } catch (err) {
      showToast("Export failed: " + String(err), "error");
    }
  };

  const handleImport = async () => {
    try {
      const json = await navigator.clipboard.readText();
      await importSettings(json);
      const updated = await getSettings();
      setSettings(updated);
      showToast("Settings imported", "success");
    } catch (err) {
      showToast("Import failed: " + String(err), "error");
    }
  };

  const handleCaffeine = async () => {
    try {
      const newState = await toggleCaffeine();
      setCaffeineOn(newState);
      showToast(newState ? "Caffeine mode ON - preventing sleep" : "Caffeine mode OFF", "info");
    } catch (err) {
      showToast("Caffeine toggle failed: " + String(err), "error");
    }
  };

  const handleKeyboardLock = async () => {
    try {
      await toggleKeyboardLock();
      showToast("Keyboard locked", "info");
    } catch (err) {
      showToast("Keyboard lock failed: " + String(err), "error");
    }
  };

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  if (!settings) return <div className="empty-state"><div className="spinner" /></div>;

  const TABS: { id: SettingsTab; label: string; icon: string }[] = [
    { id: "general", label: t("set.general"), icon: "\u{2699}\u{FE0F}" },
    { id: "ai", label: t("set.aiProviders"), icon: "\u{1F916}" },
    { id: "layouts", label: t("set.layouts"), icon: "\u{2328}\u{FE0F}" },
    { id: "about", label: t("set.about"), icon: "\u{2139}\u{FE0F}" },
  ];

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">{t("set.title")}</h2>
      </div>

      <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.appearance")}</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>{t("set.theme")}</label>
              <select className="select" value={settings.theme} onChange={(e) => updateField("theme", e.target.value)}>
                <option value="system">{t("set.system")}</option>
                <option value="light">{t("set.light")}</option>
                <option value="dark">{t("set.dark")}</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>{t("set.language")}</label>
              <select className="select" value={locale} onChange={(e) => setLocale(e.target.value as "en" | "he")}>
                <option value="en">English</option>
                <option value="he">עברית</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>{t("set.launchAtLogin")}</label>
              <button className={`toggle ${settings.launch_at_login ? "active" : ""}`} onClick={() => updateField("launch_at_login", !settings.launch_at_login)} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.clipboard")}</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>{t("set.enableClipboard")}</label>
              <button className={`toggle ${settings.clipboard_enabled ? "active" : ""}`} onClick={() => updateField("clipboard_enabled", !settings.clipboard_enabled)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>{t("set.maxItems")}</label>
              <input className="input" type="number" value={settings.max_clipboard_items} onChange={(e) => updateField("max_clipboard_items", parseInt(e.target.value) || 100)} style={{ width: "80px" }} min={10} max={1000} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>{t("set.autoCategorize")}</label>
              <button className={`toggle ${settings.auto_categorize ? "active" : ""}`} onClick={() => updateField("auto_categorize", !settings.auto_categorize)} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.snippets")}</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>{t("set.enableSnippets")}</label>
              <button className={`toggle ${settings.snippets_enabled ? "active" : ""}`} onClick={() => updateField("snippets_enabled", !settings.snippets_enabled)} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.utilities")}</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div>
                <label>{t("set.caffeine")}</label>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{t("set.caffeineDesc")}</p>
              </div>
              <button className={`toggle ${caffeineOn ? "active" : ""}`} onClick={handleCaffeine} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <label>{t("set.keyboardLock")}</label>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{t("set.keyboardLockDesc")}</p>
              </div>
              <button className="btn btn-sm" onClick={handleKeyboardLock}>{"\uD83D\uDD12"} {t("set.lock")}</button>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSave}>{t("set.save")}</button>
        </div>
      )}

      {activeTab === "ai" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.activeProvider")}</h3>
            <select className="select" style={{ width: "100%" }} value={settings.ai_provider} onChange={(e) => updateField("ai_provider", e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name} {p.has_free_tier ? `(${t("set.freeTier")})` : ""}</option>
              ))}
            </select>
          </div>

          {[
            { id: "gemini", name: "Google Gemini", key: geminiKey, setKey: setGeminiKey, hint: "Get a free key at aistudio.google.com" },
            { id: "openai", name: "OpenAI", key: openaiKey, setKey: setOpenaiKey, hint: "Get key at platform.openai.com" },
            { id: "claude", name: "Anthropic Claude", key: claudeKey, setKey: setClaudeKey, hint: "Get key at console.anthropic.com" },
            { id: "openrouter", name: "OpenRouter", key: openrouterKey, setKey: setOpenrouterKey, hint: "Free models available at openrouter.ai" },
          ].map((provider) => (
            <div key={provider.id} className="card">
              <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>{provider.name}</h3>
              <input className="input" type="password" placeholder="API Key (saved in OS keychain)" value={provider.key} onChange={(e) => provider.setKey(e.target.value)} />
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>{provider.hint}</p>
            </div>
          ))}

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Ollama (Local)</h3>
            <input className="input" placeholder="http://localhost:11434" value={settings.ollama_endpoint} onChange={(e) => updateField("ollama_endpoint", e.target.value)} />
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>Free, private, runs on your machine. Install from ollama.com</p>
          </div>

          <button className="btn btn-primary" onClick={handleSave}>{t("set.save")}</button>
        </div>
      )}

      {activeTab === "layouts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.layoutConversion")}</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>{t("set.autoDetect")}</label>
              <button className={`toggle ${settings.auto_detect_layout ? "active" : ""}`} onClick={() => updateField("auto_detect_layout", !settings.auto_detect_layout)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>{t("set.realtimeDetection")}</label>
              <button className={`toggle ${settings.realtime_detection ? "active" : ""}`} onClick={() => updateField("realtime_detection", !settings.realtime_detection)} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>{t("set.supportedLayouts")}</h3>
            <div className="grid" style={{ gap: "4px" }}>
              {["English (QWERTY)", "Hebrew (Standard)", "Arabic (Standard)", "Russian (JCUKEN)"].map((l) => (
                <div key={l} style={{ padding: "8px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}>{l}</div>
              ))}
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>{t("set.moreLayouts")}</p>
          </div>

          <button className="btn btn-primary" onClick={handleSave}>{t("set.save")}</button>
        </div>
      )}

      {activeTab === "about" && appInfo && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card" style={{ textAlign: "center", padding: "32px" }}>
            <div style={{ fontSize: "48px", marginBottom: "8px" }}>{"\u{1F4A1}"}</div>
            <h2 style={{ fontSize: "24px", fontWeight: 700 }}>{appInfo.name}</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>Version {appInfo.version}</p>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", maxWidth: "400px", margin: "0 auto 16px" }}>{appInfo.description}</p>
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
              <span>Platform: {appInfo.platform}</span>
              <span>Architecture: {appInfo.arch}</span>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.dataManagement")}</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn" onClick={handleExport}>{"\u{1F4E4}"} {t("set.export")}</button>
              <button className="btn" onClick={handleImport}>{"\u{1F4E5}"} {t("set.import")}</button>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>{t("set.exportHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
