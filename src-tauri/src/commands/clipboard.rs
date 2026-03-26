use crate::engine::clipboard::{ClipboardCategory, ClipboardItem, ClipboardManager};
use crate::DatabaseState;
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
pub fn add_clipboard_item(
    content: &str,
    state: State<'_, ClipboardState>,
    db: State<'_, DatabaseState>,
) -> Option<ClipboardItem> {
    let item = state.0.add(content.to_string());
    if let Some(ref item) = item {
        if let Err(e) = db.0.save_clipboard_item(item) {
            log::error!("Failed to persist clipboard item: {}", e);
        }
    }
    item
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
pub fn delete_clipboard_item(
    id: &str,
    state: State<'_, ClipboardState>,
    db: State<'_, DatabaseState>,
) -> bool {
    let deleted = state.0.delete(id);
    if deleted {
        if let Err(e) = db.0.delete_clipboard_item(id) {
            log::error!("Failed to delete clipboard item from database: {}", e);
        }
    }
    deleted
}

#[tauri::command]
pub fn clear_clipboard_history(
    state: State<'_, ClipboardState>,
    db: State<'_, DatabaseState>,
) {
    state.0.clear();
    if let Err(e) = db.0.clear_clipboard_history() {
        log::error!("Failed to clear clipboard history in database: {}", e);
    }
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

/// Write text to system clipboard, marking it so the monitor skips it
#[tauri::command]
pub fn write_system_clipboard(text: &str, state: State<'_, ClipboardState>) -> Result<(), String> {
    state.0.set_skip(text);
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;
    clipboard.set_text(text)
        .map_err(|e| format!("Failed to write clipboard: {}", e))
}

/// Write an image file to the system clipboard
#[tauri::command]
pub fn write_image_to_clipboard(image_path: &str, state: State<'_, ClipboardState>) -> Result<(), String> {
    use image::GenericImageView;

    let img = image::open(image_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    let rgba = img.to_rgba8();
    let (width, height) = img.dimensions();

    let img_data = arboard::ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
    };

    // Mark skip so monitor doesn't recapture
    state.0.set_skip(&format!("__image_{}x{}", width, height));

    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;
    clipboard.set_image(img_data)
        .map_err(|e| format!("Failed to write image to clipboard: {}", e))
}
