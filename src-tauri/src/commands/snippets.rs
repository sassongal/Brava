use crate::engine::snippets::{Snippet, SnippetEngine};
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
) -> Snippet {
    let snippet = Snippet::new(
        trigger.to_string(),
        content.to_string(),
        description.map(|s| s.to_string()),
    );
    let result = snippet.clone();
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
) -> Result<Snippet, String> {
    let mut engine = state.0.lock().map_err(|e| e.to_string())?;
    engine
        .update(
            id,
            trigger.map(|s| s.to_string()),
            content.map(|s| s.to_string()),
            description.map(|opt| opt.map(|s| s.to_string())),
        )
        .cloned()
        .ok_or_else(|| "Snippet not found".to_string())
}

#[tauri::command]
pub fn delete_snippet(id: &str, state: State<'_, SnippetState>) -> bool {
    let mut engine = state.0.lock().unwrap();
    engine.remove(id).is_some()
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
