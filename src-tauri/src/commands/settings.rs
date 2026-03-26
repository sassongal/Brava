use crate::storage::settings::AppSettings;
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
