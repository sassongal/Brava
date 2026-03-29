import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getClipboardItems,
  deleteClipboardItem,
  toggleClipboardPin,
  toggleClipboardFavorite,
  clearClipboardHistory,
  writeSystemClipboard,
  writeImageToClipboard,
  type ClipboardItem,
} from "../lib/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { showToast } from "./Toast";
import { useLocale } from "../lib/i18n";

const CATEGORY_ICONS: Record<string, string> = {
  text: "\u{1F4DD}",
  url: "\u{1F517}",
  email: "\u{2709}\u{FE0F}",
  phone: "\u{1F4DE}",
  code: "\u{1F4BB}",
  color: "\u{1F3A8}",
  path: "\u{1F4C1}",
  number: "\u{1F522}",
  image: "\u{1F5BC}\u{FE0F}",
};

export function ClipboardHistory() {
  const [, t] = useLocale();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getClipboardItems(
        search || undefined,
        categoryFilter || undefined,
        50,
        0
      );
      setItems(result);
      setBrokenImages(new Set());
    } catch (err) {
      console.error("Failed to load clipboard items:", err);
    }
    setLoading(false);
  }, [search, categoryFilter]);

  // Debounce search input by 300ms before triggering backend query
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadItems();
    // Poll as fallback every 5 seconds (reduced from 2s since we have events now)
    const interval = setInterval(loadItems, 30000);
    // Listen for real-time clipboard changes from the Rust backend
    const unlisten = listen<ClipboardItem>("clipboard-changed", () => {
      loadItems();
    });
    return () => {
      clearInterval(interval);
      unlisten.then((fn) => fn());
    };
  }, [loadItems]);

  const handleCopy = async (item: ClipboardItem) => {
    try {
      if (item.image_path) {
        await writeImageToClipboard(item.image_path);
      } else {
        await writeSystemClipboard(item.content);
      }
      showToast(t("clip.copied"), "success");
    } catch (err) {
      showToast(`${t("common.failedCopy")}: ${String(err)}`, "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteClipboardItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      showToast(`${t("common.failed")}: ${String(err)}`, "error");
    }
  };

  const handlePin = async (id: string) => {
    try {
      await toggleClipboardPin(id);
      loadItems();
    } catch (err) {
      showToast(`${t("common.failed")}: ${String(err)}`, "error");
    }
  };

  const handleFavorite = async (id: string) => {
    try {
      await toggleClipboardFavorite(id);
      loadItems();
    } catch (err) {
      showToast(`${t("common.failed")}: ${String(err)}`, "error");
    }
  };

  const handleClear = async () => {
    if (!confirm(t("clip.clearAll") + "?")) return;
    try {
      await clearClipboardHistory();
      loadItems();
    } catch (err) {
      showToast("Failed to clear: " + String(err), "error");
    }
  };

  const selectedItems = items.filter((i) => selectedIds.has(i.id));

  const applyTransform = async (mode: "upper" | "lower" | "title" | "merge") => {
    if (selectedItems.length === 0) return;
    const texts = selectedItems.map((i) => i.content);
    let out = "";
    if (mode === "merge") {
      out = texts.join("\n");
    } else if (mode === "upper") {
      out = texts.join("\n").toUpperCase();
    } else if (mode === "lower") {
      out = texts.join("\n").toLowerCase();
    } else {
      out = texts
        .join("\n")
        .split(/\s+/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
        .join(" ");
    }
    await writeSystemClipboard(out);
    showToast(t("common.resultCopied"), "success");
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("clip.justNow");
    if (mins < 60) return `${mins}${t("clip.mAgo")}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}${t("clip.hAgo")}`;
    return date.toLocaleDateString();
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">{t("clip.title")}</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <select
            className="select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">{t("clip.allCats")}</option>
            <option value="text">{t("clip.cat.text")}</option>
            <option value="url">{t("clip.cat.url")}</option>
            <option value="email">{t("clip.cat.email")}</option>
            <option value="phone">{t("clip.cat.phone")}</option>
            <option value="code">{t("clip.cat.code")}</option>
            <option value="color">{t("clip.cat.color")}</option>
            <option value="path">{t("clip.cat.path")}</option>
            <option value="image">{t("clip.cat.image")}</option>
          </select>
          <button className="btn btn-danger btn-sm" onClick={handleClear}>
            {t("clip.clearAll")}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button className="btn btn-sm" disabled={selectedIds.size < 2} onClick={() => void applyTransform("merge")}>{t("clip.transform.merge")}</button>
        <button className="btn btn-sm" disabled={selectedIds.size < 1} onClick={() => void applyTransform("upper")}>{t("clip.transform.upper")}</button>
        <button className="btn btn-sm" disabled={selectedIds.size < 1} onClick={() => void applyTransform("lower")}>{t("clip.transform.lower")}</button>
        <button className="btn btn-sm" disabled={selectedIds.size < 1} onClick={() => void applyTransform("title")}>{t("clip.transform.title")}</button>
      </div>

      <div className="search-bar">
        <span>{"\u{1F50D}"}</span>
        <input
          type="text"
          placeholder={t("clip.search")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {searchInput && (
          <button className="btn-icon" onClick={() => { setSearchInput(""); setSearch(""); }}>
            {"\u{2715}"}
          </button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{"\u{1F4CB}"}</div>
          <p>{t("clip.empty")}</p>
          <p style={{ fontSize: "13px", marginTop: "4px" }}>
            {t("clip.empty.hint")}
          </p>
        </div>
      ) : (
        <div className="grid">
          {items.map((item) => (
            <div
              key={item.id}
              className="card"
              style={{ position: "relative" }}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        });
                      }}
                    />
                    <span className={`badge badge-${item.category}`}>
                      {CATEGORY_ICONS[item.category] || ""} {item.category}
                    </span>
                    {item.pinned && <span title={t("common.pinned")}>{"\u{1F4CC}"}</span>}
                    {item.favorite && <span title={t("common.favorite")}>{"\u{2B50}"}</span>}
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-tertiary)",
                        marginLeft: "auto",
                      }}
                    >
                      {formatTime(item.created_at)}
                    </span>
                  </div>
                  {item.image_path && !brokenImages.has(item.id) ? (
                    <img
                      src={convertFileSrc(item.image_path)}
                      alt={t("clip.imageAlt")}
                      onError={() => setBrokenImages(prev => new Set(prev).add(item.id))}
                      style={{
                        maxWidth: "100%",
                        maxHeight: "80px",
                        borderRadius: "var(--radius-sm)",
                        objectFit: "cover",
                      }}
                    />
                  ) : item.image_path ? (
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>[Image not found]</span>
                  ) : (
                    <p
                      style={{
                        fontSize: "13px",
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: "60px",
                        overflow: "hidden",
                      }}
                    >
                      {item.preview}
                    </p>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <button
                    className="btn-icon"
                    onClick={() => handleCopy(item)}
                    title={t("common.copy")}
                  >
                    {"\u{1F4CB}"}
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handlePin(item.id)}
                    title={item.pinned ? t("common.unpin") : t("common.pin")}
                  >
                    {"\u{1F4CC}"}
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleFavorite(item.id)}
                    title={t("common.favorite")}
                  >
                    {item.favorite ? "\u{2B50}" : "\u{2606}"}
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleDelete(item.id)}
                    title={t("common.delete")}
                    style={{ color: "var(--error)" }}
                  >
                    {"\u{1F5D1}"}
                  </button>
                </div>
              </div>
              {hoveredId === item.id && !item.image_path && item.content.length > 80 && (
                <div style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "100%",
                  marginTop: 4,
                  padding: "10px 12px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-lg)",
                  zIndex: 50,
                  maxHeight: 300,
                  overflowY: "auto",
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "var(--text-primary)",
                  pointerEvents: "none",
                }}>
                  {item.content}
                </div>
              )}
              {hoveredId === item.id && item.image_path && (
                <div style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "100%",
                  marginTop: 4,
                  padding: 4,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-lg)",
                  zIndex: 50,
                  pointerEvents: "none",
                }}>
                  <img
                    src={convertFileSrc(item.image_path)}
                    alt=""
                    style={{ maxWidth: "100%", maxHeight: 250, borderRadius: "var(--radius-sm)", display: "block" }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
