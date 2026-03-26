import { useState, useEffect } from "react";
import {
  getSettings,
  updateSettings,
  setApiKey,
  setAiProvider,
  getAiProviders,
  getAppInfo,
  type AppSettings,
  type AIProviderInfo,
  type AppInfo,
} from "../lib/tauri";

type SettingsTab = "general" | "ai" | "layouts" | "about";

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [saved, setSaved] = useState(false);

  // API key inputs (not stored in settings, sent directly to backend)
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
    getAiProviders().then(setProviders).catch(console.error);
    getAppInfo().then(setAppInfo).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await updateSettings(settings);

      // Save API keys
      if (geminiKey) await setApiKey("gemini", geminiKey);
      if (openaiKey) await setApiKey("openai", openaiKey);
      if (claudeKey) await setApiKey("claude", claudeKey);
      if (openrouterKey) await setApiKey("openrouter", openrouterKey);

      // Set active provider
      await setAiProvider(settings.ai_provider);

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  if (!settings) return <div className="empty-state"><div className="spinner" /></div>;

  const TABS: { id: SettingsTab; label: string; icon: string }[] = [
    { id: "general", label: "General", icon: "\u{2699}\u{FE0F}" },
    { id: "ai", label: "AI Providers", icon: "\u{1F916}" },
    { id: "layouts", label: "Layouts", icon: "\u{2328}\u{FE0F}" },
    { id: "about", label: "About", icon: "\u{2139}\u{FE0F}" },
  ];

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Settings</h2>
        {saved && <span style={{ color: "var(--success)", fontSize: "13px" }}>Saved!</span>}
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

      {/* General Settings */}
      {activeTab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Appearance</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>Theme</label>
              <select className="select" value={settings.theme} onChange={(e) => updateField("theme", e.target.value)}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>Launch at login</label>
              <button
                className={`toggle ${settings.launch_at_login ? "active" : ""}`}
                onClick={() => updateField("launch_at_login", !settings.launch_at_login)}
              />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Clipboard</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>Enable clipboard monitoring</label>
              <button
                className={`toggle ${settings.clipboard_enabled ? "active" : ""}`}
                onClick={() => updateField("clipboard_enabled", !settings.clipboard_enabled)}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>Max history items</label>
              <input
                className="input"
                type="number"
                value={settings.max_clipboard_items}
                onChange={(e) => updateField("max_clipboard_items", parseInt(e.target.value) || 100)}
                style={{ width: "80px" }}
                min={10}
                max={1000}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>Auto-categorize items</label>
              <button
                className={`toggle ${settings.auto_categorize ? "active" : ""}`}
                onClick={() => updateField("auto_categorize", !settings.auto_categorize)}
              />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Snippets</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>Enable snippet expansion</label>
              <button
                className={`toggle ${settings.snippets_enabled ? "active" : ""}`}
                onClick={() => updateField("snippets_enabled", !settings.snippets_enabled)}
              />
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
        </div>
      )}

      {/* AI Provider Settings */}
      {activeTab === "ai" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Active Provider</h3>
            <select
              className="select"
              style={{ width: "100%" }}
              value={settings.ai_provider}
              onChange={(e) => updateField("ai_provider", e.target.value)}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.has_free_tier ? "(Free tier available)" : ""}
                </option>
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
              <input
                className="input"
                type="password"
                placeholder="API Key"
                value={provider.key}
                onChange={(e) => provider.setKey(e.target.value)}
              />
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                {provider.hint}
              </p>
            </div>
          ))}

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Ollama (Local)</h3>
            <input
              className="input"
              placeholder="http://localhost:11434"
              value={settings.ollama_endpoint}
              onChange={(e) => updateField("ollama_endpoint", e.target.value)}
            />
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
              Free, private, runs on your machine. Install from ollama.com
            </p>
          </div>

          <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
        </div>
      )}

      {/* Layout Settings */}
      {activeTab === "layouts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Layout Conversion</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>Auto-detect source layout</label>
              <button
                className={`toggle ${settings.auto_detect_layout ? "active" : ""}`}
                onClick={() => updateField("auto_detect_layout", !settings.auto_detect_layout)}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>Real-time wrong-layout detection</label>
              <button
                className={`toggle ${settings.realtime_detection ? "active" : ""}`}
                onClick={() => updateField("realtime_detection", !settings.realtime_detection)}
              />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Supported Layouts</h3>
            <div className="grid" style={{ gap: "4px" }}>
              {["English (QWERTY)", "Hebrew (Standard)", "Arabic (Standard)", "Russian (JCUKEN)"].map((l) => (
                <div key={l} style={{ padding: "8px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}>
                  {l}
                </div>
              ))}
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>
              More layouts can be added via JSON definition files
            </p>
          </div>

          <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
        </div>
      )}

      {/* About */}
      {activeTab === "about" && appInfo && (
        <div className="card" style={{ textAlign: "center", padding: "32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "8px" }}>{"\u{1F4A1}"}</div>
          <h2 style={{ fontSize: "24px", fontWeight: 700 }}>{appInfo.name}</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>
            Version {appInfo.version}
          </p>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", maxWidth: "400px", margin: "0 auto 16px" }}>
            {appInfo.description}
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
            <span>Platform: {appInfo.platform}</span>
            <span>Architecture: {appInfo.arch}</span>
          </div>
        </div>
      )}
    </div>
  );
}
