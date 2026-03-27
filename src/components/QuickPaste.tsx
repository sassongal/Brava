import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getClipboardItems, writeSystemClipboard, writeImageToClipboard, type ClipboardItem } from "../lib/tauri";
import { useLocale } from "../lib/i18n";
import { showToast } from "./Toast";

interface QuickPasteProps {
  open: boolean;
  onClose: () => void;
}

export function QuickPaste({ open, onClose }: QuickPasteProps) {
  const [, t] = useLocale();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load items when opened
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedIndex(0);
    getClipboardItems(undefined, undefined, 20, 0).then(setItems).catch(console.error);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Filter items by search
  const filtered = useMemo(() => {
    if (!search) return items.slice(0, 10);
    const q = search.toLowerCase();
    return items
      .filter(item => item.content.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q))
      .slice(0, 10);
  }, [items, search]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handlePaste = useCallback(async (item: ClipboardItem) => {
    try {
      if (item.image_path) {
        await writeImageToClipboard(item.image_path);
      } else {
        await writeSystemClipboard(item.content);
      }
      showToast(t("qp.copied"), "success");
      onClose();
    } catch (err) {
      showToast(String(err), "error");
    }
  }, [onClose, t]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selectedIndex];
      if (item) void handlePaste(item);
    }
  }, [filtered, selectedIndex, onClose, handlePaste]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        background: "rgba(0,0,0,0.3)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 480,
          maxHeight: "60vh",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-xl, 16px)",
          boxShadow: "var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.25))",
          border: "0.5px solid var(--border, var(--border-primary))",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border, var(--border-primary))" }}>
          <input
            ref={inputRef}
            className="input"
            placeholder={t("qp.placeholder")}
            aria-label={t("qp.inputLabel")}
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
            style={{ fontSize: 15, border: "none", background: "transparent", padding: 0, outline: "none", width: "100%" }}
          />
        </div>

        {/* Items list */}
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              {t("qp.noMatches")}
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={item.id}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => void handlePaste(item)}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  background: idx === selectedIndex ? "var(--accent-light, var(--bg-tertiary))" : "transparent",
                  borderLeft: idx === selectedIndex ? "3px solid var(--accent)" : "3px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  transition: "background 0.1s",
                }}
              >
                <span
                  className={`badge badge-${item.category}`}
                  style={{ fontSize: 9, flexShrink: 0 }}
                >
                  {item.category}
                </span>
                <span style={{
                  fontSize: 13,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}>
                  {item.image_path ? "[Image]" : item.preview}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: "8px 16px",
          borderTop: "0.5px solid var(--border, var(--border-primary))",
          display: "flex",
          gap: 12,
          fontSize: 11,
          color: "var(--text-tertiary)",
        }}>
          <span>{"\u2191\u2193"} navigate</span>
          <span>{"\u21B5"} paste</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
