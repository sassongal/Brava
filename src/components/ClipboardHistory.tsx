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
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);

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
    } catch (err) {
      console.error("Failed to load clipboard items:", err);
    }
    setLoading(false);
  }, [search, categoryFilter]);

  useEffect(() => {
    loadItems();
    // Poll as fallback every 5 seconds (reduced from 2s since we have events now)
    const interval = setInterval(loadItems, 5000);
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
      showToast("Failed to copy: " + String(err), "error");
    }
  };

  const handleDelete = async (id: string) => {
    await deleteClipboardItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handlePin = async (id: string) => {
    await toggleClipboardPin(id);
    loadItems();
  };

  const handleFavorite = async (id: string) => {
    await toggleClipboardFavorite(id);
    loadItems();
  };

  const handleClear = async () => {
    await clearClipboardHistory();
    loadItems();
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

      <div className="search-bar">
        <span>{"\u{1F50D}"}</span>
        <input
          type="text"
          placeholder={t("clip.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="btn-icon" onClick={() => setSearch("")}>
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
            <div key={item.id} className="card" style={{ position: "relative" }}>
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
                    <span className={`badge badge-${item.category}`}>
                      {CATEGORY_ICONS[item.category] || ""} {item.category}
                    </span>
                    {item.pinned && <span title="Pinned">{"\u{1F4CC}"}</span>}
                    {item.favorite && <span title="Favorite">{"\u{2B50}"}</span>}
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
                  {item.image_path ? (
                    <img
                      src={convertFileSrc(item.image_path)}
                      alt="Clipboard image"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "80px",
                        borderRadius: "var(--radius-sm)",
                        objectFit: "cover",
                      }}
                    />
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
                    title="Copy"
                  >
                    {"\u{1F4CB}"}
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handlePin(item.id)}
                    title={item.pinned ? "Unpin" : "Pin"}
                  >
                    {"\u{1F4CC}"}
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleFavorite(item.id)}
                    title="Favorite"
                  >
                    {item.favorite ? "\u{2B50}" : "\u{2606}"}
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleDelete(item.id)}
                    title="Delete"
                    style={{ color: "var(--error)" }}
                  >
                    {"\u{1F5D1}"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
