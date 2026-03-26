use crate::engine::clipboard::{ClipboardCategory, ClipboardItem, ClipboardManager};
use tauri::State;
use std::sync::Arc;

pub struct ClipboardState(pub Arc<ClipboardManager>);

#[tauri::command]
pub fn get_clipboard_items(
    query: Option<&str>,
    category: Option<&str>,
    limit: Option<usize>,
    offset: Option<usize>,
    state: State<'_, ClipboardState>,
) -> Vec<ClipboardItem> {
    let cat = category.and_then(|c| serde_json::from_str::<ClipboardCategory>(&format!("\"{}\"", c)).ok());
    state.0.get_items(query, cat.as_ref(), limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub fn add_clipboard_item(content: &str, state: State<'_, ClipboardState>) -> Option<ClipboardItem> {
    state.0.add(content.to_string())
}

#[tauri::command]
pub fn toggle_clipboard_pin(id: &str, state: State<'_, ClipboardState>) -> bool {
    state.0.toggle_pin(id)
}

#[tauri::command]
pub fn toggle_clipboard_favorite(id: &str, state: State<'_, ClipboardState>) -> bool {
    state.0.toggle_favorite(id)
}

#[tauri::command]
pub fn delete_clipboard_item(id: &str, state: State<'_, ClipboardState>) -> bool {
    state.0.delete(id)
}

#[tauri::command]
pub fn clear_clipboard_history(state: State<'_, ClipboardState>) {
    state.0.clear();
}

#[tauri::command]
pub fn get_clipboard_count(state: State<'_, ClipboardState>) -> usize {
    state.0.count()
}

/// Read current system clipboard content
#[tauri::command]
pub fn read_system_clipboard() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;
    clipboard.get_text()
        .map_err(|e| format!("Failed to read clipboard: {}", e))
}

/// Write text to system clipboard
#[tauri::command]
pub fn write_system_clipboard(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;
    clipboard.set_text(text)
        .map_err(|e| format!("Failed to write clipboard: {}", e))
}
