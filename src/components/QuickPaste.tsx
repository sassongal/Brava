import { useEffect, useMemo, useState } from "react";
import { getClipboardItems, writeSystemClipboard, type ClipboardItem } from "../lib/tauri";
import { showToast } from "./Toast";

interface QuickPasteProps {
  open: boolean;
  onClose: () => void;
}

export function QuickPaste({ open, onClose }: QuickPasteProps) {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    void getClipboardItems(undefined, undefined, 30, 0).then(setItems).catch(() => {});
    setQuery("");
    setActiveIdx(0);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.content.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((prev) => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIdx];
        if (!item) return;
        try {
          await writeSystemClipboard(item.content);
          showToast("Copied from quick paste", "success");
        } catch (err) {
          showToast(String(err), "error");
        } finally {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIdx, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 2000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 680, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
        <input
          className="input"
          autoFocus
          placeholder="Quick paste... type to filter, Enter to copy"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <div style={{ maxHeight: 380, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((item, idx) => (
            <button
              key={item.id}
              className="btn"
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={async () => {
                try {
                  await writeSystemClipboard(item.content);
                  showToast("Copied from quick paste", "success");
                } catch (err) {
                  showToast(String(err), "error");
                } finally {
                  onClose();
                }
              }}
              style={{
                justifyContent: "flex-start",
                borderColor: idx === activeIdx ? "var(--accent)" : "var(--border-primary)",
                background: idx === activeIdx ? "var(--bg-tertiary)" : "var(--bg-secondary)",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.preview}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No matches</div>}
        </div>
      </div>
    </div>
  );
}
