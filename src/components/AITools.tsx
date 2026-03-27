import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  aiComplete,
  aiCompleteStream,
  aiEnhancePrompt,
  aiTranslate,
  checkApiKeyHealth,
  getAiProviders,
  getSavedPrompts,
  savePromptToLibrary,
  deleteSavedPrompt,
  useSavedPrompt,
  readSystemClipboard,
  writeSystemClipboard,
  type AIProviderInfo,
  type AIResponse,
  type SavedPrompt,
} from "../lib/tauri";
import { showToast } from "./Toast";
import { useLocale } from "../lib/i18n";

type AITab = "enhance" | "translate" | "freeform";

export function AITools() {
  const [, t] = useLocale();
  const [activeTab, setActiveTab] = useState<AITab>("enhance");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState(true);
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [providerHealth, setProviderHealth] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  // Prompt library
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showPromptLib, setShowPromptLib] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");

  // Translation
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("English");

  useEffect(() => {
    getSavedPrompts().then(setSavedPrompts).catch(console.error);
  }, []);

  const refreshPrompts = () => getSavedPrompts().then(setSavedPrompts).catch(console.error);

  useEffect(() => {
    void getAiProviders()
      .then(async (items) => {
        setProviders(items);
        const checks = await Promise.all(
          items.map(async (p) => {
            try {
              const health = await checkApiKeyHealth(p.id);
              return [p.id, health.status] as const;
            } catch {
              return [p.id, "check_failed"] as const;
            }
          }),
        );
        const map = Object.fromEntries(checks);
        setProviderHealth(map);
        const firstValid = items.find((p) => map[p.id] === "valid");
        if (firstValid) setSelectedProvider(firstValid.id);
      })
      .catch((err) => {
        setError(String(err));
      });
  }, []);

  const validProviders = useMemo(
    () => providers.filter((p) => providerHealth[p.id] === "valid"),
    [providers, providerHealth],
  );

  useEffect(() => {
    if (!selectedProvider && validProviders.length > 0) {
      setSelectedProvider(validProviders[0].id);
    }
    if (selectedProvider && !validProviders.some((p) => p.id === selectedProvider)) {
      setSelectedProvider(validProviders[0]?.id ?? "");
    }
  }, [selectedProvider, validProviders]);

  const handleEnhance = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError(t("ai.timedOut"));
    }, 60000);
    try {
      if (!selectedProvider) {
        throw new Error(t("ai.chooseProvider"));
      }
      const result = await aiEnhancePrompt(input, selectedProvider);
      clearTimeout(timeoutId);
      setOutput(result);
    } catch (err) {
      clearTimeout(timeoutId);
      setError(String(err));
      showToast(`${t("ai.requestFailed")}: ${String(err)}`, "error");
    }
    setLoading(false);
  };

  const handleTranslate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError(t("ai.timedOut"));
    }, 60000);
    try {
      if (!selectedProvider) {
        throw new Error(t("ai.chooseProvider"));
      }
      const result = await aiTranslate(input, sourceLang, targetLang, selectedProvider);
      clearTimeout(timeoutId);
      setOutput(result);
    } catch (err) {
      clearTimeout(timeoutId);
      setError(String(err));
      showToast(`${t("ai.requestFailed")}: ${String(err)}`, "error");
    }
    setLoading(false);
  };

  const handleFreeform = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError(t("ai.timedOut"));
    }, 60000);
    try {
      if (!selectedProvider) {
        throw new Error(t("ai.chooseProvider"));
      }
      if (!streamMode) {
        const result = await aiComplete(input, undefined, selectedProvider);
        clearTimeout(timeoutId);
        setOutput(result);
      } else {
        const requestId = crypto.randomUUID();
        setOutput({ content: "", model: t("ai.streaming"), provider: t("ai.streaming"), tokens_used: null });
        const unsubs: Array<() => void> = [];
        let resolveDone: (() => void) | null = null;
        const donePromise = new Promise<void>((resolve) => {
          resolveDone = resolve;
        });

        const [unlistenChunk, unlistenDone] = await Promise.all([
          listen<{ request_id: string; chunk: string }>("ai-stream-chunk", (event) => {
            if (event.payload.request_id !== requestId) return;
            setOutput((prev) => prev ? { ...prev, content: prev.content + event.payload.chunk } : prev);
          }),
          listen<{ request_id: string; content: string; provider: string; model: string }>("ai-stream-done", (event) => {
            if (event.payload.request_id !== requestId) return;
            setOutput((prev) => prev ? {
              ...prev,
              content: event.payload.content,
              provider: event.payload.provider,
              model: event.payload.model,
            } : prev);
            resolveDone?.();
          }),
        ]);
        unsubs.push(unlistenChunk, unlistenDone);

        try {
          await aiCompleteStream(input, undefined, selectedProvider, undefined, requestId);
          await Promise.race([
            donePromise,
            new Promise<void>((resolve) => setTimeout(resolve, 30000)),
          ]);
        } finally {
          clearTimeout(timeoutId);
          unsubs.forEach((u) => u());
        }
      }
    } catch (err) {
      setError(String(err));
      showToast(`${t("ai.requestFailed")}: ${String(err)}`, "error");
    }
    setLoading(false);
  };

  const handleSubmit = () => {
    switch (activeTab) {
      case "enhance": handleEnhance(); break;
      case "translate": handleTranslate(); break;
      case "freeform": handleFreeform(); break;
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await readSystemClipboard();
      setInput(text);
    } catch (err) {
      showToast(`${t("common.failedReadClipboard")}: ${String(err)}`, "error");
    }
  };

  const copyResult = async () => {
    if (!output) return;
    try {
      await writeSystemClipboard(output.content);
      showToast(t("common.resultCopied"), "success");
    } catch (err) {
      showToast(`${t("common.failedCopy")}: ${String(err)}`, "error");
    }
  };

  const LANGUAGES = [
    "auto", "English", "Hebrew", "Arabic", "Russian",
    "Spanish", "French", "German", "Chinese", "Japanese", "Korean",
    "Portuguese", "Italian", "Dutch", "Turkish",
  ];

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">{t("ai.title")}</h2>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
        {([
          { id: "enhance" as AITab, label: t("ai.enhance"), icon: "\u{2728}" },
          { id: "translate" as AITab, label: t("ai.translate"), icon: "\u{1F310}" },
          { id: "freeform" as AITab, label: t("ai.ask"), icon: "\u{1F4AC}" },
        ]).map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => { setActiveTab(tab.id); setOutput(null); setError(null); }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Translation language pickers */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("ai.provider")}</label>
        <select
          className="select"
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
          style={{ minWidth: 220 }}
        >
          {validProviders.length === 0 && <option value="">{t("ai.noValidProviders")}</option>}
          {validProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {activeTab === "translate" && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
          <select className="select" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l === "auto" ? t("common.autoDetect") : l}</option>)}
          </select>
          <span style={{ color: "var(--text-secondary)" }}>{"\u{2192}"}</span>
          <select className="select" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
            {LANGUAGES.filter((l) => l !== "auto").map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}
      {activeTab === "freeform" && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", marginRight: 8 }}>{t("ai.streamModeBeta")}</label>
          <button className={`toggle ${streamMode ? "active" : ""}`} onClick={() => setStreamMode(!streamMode)} />
        </div>
      )}

      {/* Input area */}
      <div style={{ position: "relative", marginBottom: "12px" }}>
        <textarea
          className="input"
          placeholder={
            activeTab === "enhance"
              ? t("ai.enhancePlaceholder")
              : activeTab === "translate"
              ? t("ai.translatePlaceholder")
              : t("ai.askPlaceholder")
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <button
          className="btn btn-sm"
          style={{ position: "absolute", top: "8px", right: "8px" }}
          onClick={pasteFromClipboard}
          title={t("common.pasteFromClipboard")}
        >
          {"\u{1F4CB}"} {t("conv.paste")}
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !input.trim() || !selectedProvider}>
          {loading ? (
            <><div className="spinner" style={{ width: "14px", height: "14px" }} /> {t("ai.processing")}</>
          ) : (
            activeTab === "enhance" ? `\u{2728} ${t("ai.enhance")}` :
            activeTab === "translate" ? `\u{1F310} ${t("ai.translate")}` :
            `\u{1F4AC} ${t("ai.ask")}`
          )}
        </button>
        {loading && (
          <button className="btn" onClick={() => { setLoading(false); setError(t("ai.cancelled")); }}>
            {t("common.cancel")}
          </button>
        )}
        <button className="btn" onClick={() => { setInput(""); setOutput(null); setError(null); }}>
          {t("conv.clear")}
        </button>
        <button className="btn btn-sm" onClick={() => setShowPromptLib(!showPromptLib)} style={{ marginLeft: "auto" }}>
          {showPromptLib ? t("ai.hidePrompts") : t("ai.savedPrompts")} ({savedPrompts.length})
        </button>
      </div>

      {/* Prompt Library */}
      {showPromptLib && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("ai.savedPrompts")}</h3>
          {savedPrompts.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{t("ai.noSavedPrompts")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {savedPrompts.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
                  <span style={{ flex: 1, cursor: "pointer" }} onClick={async () => {
                    setInput(p.prompt);
                    await useSavedPrompt(p.id);
                    refreshPrompts();
                    setShowPromptLib(false);
                  }}>
                    <strong>{p.title}</strong>
                    {p.category && <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>{p.category}</span>}
                    <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>({p.use_count}x)</span>
                  </span>
                  <button className="btn-icon" onClick={async () => { await deleteSavedPrompt(p.id); refreshPrompts(); }} style={{ color: "var(--error)" }}>{"\u2715"}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: "var(--error)", marginBottom: "12px" }}>
          <p style={{ color: "var(--error)", fontSize: "13px" }}>{error}</p>
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {t("common.via")} {output.provider} / {output.model}
              {output.tokens_used && ` (${output.tokens_used} tokens)`}
            </span>
            <button className="btn btn-sm" onClick={copyResult}>
              {"\u{1F4CB}"} {t("ai.copyResult")}
            </button>
          </div>
          <pre style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "14px",
            lineHeight: "1.6",
            fontFamily: "var(--font-sans)",
            margin: 0,
          }}>
            {output.content}
          </pre>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input className="input" placeholder={t("ai.promptTitle")} value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
            <button className="btn btn-sm" disabled={!saveTitle.trim()} onClick={async () => {
              await savePromptToLibrary(saveTitle, input);
              setSaveTitle("");
              refreshPrompts();
              showToast(t("ai.promptSaved"), "success");
            }}>
              {t("ai.savePrompt")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
