use crate::storage::settings::AppSettings;
use crate::storage::database::BackupData;
use crate::commands::ai::AIState;
use crate::commands::clipboard::ClipboardState;
use crate::commands::snippets::SnippetState;
use crate::{DatabaseState, CaffeineState, KeyboardLockState};
use tauri::State;
use tauri::Manager;
use std::sync::Mutex;
use std::path::{Path, PathBuf};

pub struct SettingsState(pub Mutex<AppSettings>);

#[tauri::command]
pub fn get_settings(state: State<'_, SettingsState>) -> AppSettings {
    state.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub fn update_settings(
    settings: AppSettings,
    state: State<'_, SettingsState>,
    ai_state: State<'_, AIState>,
    clipboard_state: State<'_, ClipboardState>,
) -> Result<(), String> {
    if let Ok(mut provider) = ai_state.active_provider.lock() {
        *provider = settings.ai_provider.clone();
    }
    if let Ok(mut ollama) = ai_state.ollama.lock() {
        ollama.set_endpoint(settings.ollama_endpoint.clone());
    }
    clipboard_state
        .0
        .set_limits(settings.max_clipboard_items, settings.clipboard_preview_length);
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
    let screen_recording = check_screen_recording_permission();

    serde_json::json!({
        "accessibility": accessibility,
        "screen_recording": screen_recording,
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

#[cfg(target_os = "macos")]
fn check_screen_recording_permission() -> bool {
    unsafe extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}

#[cfg(not(target_os = "macos"))]
fn check_screen_recording_permission() -> bool {
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
    let parse_ollama_endpoint = |endpoint: &str| -> Result<(), String> {
        let parsed = reqwest::Url::parse(endpoint)
            .map_err(|_| "Invalid ollama_endpoint URL".to_string())?;
        if parsed.scheme() != "http" {
            return Err("Invalid ollama_endpoint: must use http".to_string());
        }
        match parsed.host_str() {
            Some("localhost") | Some("127.0.0.1") | Some("::1") => Ok(()),
            _ => Err("Invalid ollama_endpoint: must be localhost".to_string()),
        }
    };

    let new_settings: AppSettings = serde_json::from_str(json)
        .map_err(|e| format!("Invalid settings JSON: {}", e))?;
    // Validate critical fields
    parse_ollama_endpoint(&new_settings.ollama_endpoint)?;
    if new_settings.max_clipboard_items < 10 || new_settings.max_clipboard_items > 1000 {
        return Err("max_clipboard_items must be between 10 and 1000".to_string());
    }
    if new_settings.clipboard_preview_length < 20 || new_settings.clipboard_preview_length > 2000 {
        return Err("clipboard_preview_length must be between 20 and 2000".to_string());
    }
    if !(0.8..=1.6).contains(&new_settings.ui_scale) {
        return Err("ui_scale must be between 0.8 and 1.6".to_string());
    }
    // Persist to DB so import survives restart
    new_settings.save(&db.0)?;
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    *current = new_settings;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct FullBackupPayload {
    app_version: String,
    exported_at: String,
    settings: AppSettings,
    data: BackupData,
}

#[tauri::command]
pub fn create_full_backup(
    target_dir: &str,
    state: State<'_, SettingsState>,
    db: State<'_, DatabaseState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let settings = state.0.lock().map_err(|e| e.to_string())?.clone();
    let data = db.0.export_backup_data()?;
    let payload = FullBackupPayload {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        settings,
        data,
    };

    let base = PathBuf::from(target_dir);
    if !base.exists() {
        return Err("Backup target directory does not exist".to_string());
    }

    let backup_dir = base.join(format!("brava-backup-{}", chrono::Utc::now().format("%Y%m%d-%H%M%S")));
    std::fs::create_dir_all(&backup_dir).map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let backup_json = serde_json::to_vec_pretty(&payload)
        .map_err(|e| format!("Failed to serialize backup: {}", e))?;
    std::fs::write(backup_dir.join("backup.json"), backup_json)
        .map_err(|e| format!("Failed to write backup.json: {}", e))?;

    let screenshots_src = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("screenshots");
    let screenshots_dst = backup_dir.join("screenshots");
    if screenshots_src.exists() {
        copy_dir_recursive(&screenshots_src, &screenshots_dst)?;
    }

    Ok(backup_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn restore_full_backup(
    backup_dir: &str,
    settings_state: State<'_, SettingsState>,
    clipboard_state: State<'_, ClipboardState>,
    snippet_state: State<'_, SnippetState>,
    db: State<'_, DatabaseState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let base = PathBuf::from(backup_dir);
    let backup_file = base.join("backup.json");
    if !backup_file.exists() {
        return Err("backup.json not found in selected folder".to_string());
    }

    let raw = std::fs::read(&backup_file).map_err(|e| format!("Failed to read backup.json: {}", e))?;
    let payload: FullBackupPayload = serde_json::from_slice(&raw)
        .map_err(|e| format!("Failed to parse backup.json: {}", e))?;

    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let screenshots_src = base.join("screenshots");
    let screenshots_dst = app_data.join("screenshots");
    let staged_screenshots = app_data.join(format!(
        "screenshots.restore-staging-{}",
        chrono::Utc::now().timestamp_millis()
    ));
    if screenshots_src.exists() {
        if staged_screenshots.exists() {
            let _ = std::fs::remove_dir_all(&staged_screenshots);
        }
        copy_dir_recursive(&screenshots_src, &staged_screenshots)?;
    }

    db.0.import_backup_data(payload.data)?;

    {
        let mut current = settings_state.0.lock().map_err(|e| e.to_string())?;
        *current = payload.settings.clone();
    }

    if let Ok(items) = db.0.load_clipboard_history(payload.settings.max_clipboard_items) {
        clipboard_state.0.load(items);
        clipboard_state
            .0
            .set_limits(payload.settings.max_clipboard_items, payload.settings.clipboard_preview_length);
    }
    if let Ok(snippets) = db.0.load_snippets() {
        if let Ok(mut engine) = snippet_state.0.lock() {
            engine.load(snippets);
        }
    }

    if screenshots_src.exists() {
        if screenshots_dst.exists() {
            let _ = std::fs::remove_dir_all(&screenshots_dst);
        }
        std::fs::rename(&staged_screenshots, &screenshots_dst)
            .map_err(|e| format!("Failed to finalize screenshots restore: {}", e))?;
    }

    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir {}: {}", dst.display(), e))?;
    for entry in std::fs::read_dir(src).map_err(|e| format!("Failed to read dir {}: {}", src.display(), e))? {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if src_path.is_file() {
            std::fs::copy(&src_path, &dst_path).map_err(|e| {
                format!("Failed to copy {} -> {}: {}", src_path.display(), dst_path.display(), e)
            })?;
        }
    }
    Ok(())
}
