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

    // Step 1: Save current clipboard to detect change
    let old_text = clipboard.get_text().unwrap_or_default();

    // Mark that we're about to use the clipboard — monitor should skip
    clipboard_state.0.set_skip("__brava_converting__");

    // Step 2: Simulate Cmd+C
    simulate_copy();

    // Step 3: Poll clipboard for up to 500ms waiting for it to change
    let mut text = old_text.clone();
    let start = std::time::Instant::now();
    while start.elapsed() < std::time::Duration::from_millis(500) {
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Ok(current) = clipboard.get_text() {
            if current != old_text && !current.trim().is_empty() {
                text = current;
                break;
            }
        }
    }

    if text == old_text || text.trim().is_empty() {
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
        #[cfg(target_os = "windows")]
        {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
            unsafe {
                let mut inputs: [INPUT; 4] = std::mem::zeroed();
                inputs[0].r#type = INPUT_KEYBOARD;
                inputs[0].Anonymous.ki.wVk = VK_CONTROL;
                inputs[1].r#type = INPUT_KEYBOARD;
                inputs[1].Anonymous.ki.wVk = 0x43; // 'C'
                inputs[2].r#type = INPUT_KEYBOARD;
                inputs[2].Anonymous.ki.wVk = 0x43;
                inputs[2].Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;
                inputs[3].r#type = INPUT_KEYBOARD;
                inputs[3].Anonymous.ki.wVk = VK_CONTROL;
                inputs[3].Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;
                SendInput(4, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
            }
        }
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
        #[cfg(target_os = "windows")]
        {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
            unsafe {
                let mut inputs: [INPUT; 4] = std::mem::zeroed();
                inputs[0].r#type = INPUT_KEYBOARD;
                inputs[0].Anonymous.ki.wVk = VK_CONTROL;
                inputs[1].r#type = INPUT_KEYBOARD;
                inputs[1].Anonymous.ki.wVk = 0x56; // 'V'
                inputs[2].r#type = INPUT_KEYBOARD;
                inputs[2].Anonymous.ki.wVk = 0x56;
                inputs[2].Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;
                inputs[3].r#type = INPUT_KEYBOARD;
                inputs[3].Anonymous.ki.wVk = VK_CONTROL;
                inputs[3].Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;
                SendInput(4, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
            }
        }
    }
}

/// Expose paste simulation as a Tauri command so the popup window can trigger it.
#[tauri::command]
pub fn simulate_paste_action() {
    simulate_paste();
}

/// Get the current OS keyboard input source name (e.g. "U.S.", "Hebrew", "Arabic")
#[tauri::command]
pub fn get_current_keyboard_layout() -> String {
    crate::get_active_keyboard_id()
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
    if trimmed.chars().count() < 5 || trimmed.chars().count() > 200 {
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
        && !crate::looks_like_real_english(trimmed)
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
