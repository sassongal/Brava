use crate::commands::clipboard::ClipboardState;
use crate::engine::layout::{ConversionResult, DetectionResult, LayoutEngine, LayoutInfo};
use serde::Serialize;
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
    let engine = state.0.lock().unwrap_or_else(|e| e.into_inner());
    engine.detect_layout(text)
}

#[tauri::command]
pub fn get_layouts(state: State<'_, LayoutState>) -> Vec<LayoutInfo> {
    let engine = state.0.lock().unwrap_or_else(|e| e.into_inner());
    engine.available_layouts()
}

/// Convert selected text from any app: simulates Cmd+C, converts, writes back, simulates Cmd+V
#[tauri::command]
pub fn convert_clipboard_text(
    state: State<'_, LayoutState>,
    clipboard_state: State<'_, ClipboardState>,
) -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    // Step 1: Mark that we're about to use the clipboard — monitor should skip
    clipboard_state.0.set_skip("__brava_converting__");

    // Simulate Cmd+C to copy selected text
    simulate_copy();
    // Brief pause to let the OS process the copy
    std::thread::sleep(std::time::Duration::from_millis(150));

    // Step 2: Read the clipboard (now contains the selected text)
    let text = clipboard.get_text()
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;

    if text.trim().is_empty() {
        return Err("No text selected. Select text first, then press the hotkey.".to_string());
    }

    // Step 3: Convert
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    let result = engine.auto_convert(&text)?;

    if result.converted == text {
        return Err("Text is already in the correct layout".to_string());
    }

    // Step 4: Write converted text to clipboard
    clipboard_state.0.set_skip(&result.converted);
    clipboard.set_text(&result.converted)
        .map_err(|e| format!("Failed to write clipboard: {}", e))?;

    // Step 5: Simulate Cmd+V to paste the converted text
    std::thread::sleep(std::time::Duration::from_millis(50));
    simulate_paste();

    Ok(result.converted)
}

/// Simulate Cmd+C (copy) using platform-specific methods
fn simulate_copy() {
    if cfg!(target_os = "macos") {
        let _ = std::process::Command::new("osascript")
            .args(["-e", r#"tell application "System Events" to keystroke "c" using command down"#])
            .output();
    } else if cfg!(target_os = "linux") {
        let _ = std::process::Command::new("xdotool")
            .args(["key", "ctrl+c"])
            .output();
    } else if cfg!(target_os = "windows") {
        // On Windows, use PowerShell to send Ctrl+C
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", r#"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^c")"#])
            .output();
    }
}

/// Simulate Cmd+V (paste) using platform-specific methods
fn simulate_paste() {
    if cfg!(target_os = "macos") {
        let _ = std::process::Command::new("osascript")
            .args(["-e", r#"tell application "System Events" to keystroke "v" using command down"#])
            .output();
    } else if cfg!(target_os = "linux") {
        let _ = std::process::Command::new("xdotool")
            .args(["key", "ctrl+v"])
            .output();
    } else if cfg!(target_os = "windows") {
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", r#"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")"#])
            .output();
    }
}

/// Expose paste simulation as a Tauri command so the popup window can trigger it.
#[tauri::command]
pub fn simulate_paste_action() {
    simulate_paste();
}

#[derive(Serialize)]
pub struct WrongLayoutAlert {
    pub wrong_text: String,
    pub suggested_text: String,
    pub source_layout: String,
    pub target_layout: String,
    pub confidence: f64,
}

#[tauri::command]
pub fn detect_wrong_layout_alert(
    text: &str,
    state: State<'_, LayoutState>,
) -> Option<WrongLayoutAlert> {
    let trimmed = text.trim();
    if trimmed.chars().count() < 6 || trimmed.chars().count() > 200 {
        return None;
    }

    let engine = state.0.lock().ok()?;
    let detected = engine.detect_layout(trimmed);
    let converted = engine.auto_convert(trimmed).ok()?;
    if converted.converted == trimmed {
        return None;
    }
    let converted_detected = engine.detect_layout(&converted.converted);

    // Primary wrong-layout heuristics:
    // 1) English-looking text converts into a high-confidence non-English script.
    // 2) Non-English text converts into a high-confidence English script.
    let looks_like_wrong_english = detected.detected_code == "en"
        && detected.confidence >= 0.75
        && converted_detected.detected_code != "en"
        && converted_detected.confidence >= 0.70;
    let looks_like_wrong_non_english = detected.detected_code != "en"
        && converted_detected.detected_code == "en"
        && converted_detected.confidence >= 0.70;

    if !(looks_like_wrong_english || looks_like_wrong_non_english) {
        return None;
    }

    Some(WrongLayoutAlert {
        wrong_text: trimmed.to_string(),
        suggested_text: converted.converted,
        source_layout: converted.source_layout,
        target_layout: converted.target_layout,
        confidence: converted_detected.confidence.max(detected.confidence),
    })
}
