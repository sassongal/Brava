use crate::storage::settings::AppSettings;
use crate::{DatabaseState, CaffeineState, KeyboardLockState};
use tauri::State;
use std::sync::Mutex;

pub struct SettingsState(pub Mutex<AppSettings>);

#[tauri::command]
pub fn get_settings(state: State<'_, SettingsState>) -> AppSettings {
    state.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub fn update_settings(settings: AppSettings, state: State<'_, SettingsState>) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    *current = settings;
    Ok(())
}

#[tauri::command]
pub fn save_settings_to_db(
    state: State<'_, SettingsState>,
    db: State<'_, DatabaseState>,
) -> Result<(), String> {
    let settings = state.0.lock().map_err(|e| e.to_string())?;
    settings.save(&db.0)
}

#[tauri::command]
pub fn get_setting_value(key: &str, state: State<'_, SettingsState>) -> Option<String> {
    let settings = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let json = serde_json::to_value(&*settings).ok()?;
    json.get(key).map(|v| v.to_string().trim_matches('"').to_string())
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "Brava",
        "version": env!("CARGO_PKG_VERSION"),
        "description": env!("CARGO_PKG_DESCRIPTION"),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

// --- Caffeine Mode ---

#[tauri::command]
pub fn toggle_caffeine(state: State<'_, CaffeineState>) -> Result<bool, String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;

    if inner.active {
        // Disable caffeine
        if let Some(mut child) = inner.process.take() {
            let _ = child.kill();
        }
        // Windows: reset execution state
        #[cfg(target_os = "windows")]
        {
            use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS};
            unsafe { SetThreadExecutionState(ES_CONTINUOUS); }
        }
        inner.active = false;
        Ok(false)
    } else {
        // Enable caffeine based on platform
        if cfg!(target_os = "macos") {
            let child = std::process::Command::new("caffeinate")
                .arg("-di")
                .spawn()
                .map_err(|e| format!("Failed to start caffeinate: {}", e))?;
            inner.process = Some(child);
        } else if cfg!(target_os = "linux") {
            let child = std::process::Command::new("systemd-inhibit")
                .args(["--what=idle:sleep", "--who=Brava", "--why=Caffeine mode", "sleep", "infinity"])
                .spawn()
                .map_err(|e| format!("Failed to start systemd-inhibit: {}", e))?;
            inner.process = Some(child);
        } else if cfg!(target_os = "windows") {
            #[cfg(target_os = "windows")]
            {
                use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED, ES_DISPLAY_REQUIRED};
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
                }
            }
        } else {
            return Err("Caffeine mode not yet supported on this platform".to_string());
        }
        inner.active = true;
        Ok(true)
    }
}

#[tauri::command]
pub fn get_caffeine_status(state: State<'_, CaffeineState>) -> bool {
    state.inner.lock().map(|inner| inner.active).unwrap_or(false)
}

// --- Keyboard Lock ---

#[tauri::command]
pub fn toggle_keyboard_lock(state: State<'_, KeyboardLockState>) -> bool {
    let mut locked = state.locked.lock().unwrap_or_else(|e| e.into_inner());
    *locked = !*locked;
    *locked
}

#[tauri::command]
pub fn get_keyboard_lock_status(state: State<'_, KeyboardLockState>) -> bool {
    *state.locked.lock().unwrap_or_else(|e| e.into_inner())
}

// --- Permission Status ---

#[tauri::command]
pub fn check_permissions() -> serde_json::Value {
    let accessibility = check_accessibility_permission();

    serde_json::json!({
        "accessibility": accessibility,
    })
}

#[cfg(target_os = "macos")]
fn check_accessibility_permission() -> bool {
    extern "C" {
        fn AXIsProcessTrusted() -> u8;
    }
    unsafe { AXIsProcessTrusted() != 0 }
}

#[cfg(not(target_os = "macos"))]
fn check_accessibility_permission() -> bool {
    // On non-macOS, assume granted (no equivalent permission model)
    true
}

// --- Export / Import ---

#[tauri::command]
pub fn export_settings(state: State<'_, SettingsState>) -> Result<String, String> {
    let settings = state.0.lock().map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&*settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))
}

#[tauri::command]
pub fn import_settings(
    json: &str,
    state: State<'_, SettingsState>,
    db: State<'_, DatabaseState>,
) -> Result<(), String> {
    let new_settings: AppSettings = serde_json::from_str(json)
        .map_err(|e| format!("Invalid settings JSON: {}", e))?;
    // Validate critical fields
    if !new_settings.ollama_endpoint.starts_with("http://localhost")
        && !new_settings.ollama_endpoint.starts_with("http://127.0.0.1")
    {
        return Err("Invalid ollama_endpoint: must be localhost".to_string());
    }
    if new_settings.max_clipboard_items < 10 || new_settings.max_clipboard_items > 1000 {
        return Err("max_clipboard_items must be between 10 and 1000".to_string());
    }
    // Persist to DB so import survives restart
    new_settings.save(&db.0)?;
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    *current = new_settings;
    Ok(())
}
