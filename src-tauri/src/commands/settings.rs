use crate::storage::settings::AppSettings;
use crate::{DatabaseState, CaffeineState, KeyboardLockState};
use tauri::State;
use std::sync::Mutex;

pub struct SettingsState(pub Mutex<AppSettings>);

#[tauri::command]
pub fn get_settings(state: State<'_, SettingsState>) -> AppSettings {
    state.0.lock().unwrap().clone()
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
    let settings = state.0.lock().unwrap();
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
        inner.active = false;
        Ok(false)
    } else {
        // Enable caffeine based on platform
        let child = if cfg!(target_os = "macos") {
            std::process::Command::new("caffeinate")
                .arg("-di") // prevent display sleep and idle sleep
                .spawn()
                .map_err(|e| format!("Failed to start caffeinate: {}", e))?
        } else if cfg!(target_os = "linux") {
            std::process::Command::new("systemd-inhibit")
                .args(["--what=idle:sleep", "--who=Brava", "--why=Caffeine mode", "sleep", "infinity"])
                .spawn()
                .map_err(|e| format!("Failed to start systemd-inhibit: {}", e))?
        } else {
            return Err("Caffeine mode not yet supported on this platform".to_string());
        };
        inner.process = Some(child);
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
    let mut locked = state.locked.lock().unwrap();
    *locked = !*locked;
    *locked
}

#[tauri::command]
pub fn get_keyboard_lock_status(state: State<'_, KeyboardLockState>) -> bool {
    *state.locked.lock().unwrap()
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
    // Use macOS ApplicationServices API to check Accessibility trust
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
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
    // Persist to DB so import survives restart
    new_settings.save(&db.0)?;
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    *current = new_settings;
    Ok(())
}
