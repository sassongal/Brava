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
