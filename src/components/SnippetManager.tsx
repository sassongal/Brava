import { useState, useEffect } from "react";
import {
  getSnippets,
  addSnippet,
  updateSnippet,
  deleteSnippet,
  expandSnippetVariables,
  type Snippet,
} from "../lib/tauri";

export function SnippetManager() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    loadSnippets();
  }, []);

  const loadSnippets = async () => {
    try {
      const result = await getSnippets();
      setSnippets(result);
    } catch (err) {
      console.error("Failed to load snippets:", err);
    }
  };

  const handlePreview = async (content: string) => {
    try {
      const expanded = await expandSnippetVariables(content);
      setPreview(expanded);
    } catch {
      setPreview(content);
    }
  };

  const handleSave = async () => {
    if (!trigger.trim() || !content.trim()) return;

    try {
      if (editingId) {
        await updateSnippet(editingId, trigger, content, description || undefined);
      } else {
        await addSnippet(trigger, content, description || undefined);
      }
      resetForm();
      loadSnippets();
    } catch (err) {
      console.error("Failed to save snippet:", err);
    }
  };

  const handleEdit = (snippet: Snippet) => {
    setEditingId(snippet.id);
    setTrigger(snippet.trigger);
    setContent(snippet.content);
    setDescription(snippet.description || "");
    setShowForm(true);
    handlePreview(snippet.content);
  };

  const handleDelete = async (id: string) => {
    await deleteSnippet(id);
    loadSnippets();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTrigger("");
    setContent("");
    setDescription("");
    setPreview("");
  };

  const VARIABLE_CHIPS = [
    { label: "{date}", desc: "Current date" },
    { label: "{time}", desc: "Current time" },
    { label: "{datetime}", desc: "Date and time" },
    { label: "{clipboard}", desc: "Clipboard content" },
    { label: "{day}", desc: "Day name" },
    { label: "{month}", desc: "Month name" },
    { label: "{year}", desc: "Current year" },
    { label: "{timestamp}", desc: "Unix timestamp" },
  ];

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Snippets</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Snippet"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px", display: "block" }}>
                Trigger (type this to expand)
              </label>
              <input
                className="input"
                placeholder="e.g., /sig, //email, .addr"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                maxLength={20}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px", display: "block" }}>
                Content (expands to this)
              </label>
              <textarea
                className="input"
                placeholder="e.g., Best regards,\nJohn Doe"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  handlePreview(e.target.value);
                }}
                rows={4}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px", display: "block" }}>
                Dynamic Variables
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {VARIABLE_CHIPS.map((v) => (
                  <button
                    key={v.label}
                    className="btn btn-sm"
                    title={v.desc}
                    onClick={() => {
                      setContent((prev) => prev + v.label);
                      handlePreview(content + v.label);
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {preview && (
              <div style={{ padding: "10px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Preview:
                </div>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", margin: 0 }}>
                  {preview}
                </pre>
              </div>
            )}

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px", display: "block" }}>
                Description (optional)
              </label>
              <input
                className="input"
                placeholder="What this snippet is for"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn" onClick={resetForm}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingId ? "Update" : "Create"} Snippet
              </button>
            </div>
          </div>
        </div>
      )}

      {snippets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{"\u{2328}\u{FE0F}"}</div>
          <p>No snippets yet</p>
          <p style={{ fontSize: "13px", marginTop: "4px" }}>
            Create text shortcuts that expand as you type
          </p>
        </div>
      ) : (
        <div className="grid">
          {snippets.map((snippet) => (
            <div key={snippet.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <code style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "var(--accent)",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {snippet.trigger}
                  </code>
                  {snippet.description && (
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {snippet.description}
                    </p>
                  )}
                  <p style={{
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    marginTop: "6px",
                    whiteSpace: "pre-wrap",
                    maxHeight: "60px",
                    overflow: "hidden",
                  }}>
                    {snippet.content}
                  </p>
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    Used {snippet.use_count} times
                  </span>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button className="btn-icon" onClick={() => handleEdit(snippet)} title="Edit">
                    {"\u{270F}\u{FE0F}"}
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleDelete(snippet.id)}
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
