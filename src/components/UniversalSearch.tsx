import { useEffect, useMemo, useState } from "react";
import { getClipboardItems, getSnippets, listTranscriptions, type ClipboardItem, type Snippet, type TranscriptionJobRecord } from "../lib/tauri";
import { useLocale } from "../lib/i18n";
import { showToast } from "./Toast";

type ResultItem =
  | { kind: "clipboard"; id: string; title: string; subtitle: string }
  | { kind: "snippet"; id: string; title: string; subtitle: string }
  | { kind: "transcription"; id: string; title: string; subtitle: string };

export function UniversalSearch() {
  const [, t] = useLocale();
  const [query, setQuery] = useState("");
  const [clipboard, setClipboard] = useState<ClipboardItem[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [transcriptions, setTranscriptions] = useState<TranscriptionJobRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getClipboardItems(undefined, undefined, 150, 0),
      getSnippets(),
      listTranscriptions(150, 0),
    ]).then(([c, s, t]) => {
      setClipboard(c);
      setSnippets(s);
      setTranscriptions(t);
    }).catch((err) => {
      showToast(String(err), "error");
    }).finally(() => setLoading(false));
  }, []);

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: ResultItem[] = [];

    for (const c of clipboard) {
      if (c.content.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)) {
        out.push({ kind: "clipboard", id: c.id, title: c.preview, subtitle: `${t("app.clipboard")} - ${c.category}` });
      }
    }
    for (const s of snippets) {
      const folder = s.folder ? `/${s.folder}` : "";
      if (s.trigger.toLowerCase().includes(q) || s.content.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q)) {
        out.push({ kind: "snippet", id: s.id, title: `${s.trigger}${folder}`, subtitle: s.description || s.content.slice(0, 120) });
      }
    }
    for (const t of transcriptions) {
      const text = t.text || "";
      if (t.file_name.toLowerCase().includes(q) || text.toLowerCase().includes(q)) {
        out.push({ kind: "transcription", id: t.id, title: t.file_name, subtitle: text.slice(0, 140) || t.status });
      }
    }
    return out.slice(0, 300);
  }, [query, clipboard, snippets, transcriptions]);

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">{t("search.title")}</h2>
      </div>
      <div className="search-bar" style={{ marginBottom: 12 }}>
        <span>{"\u{1F50D}"}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search.placeholder")} />
      </div>
      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : query.trim() === "" ? (
        <div className="empty-state"><p>{t("search.hint")}</p></div>
      ) : results.length === 0 ? (
        <div className="empty-state"><p>{t("search.noResults")}</p></div>
      ) : (
        <div className="grid">
          {results.map((r) => (
            <div key={`${r.kind}:${r.id}`} className="card">
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>{t(`search.kind.${r.kind}` as any)}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, wordBreak: "break-word" }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-word" }}>{r.subtitle}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
