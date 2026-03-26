use crate::engine::layout::{ConversionResult, DetectionResult, LayoutEngine, LayoutInfo};
use tauri::State;
use std::sync::Mutex;

pub struct LayoutState(pub Mutex<LayoutEngine>);

#[tauri::command]
pub fn convert_text(
    text: &str,
    source: Option<&str>,
    target: Option<&str>,
    state: State<'_, LayoutState>,
) -> Result<ConversionResult, String> {
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.convert(text, source, target)
}

#[tauri::command]
pub fn auto_convert(text: &str, state: State<'_, LayoutState>) -> Result<ConversionResult, String> {
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.auto_convert(text)
}

#[tauri::command]
pub fn detect_layout(text: &str, state: State<'_, LayoutState>) -> DetectionResult {
    let engine = state.0.lock().unwrap();
    engine.detect_layout(text)
}

#[tauri::command]
pub fn get_layouts(state: State<'_, LayoutState>) -> Vec<LayoutInfo> {
    let engine = state.0.lock().unwrap();
    engine.available_layouts()
}

/// Convert the current system clipboard content and write back
#[tauri::command]
pub fn convert_clipboard_text(state: State<'_, LayoutState>) -> Result<String, String> {
    // Read current clipboard
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;
    let text = clipboard.get_text()
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;

    if text.trim().is_empty() {
        return Err("Clipboard is empty".to_string());
    }

    // Convert
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    let result = engine.auto_convert(&text)?;

    // Write back to clipboard
    clipboard.set_text(&result.converted)
        .map_err(|e| format!("Failed to write clipboard: {}", e))?;

    Ok(result.converted)
}
