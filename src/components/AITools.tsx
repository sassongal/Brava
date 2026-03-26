import { useState } from "react";
import {
  aiComplete,
  aiEnhancePrompt,
  aiTranslate,
  readSystemClipboard,
  writeSystemClipboard,
  type AIResponse,
} from "../lib/tauri";

type AITab = "enhance" | "translate" | "freeform";

export function AITools() {
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
      console.error("Failed to read clipboard:", err);
    }
  };

  const copyResult = async () => {
    if (!output) return;
    try {
      await writeSystemClipboard(output.content);
    } catch (err) {
      console.error("Failed to copy:", err);
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
        <h2 className="section-title">AI Tools</h2>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
        {([
          { id: "enhance" as AITab, label: "Enhance Prompt", icon: "\u{2728}" },
          { id: "translate" as AITab, label: "Translate", icon: "\u{1F310}" },
          { id: "freeform" as AITab, label: "Ask AI", icon: "\u{1F4AC}" },
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
              ? "Paste your prompt here to enhance it..."
              : activeTab === "translate"
              ? "Enter text to translate..."
              : "Ask anything..."
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
          {"\u{1F4CB}"} Paste
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !input.trim()}>
          {loading ? (
            <><div className="spinner" style={{ width: "14px", height: "14px" }} /> Processing...</>
          ) : (
            activeTab === "enhance" ? "\u{2728} Enhance" :
            activeTab === "translate" ? "\u{1F310} Translate" :
            "\u{1F4AC} Ask"
          )}
        </button>
        <button className="btn" onClick={() => { setInput(""); setOutput(null); setError(null); }}>
          Clear
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
              {"\u{1F4CB}"} Copy Result
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
