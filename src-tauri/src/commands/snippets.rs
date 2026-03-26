use crate::engine::snippets::{Snippet, SnippetEngine};
use crate::DatabaseState;
use tauri::State;
use std::sync::Mutex;

pub struct SnippetState(pub Mutex<SnippetEngine>);

#[tauri::command]
pub fn get_snippets(state: State<'_, SnippetState>) -> Vec<Snippet> {
    let engine = state.0.lock().unwrap();
    engine.get_all()
}

#[tauri::command]
pub fn add_snippet(
    trigger: &str,
    content: &str,
    description: Option<&str>,
    state: State<'_, SnippetState>,
    db: State<'_, DatabaseState>,
) -> Snippet {
    let snippet = Snippet::new(
        trigger.to_string(),
        content.to_string(),
        description.map(|s| s.to_string()),
    );
    let result = snippet.clone();
    if let Err(e) = db.0.save_snippet(&result) {
        log::error!("Failed to persist snippet: {}", e);
    }
    let mut engine = state.0.lock().unwrap();
    engine.add(snippet);
    result
}

#[tauri::command]
pub fn update_snippet(
    id: &str,
    trigger: Option<&str>,
    content: Option<&str>,
    description: Option<Option<&str>>,
    state: State<'_, SnippetState>,
    db: State<'_, DatabaseState>,
) -> Result<Snippet, String> {
    let mut engine = state.0.lock().map_err(|e| e.to_string())?;
    let updated = engine
        .update(
            id,
            trigger.map(|s| s.to_string()),
            content.map(|s| s.to_string()),
            description.map(|opt| opt.map(|s| s.to_string())),
        )
        .cloned()
        .ok_or_else(|| "Snippet not found".to_string())?;
    if let Err(e) = db.0.save_snippet(&updated) {
        log::error!("Failed to persist snippet update: {}", e);
    }
    Ok(updated)
}

#[tauri::command]
pub fn delete_snippet(
    id: &str,
    state: State<'_, SnippetState>,
    db: State<'_, DatabaseState>,
) -> bool {
    let mut engine = state.0.lock().unwrap();
    let removed = engine.remove(id).is_some();
    if removed {
        if let Err(e) = db.0.delete_snippet(id) {
            log::error!("Failed to delete snippet from database: {}", e);
        }
    }
    removed
}

#[tauri::command]
pub fn match_snippet_buffer(buffer: &str, state: State<'_, SnippetState>) -> Option<Snippet> {
    let engine = state.0.lock().unwrap();
    engine.match_buffer(buffer).cloned()
}

#[tauri::command]
pub fn expand_snippet_variables(content: &str) -> String {
    let clipboard_text = arboard::Clipboard::new()
        .ok()
        .and_then(|mut c| c.get_text().ok())
        .unwrap_or_default();
    SnippetEngine::expand_variables(content, &clipboard_text)
}
