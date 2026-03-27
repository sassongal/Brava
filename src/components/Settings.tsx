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
  createFullBackup,
  restoreFullBackup,
  toggleCaffeine,
  getCaffeineStatus,
  toggleKeyboardLock,
  getHotkeyBindings,
  updateHotkey,
  resetHotkeyDefaults,
  checkApiKeyHealth,
  checkPermissions,
  type AppSettings,
  type AIProviderInfo,
  type AppInfo,
  type HotkeyBinding,
  type ApiKeyHealth,
  type PermissionStatus,
} from "../lib/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";
import { showToast } from "./Toast";
import { useLocale, setLocale } from "../lib/i18n";
import { getSoundsEnabled, setSoundsEnabled } from "../lib/sounds";

type SettingsTab = "general" | "ai" | "layouts" | "shortcuts" | "permissions" | "about";

export function Settings() {
  const [locale, t] = useLocale();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [caffeineOn, setCaffeineOn] = useState(false);
  const [hotkeyBindings, setHotkeyBindings] = useState<HotkeyBinding[]>([]);
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [soundsOn, setSoundsOn] = useState(getSoundsEnabled());
  const [permStatus, setPermStatus] = useState<PermissionStatus | null>(null);

  // API key inputs
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [keyHealth, setKeyHealth] = useState<Record<string, ApiKeyHealth>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
    getAiProviders().then(setProviders).catch(console.error);
    getAppInfo().then(setAppInfo).catch(console.error);
    getCaffeineStatus().then(setCaffeineOn).catch(console.error);
    loadBindings();
  }, []);

  const healthLabel = (providerId: string) => {
    if (checking[providerId]) return { text: t("set.checking"), color: "var(--accent)" };
    const h = keyHealth[providerId];
    if (!h) return { text: t("set.healthUnknown"), color: "var(--text-tertiary)" };
    switch (h.status) {
      case "valid": return { text: t("set.healthValid"), color: "var(--success)" };
      case "invalid": return { text: t("set.healthInvalid"), color: "var(--error)" };
      case "missing": return { text: t("set.healthMissing"), color: "var(--warning)" };
      case "unreachable": return { text: t("set.healthUnreachable"), color: "var(--warning)" };
      default: return { text: t("set.healthFailed"), color: "var(--error)" };
    }
  };

  const runHealthCheck = async (provider: string, keyOverride?: string) => {
    setChecking((prev) => ({ ...prev, [provider]: true }));
    try {
      const health = await checkApiKeyHealth(provider, keyOverride && keyOverride.trim() ? keyOverride : undefined);
      setKeyHealth((prev) => ({ ...prev, [provider]: health }));
      return health;
    } catch (err) {
      const fallback: ApiKeyHealth = {
        status: "check_failed",
        message: String(err),
      };
      setKeyHealth((prev) => ({ ...prev, [provider]: fallback }));
      return fallback;
    } finally {
      setChecking((prev) => ({ ...prev, [provider]: false }));
    }
  };

  useEffect(() => {
    ["gemini", "openai", "claude", "openrouter", "ollama"].forEach((provider) => {
      void runHealthCheck(provider);
    });
  }, []);

  const loadBindings = () => {
    getHotkeyBindings().then(setHotkeyBindings).catch(console.error);
  };

  useEffect(() => {
    if (activeTab !== "permissions") return;
    const load = () => checkPermissions().then(setPermStatus).catch(console.error);
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (!editingAction) return;
    const handler = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setEditingAction(null);
        return;
      }
      // Ignore modifier-only presses
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

      try {
        await updateHotkey(
          editingAction,
          e.key.length === 1 ? e.key.toLowerCase() : e.key,
          e.ctrlKey,
          e.shiftKey,
          e.altKey,
          e.metaKey,
        );
        showToast(t("set.shortcutSaved"), "success");
      } catch (err) {
        showToast(String(err), "error");
      }
      setEditingAction(null);
      loadBindings();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [editingAction]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (geminiKey.trim()) void runHealthCheck("gemini", geminiKey);
      if (openaiKey.trim()) void runHealthCheck("openai", openaiKey);
      if (claudeKey.trim()) void runHealthCheck("claude", claudeKey);
      if (openrouterKey.trim()) void runHealthCheck("openrouter", openrouterKey);
      void runHealthCheck("ollama");
    }, 500);
    return () => clearTimeout(timer);
  }, [geminiKey, openaiKey, claudeKey, openrouterKey, settings?.ai_provider]);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await updateSettings(settings);
      await saveSettingsToDb();

      if (geminiKey) {
        await setApiKey("gemini", geminiKey);
        checkApiKeyHealth("gemini", geminiKey).then(h => {
          if (h.status === "valid") showToast("Gemini: " + t("set.keyValid"), "success");
          else if (h.status === "invalid") showToast("Gemini: " + t("set.keyInvalid"), "error");
        }).catch(() => {});
      }
      if (openaiKey) {
        await setApiKey("openai", openaiKey);
        checkApiKeyHealth("openai", openaiKey).then(h => {
          if (h.status === "valid") showToast("OpenAI: " + t("set.keyValid"), "success");
          else if (h.status === "invalid") showToast("OpenAI: " + t("set.keyInvalid"), "error");
        }).catch(() => {});
      }
      if (claudeKey) {
        await setApiKey("claude", claudeKey);
        checkApiKeyHealth("claude", claudeKey).then(h => {
          if (h.status === "valid") showToast("Claude: " + t("set.keyValid"), "success");
          else if (h.status === "invalid") showToast("Claude: " + t("set.keyInvalid"), "error");
        }).catch(() => {});
      }
      if (openrouterKey) {
        await setApiKey("openrouter", openrouterKey);
        checkApiKeyHealth("openrouter", openrouterKey).then(h => {
          if (h.status === "valid") showToast("OpenRouter: " + t("set.keyValid"), "success");
          else if (h.status === "invalid") showToast("OpenRouter: " + t("set.keyInvalid"), "error");
        }).catch(() => {});
      }

      await setAiProvider(settings.ai_provider);
      await Promise.all([
        runHealthCheck("gemini"),
        runHealthCheck("openai"),
        runHealthCheck("claude"),
        runHealthCheck("openrouter"),
        runHealthCheck("ollama"),
      ]);
      showToast(t("set.saved"), "success");
    } catch (err) {
      showToast(`${t("set.saveFailed")}: ${String(err)}`, "error");
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportSettings();
      await navigator.clipboard.writeText(json);
      showToast(t("set.copiedToClipboard"), "success");
    } catch (err) {
      showToast(`${t("set.exportFailed")}: ${String(err)}`, "error");
    }
  };

  const handleImport = async () => {
    try {
      const json = await navigator.clipboard.readText();
      await importSettings(json);
      const updated = await getSettings();
      setSettings(updated);
      showToast(t("set.imported"), "success");
    } catch (err) {
      showToast(`${t("set.importFailed")}: ${String(err)}`, "error");
    }
  };

  const handleCreateBackup = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      const backupPath = await createFullBackup(selected as string);
      showToast(`${t("set.backupCreated")}: ${backupPath}`, "success");
    } catch (err) {
      showToast(`${t("set.backupFailed")}: ${String(err)}`, "error");
    }
  };

  const handleRestoreBackup = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      await restoreFullBackup(selected as string);
      const updated = await getSettings();
      setSettings(updated);
      showToast(t("set.backupRestored"), "success");
    } catch (err) {
      showToast(`${t("set.restoreFailed")}: ${String(err)}`, "error");
    }
  };

  const handleCaffeine = async () => {
    try {
      const newState = await toggleCaffeine();
      setCaffeineOn(newState);
      showToast(newState ? t("set.caffeineOn") : t("set.caffeineOff"), "info");
    } catch (err) {
      showToast(`${t("set.caffeineToggleFailed")}: ${String(err)}`, "error");
    }
  };

  const handleKeyboardLock = async () => {
    try {
      await toggleKeyboardLock();
      showToast(t("set.keyboardLocked"), "info");
    } catch (err) {
      showToast(`${t("set.keyboardLockFailed")}: ${String(err)}`, "error");
    }
  };

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  if (!settings) return <div className="empty-state"><div className="spinner" /></div>;
  const isMacOS = appInfo?.platform === "macos";

  const TABS: { id: SettingsTab; label: string; icon: string }[] = [
    { id: "general", label: t("set.general"), icon: "\u{2699}\u{FE0F}" },
    { id: "ai", label: t("set.aiProviders"), icon: "\u{1F916}" },
    { id: "layouts", label: t("set.layouts"), icon: "\u{2328}\u{FE0F}" },
    { id: "shortcuts", label: t("set.shortcuts"), icon: "\u{2318}" },
    { id: "permissions", label: t("set.permissions"), icon: "\uD83D\uDD12" },
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
                <option value="en">{t("lang.english")}</option>
                <option value="he">{t("lang.hebrew")}</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>{t("set.launchAtLogin")}</label>
              <button className={`toggle ${settings.launch_at_login ? "active" : ""}`} onClick={() => updateField("launch_at_login", !settings.launch_at_login)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
              <label>{t("set.startMinimized")}</label>
              <button className={`toggle ${settings.start_minimized_to_tray ? "active" : ""}`} onClick={() => updateField("start_minimized_to_tray", !settings.start_minimized_to_tray)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
              <label>{t("set.uiScale")}</label>
              <input className="input" type="number" step={0.1} min={0.8} max={1.6} value={settings.ui_scale} onChange={(e) => updateField("ui_scale", Number(e.target.value) || 1)} style={{ width: "90px" }} />
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>{t("set.previewLength")}</label>
              <input className="input" type="number" value={settings.clipboard_preview_length} onChange={(e) => updateField("clipboard_preview_length", parseInt(e.target.value) || 200)} style={{ width: "90px" }} min={20} max={2000} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label>{t("set.autoDeleteDays")}</label>
              <input className="input" type="number" value={settings.clipboard_retention_days ?? ""} onChange={(e) => updateField("clipboard_retention_days", e.target.value ? parseInt(e.target.value) : null)} style={{ width: "90px" }} min={1} max={3650} placeholder={t("set.off")} />
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
              <label>{t("set.expansionDelayMs")}</label>
              <input className="input" type="number" value={settings.snippet_expansion_delay_ms} onChange={(e) => updateField("snippet_expansion_delay_ms", parseInt(e.target.value) || 120)} style={{ width: "90px" }} min={0} max={5000} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.utilities")}</h3>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div>
                <label>{t("set.sounds")}</label>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{t("set.soundsDesc")}</p>
              </div>
              <button className={`toggle ${soundsOn ? "active" : ""}`} onClick={() => { const next = !soundsOn; setSoundsOn(next); setSoundsEnabled(next); }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div>
                <label>{t("set.transcriptionToast")}</label>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{t("set.transcriptionToastDesc")}</p>
              </div>
              <button className={`toggle ${settings.notification_transcription_complete ? "active" : ""}`} onClick={() => updateField("notification_transcription_complete", !settings.notification_transcription_complete)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div>
                <label>{t("set.grammar")}</label>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{t("set.grammarDesc")}</p>
              </div>
              <button className={`toggle ${settings.grammar_enabled ? "active" : ""}`} onClick={() => updateField("grammar_enabled", !settings.grammar_enabled)} />
            </div>
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
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.aiOutputLanguage")}</h3>
            <select className="select" style={{ width: "100%" }} value={settings.ai_output_language} onChange={(e) => updateField("ai_output_language", e.target.value)}>
              <option value="auto">{t("set.autoMatchInput")}</option>
              <option value="en">{t("lang.english")}</option>
              <option value="he">{t("lang.hebrew")}</option>
            </select>
          </div>

          {[
            { id: "gemini", name: "Google Gemini", key: geminiKey, setKey: setGeminiKey, hint: "Get a free key at aistudio.google.com" },
            { id: "openai", name: "OpenAI", key: openaiKey, setKey: setOpenaiKey, hint: "Get key at platform.openai.com" },
            { id: "claude", name: "Anthropic Claude", key: claudeKey, setKey: setClaudeKey, hint: "Get key at console.anthropic.com" },
            { id: "openrouter", name: "OpenRouter", key: openrouterKey, setKey: setOpenrouterKey, hint: "Free models available at openrouter.ai" },
          ].map((provider) => (
            <div key={provider.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600 }}>{provider.name}</h3>
                <span style={{ fontSize: "12px", fontWeight: 600, color: healthLabel(provider.id).color }}>
                  {healthLabel(provider.id).text}
                </span>
              </div>
              <input className="input" type="password" placeholder={t("set.apiKeyPlaceholder")} value={provider.key} onChange={(e) => provider.setKey(e.target.value)} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", gap: "8px" }}>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: 0, flex: 1 }}>{provider.hint}</p>
                <button
                  className="btn btn-sm"
                  disabled={checking[provider.id]}
                  onClick={() => void runHealthCheck(provider.id, provider.key)}
                >
                  {checking[provider.id] ? t("set.checking") : t("set.testKey")}
                </button>
              </div>
              {keyHealth[provider.id]?.message && (
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "6px" }}>
                  {keyHealth[provider.id].message}
                </p>
              )}
            </div>
          ))}

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600 }}>{t("set.ollamaLocal")}</h3>
              <span style={{ fontSize: "12px", fontWeight: 600, color: healthLabel("ollama").color }}>
                {healthLabel("ollama").text}
              </span>
            </div>
            <input className="input" placeholder="http://localhost:11434" value={settings.ollama_endpoint} onChange={(e) => updateField("ollama_endpoint", e.target.value)} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", gap: "8px" }}>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: 0, flex: 1 }}>
                {t("set.ollamaHint")}
              </p>
              <button className="btn btn-sm" disabled={checking.ollama} onClick={() => void runHealthCheck("ollama")}>
                {checking.ollama ? t("set.checking") : t("set.testConnection")}
              </button>
            </div>
            {keyHealth.ollama?.message && (
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "6px" }}>
                {keyHealth.ollama.message}
              </p>
            )}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
              <div>
                <label>{t("set.globalTypingDetection")}</label>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                  {isMacOS ? t("set.globalTypingDetectionMacDesc") : t("set.globalTypingDetectionDesc")}
                </p>
              </div>
              <button
                className={`toggle ${settings.global_typing_detection ? "active" : ""}`}
                onClick={() => updateField("global_typing_detection", !settings.global_typing_detection)}
                disabled={isMacOS}
                title={isMacOS ? t("set.globalTypingDetectionMacTitle") : undefined}
              />
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

      {activeTab === "shortcuts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {editingAction && (
            <div style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
              justifyContent: "center", zIndex: 1000,
            }}>
              <div className="card" style={{ padding: "32px", textAlign: "center", minWidth: "300px" }}>
                <p style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>{t("set.pressShortcut")}</p>
                <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                  {t("set.escToCancel")}
                </p>
              </div>
            </div>
          )}
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.shortcuts")}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {hotkeyBindings.map((binding) => {
                const displayName = t(`set.action.${binding.action}` as any) || binding.action_display;
                return (
                  <div key={binding.action} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)",
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: 500 }}>{displayName}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <code style={{
                        padding: "4px 8px", background: "var(--bg-primary)",
                        borderRadius: "var(--radius-sm)", fontSize: "12px",
                        border: "1px solid var(--border-primary)",
                      }}>{binding.display_string}</code>
                      <button className="btn btn-sm" onClick={() => setEditingAction(binding.action)}>
                        {t("set.editShortcut")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <button className="btn" onClick={async () => {
            try {
              await resetHotkeyDefaults();
              loadBindings();
              showToast(t("set.shortcutSaved"), "success");
            } catch (err) {
              showToast(String(err), "error");
            }
          }}>{t("set.resetDefaults")}</button>
        </div>
      )}

      {activeTab === "permissions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>{t("set.permStatus")}</h3>
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "16px" }}>{t("set.permStatusDesc")}</p>

            {permStatus && permStatus.platform === "macos" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { key: "accessibility", granted: permStatus.accessibility, label: t("set.perm.accessibility"), desc: t("set.perm.accessibilityDesc"), url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" },
                  { key: "screen_recording", granted: permStatus.screen_recording, label: t("set.perm.screenRecording"), desc: t("set.perm.screenRecordingDesc"), url: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture" },
                  { key: "microphone", granted: permStatus.microphone, label: t("set.perm.microphone"), desc: t("set.perm.microphoneDesc"), url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone" },
                ].map((perm) => (
                  <div key={perm.key} style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "12px", background: "var(--bg-primary)",
                    border: `1px solid ${perm.granted ? "var(--success)" : "var(--error)"}`,
                    borderRadius: "var(--radius-lg)",
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: perm.granted ? "var(--success)" : "var(--error)",
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>{perm.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{perm.desc}</div>
                    </div>
                    {perm.granted ? (
                      <span style={{ fontSize: "12px", color: "var(--success)", fontWeight: 600 }}>{t("set.perm.granted")}</span>
                    ) : (
                      <button className="btn btn-sm" onClick={() => openUrl(perm.url)} style={{ background: "var(--accent)", color: "white", border: "none", fontWeight: 600 }}>
                        {t("set.perm.grantAccess")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {permStatus && permStatus.platform === "windows" && (
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", padding: "12px", background: "var(--bg-primary)", borderRadius: "var(--radius-lg)" }}>
                {t("set.windowsNote")}
              </p>
            )}

            {permStatus && permStatus.platform === "linux" && (
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", padding: "12px", background: "var(--bg-primary)", borderRadius: "var(--radius-lg)" }}>
                {t("set.linuxNote")}
              </p>
            )}

            <button className="btn btn-sm" onClick={() => checkPermissions().then(setPermStatus)} style={{ marginTop: "12px", alignSelf: "flex-start" }}>
              {t("set.perm.refresh")}
            </button>
          </div>

          {/* Platform Info */}
          {permStatus && (
            <div className="card">
              <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.platformInfo")}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                <div style={{ color: "var(--text-tertiary)" }}>Platform</div>
                <div>{permStatus.os_version || permStatus.platform}</div>
                <div style={{ color: "var(--text-tertiary)" }}>Architecture</div>
                <div>{permStatus.arch}</div>
                <div style={{ color: "var(--text-tertiary)" }}>App Version</div>
                <div>v{permStatus.app_version}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "about" && appInfo && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card" style={{ textAlign: "center", padding: "32px" }}>
            <div style={{ fontSize: "48px", marginBottom: "8px" }}>{"\u{1F4A1}"}</div>
            <h2 style={{ fontSize: "24px", fontWeight: 700 }}>{appInfo.name}</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>{t("set.versionPrefix")} {appInfo.version}</p>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", maxWidth: "400px", margin: "0 auto 16px" }}>{appInfo.description}</p>
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
              <span>{t("set.platformPrefix")}: {appInfo.platform}</span>
              <span>{t("set.archPrefix")}: {appInfo.arch}</span>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>{t("set.dataManagement")}</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn" onClick={handleExport}>{"\u{1F4E4}"} {t("set.export")}</button>
              <button className="btn" onClick={handleImport}>{"\u{1F4E5}"} {t("set.import")}</button>
              <button className="btn" onClick={handleCreateBackup}>{"\u{1F4BE}"} {t("set.fullBackup")}</button>
              <button className="btn" onClick={handleRestoreBackup}>{"\u{267B}\u{FE0F}"} {t("set.restoreBackup")}</button>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>{t("set.exportHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
