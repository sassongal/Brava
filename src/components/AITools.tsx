import { useState } from "react";
import {
  aiComplete,
  aiEnhancePrompt,
  aiTranslate,
  readSystemClipboard,
  writeSystemClipboard,
  type AIResponse,
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

  // Translation
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("English");

  const handleEnhance = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await aiEnhancePrompt(input);
      setOutput(result);
    } catch (err) {
      setError(String(err));
      showToast("AI request failed: " + String(err), "error");
    }
    setLoading(false);
  };

  const handleTranslate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await aiTranslate(input, sourceLang, targetLang);
      setOutput(result);
    } catch (err) {
      setError(String(err));
      showToast("AI request failed: " + String(err), "error");
    }
    setLoading(false);
  };

  const handleFreeform = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await aiComplete(input);
      setOutput(result);
    } catch (err) {
      setError(String(err));
      showToast("AI request failed: " + String(err), "error");
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
      showToast("Failed to read clipboard: " + String(err), "error");
    }
  };

  const copyResult = async () => {
    if (!output) return;
    try {
      await writeSystemClipboard(output.content);
      showToast("Result copied to clipboard", "success");
    } catch (err) {
      showToast("Failed to copy: " + String(err), "error");
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
      {activeTab === "translate" && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
          <select className="select" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l === "auto" ? "Auto-detect" : l}</option>)}
          </select>
          <span style={{ color: "var(--text-secondary)" }}>{"\u{2192}"}</span>
          <select className="select" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
            {LANGUAGES.filter((l) => l !== "auto").map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
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
          title="Paste from clipboard"
        >
          {"\u{1F4CB}"} {t("conv.paste")}
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !input.trim()}>
          {loading ? (
            <><div className="spinner" style={{ width: "14px", height: "14px" }} /> {t("ai.processing")}</>
          ) : (
            activeTab === "enhance" ? `\u{2728} ${t("ai.enhance")}` :
            activeTab === "translate" ? `\u{1F310} ${t("ai.translate")}` :
            `\u{1F4AC} ${t("ai.ask")}`
          )}
        </button>
        <button className="btn" onClick={() => { setInput(""); setOutput(null); setError(null); }}>
          {t("conv.clear")}
        </button>
      </div>

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
              via {output.provider} / {output.model}
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
        </div>
      )}
    </div>
  );
}
