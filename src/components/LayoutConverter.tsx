import { useState, useEffect } from "react";
import {
  autoConvert,
  convertText,
  detectLayout,
  getLayouts,
  readSystemClipboard,
  writeSystemClipboard,
  type LayoutInfo,
  type ConversionResult,
  type DetectionResult,
} from "../lib/tauri";
import { useLocale } from "../lib/i18n";
import { showToast } from "./Toast";

export function LayoutConverter() {
  const [, t] = useLocale();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [layouts, setLayouts] = useState<LayoutInfo[]>([]);
  const [sourceLayout, setSourceLayout] = useState("auto");
  const [targetLayout, setTargetLayout] = useState("en");

  useEffect(() => {
    getLayouts().then(setLayouts).catch(console.error);
  }, []);

  useEffect(() => {
    if (input.length < 2) {
      setDetection(null);
      return;
    }
    const timer = setTimeout(() => {
      detectLayout(input).then(setDetection).catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  const handleConvert = async () => {
    if (!input.trim()) return;
    try {
      let res: ConversionResult;
      if (sourceLayout === "auto") {
        res = await autoConvert(input);
      } else {
        res = await convertText(input, sourceLayout, targetLayout);
      }
      setResult(res);
      showToast(`${res.source_layout} → ${res.target_layout}`, "success");
    } catch (err) {
      showToast("Conversion failed: " + String(err), "error");
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
    if (!result) return;
    try {
      await writeSystemClipboard(result.converted);
      showToast(t("clip.copied"), "success");
    } catch (err) {
      showToast("Copy failed: " + String(err), "error");
    }
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">{t("conv.title")}</h2>
      </div>

      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
        {t("conv.desc")}
      </p>

      {/* Layout selectors */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
        <select
          className="select"
          value={sourceLayout}
          onChange={(e) => setSourceLayout(e.target.value)}
        >
          <option value="auto">{t("conv.auto")}</option>
          {layouts.map((l) => (
            <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
          ))}
        </select>
        <span style={{ fontSize: "20px", color: "var(--text-secondary)" }}>{"\u{2192}"}</span>
        <select
          className="select"
          value={targetLayout}
          onChange={(e) => setTargetLayout(e.target.value)}
        >
          {layouts.map((l) => (
            <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
          ))}
        </select>
      </div>

      {/* Detection info */}
      {detection && detection.confidence > 0 && (
        <div style={{
          padding: "8px 12px",
          background: "var(--accent-light)",
          borderRadius: "var(--radius-sm)",
          marginBottom: "12px",
          fontSize: "13px",
        }}>
          {t("conv.detected")}: <strong>{detection.detected_name}</strong> ({(detection.confidence * 100).toFixed(0)}% {t("conv.confidence")})
        </div>
      )}

      {/* Input */}
      <div style={{ position: "relative", marginBottom: "12px" }}>
        <textarea
          className="input"
          placeholder={t("conv.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleConvert();
          }}
        />
        <button
          className="btn btn-sm"
          style={{ position: "absolute", top: "8px", right: "8px" }}
          onClick={pasteFromClipboard}
        >
          {"\u{1F4CB}"} {t("conv.paste")}
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button className="btn btn-primary" onClick={handleConvert} disabled={!input.trim()}>
          {"\u{1F504}"} {t("conv.convert")}
        </button>
        <button className="btn" onClick={() => { setInput(""); setResult(null); setDetection(null); }}>
          {t("conv.clear")}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {result.source_layout} {"\u{2192}"} {result.target_layout}
            </span>
            <button className="btn btn-sm" onClick={copyResult}>
              {"\u{1F4CB}"} {t("conv.copy")}
            </button>
          </div>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            direction: result.target_layout === "he" || result.target_layout === "ar" ? "rtl" : "ltr",
          }}>
            {result.converted}
          </p>
        </div>
      )}
    </div>
  );
}
