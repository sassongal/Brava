use crate::engine::hotkeys::{Hotkey, HotkeyAction, HotkeyManager};
use crate::DatabaseState;
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

pub struct HotkeyState(pub Mutex<HotkeyManager>);

#[derive(Serialize)]
pub struct HotkeyBindingInfo {
    pub action: String,
    pub action_display: String,
    pub event_name: String,
    pub key: String,
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub meta: bool,
    pub display_string: String,
}

#[tauri::command]
pub fn get_hotkey_bindings(state: State<'_, HotkeyState>) -> Vec<HotkeyBindingInfo> {
    let manager = state.0.lock().unwrap_or_else(|e| e.into_inner());
    manager.get_all_bindings()
        .into_iter()
        .map(|(action, hotkey)| HotkeyBindingInfo {
            action: serde_json::to_string(&action).unwrap_or_default().trim_matches('"').to_string(),
            action_display: action.display_name().to_string(),
            event_name: action.to_event_name().to_string(),
            key: hotkey.key.clone(),
            ctrl: hotkey.ctrl,
            shift: hotkey.shift,
            alt: hotkey.alt,
            meta: hotkey.meta,
            display_string: hotkey.display_string(),
        })
        .collect()
}

#[tauri::command]
pub fn update_hotkey(
    action: &str,
    key: &str,
    ctrl: bool,
    shift: bool,
    alt: bool,
    meta: bool,
    state: State<'_, HotkeyState>,
    db: State<'_, DatabaseState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
    use tauri::Emitter;

    let new_hotkey = Hotkey::new(key, ctrl, shift, alt, meta);
    let action_enum: HotkeyAction = serde_json::from_str(&format!("\"{}\"", action))
        .map_err(|e| format!("Invalid action: {}", e))?;

    let mut manager = state.0.lock().map_err(|e| e.to_string())?;

    // Check for conflicts
    for (existing_action, existing_hotkey) in manager.get_all_bindings() {
        if existing_action != action_enum
            && existing_hotkey.key == new_hotkey.key
            && existing_hotkey.shift == new_hotkey.shift
            && existing_hotkey.alt == new_hotkey.alt
            && (existing_hotkey.ctrl || existing_hotkey.meta) == (new_hotkey.ctrl || new_hotkey.meta) {
            return Err(format!("Shortcut already used by: {}", existing_action.display_name()));
        }
    }

    // Unregister old shortcut
    if let Some(old_hotkey) = manager.get_binding(&action_enum) {
        let old_str = old_hotkey.to_shortcut_string();
        if let Ok(old_shortcut) = old_str.parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(old_shortcut);
        }
    }

    // Register new shortcut
    let new_str = new_hotkey.to_shortcut_string();
    let shortcut: Shortcut = new_str.parse()
        .map_err(|_| format!("Invalid shortcut: {}", new_str))?;
    let handle = app.clone();
    let event = action_enum.to_event_name().to_string();
    app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, e| {
        if e.state == ShortcutState::Pressed {
            let _ = handle.emit(&event, ());
        }
    }).map_err(|e| format!("Failed to register shortcut: {}", e))?;

    // Update manager
    manager.set_binding(action_enum, new_hotkey);

    // Persist to DB
    let bindings_json = serde_json::to_string(&manager.get_all_bindings())
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    db.0.set_setting("hotkey_bindings", &bindings_json)
        .map_err(|e| format!("Failed to save: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn reset_hotkey_defaults(
    state: State<'_, HotkeyState>,
    db: State<'_, DatabaseState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
    use tauri::Emitter;

    let mut manager = state.0.lock().map_err(|e| e.to_string())?;

    // Unregister all current shortcuts
    for (_action, hotkey) in manager.get_all_bindings() {
        if let Ok(shortcut) = hotkey.to_shortcut_string().parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(shortcut);
        }
    }

    // Reset to defaults
    *manager = HotkeyManager::new();

    // Register all defaults
    for (action, hotkey) in manager.get_all_bindings() {
        let shortcut_str = hotkey.to_shortcut_string();
        if let Ok(shortcut) = shortcut_str.parse::<Shortcut>() {
            let handle = app.clone();
            let event = action.to_event_name().to_string();
            let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, e| {
                if e.state == ShortcutState::Pressed {
                    let _ = handle.emit(&event, ());
                }
            });
        }
    }

    // Persist
    let bindings_json = serde_json::to_string(&manager.get_all_bindings())
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    db.0.set_setting("hotkey_bindings", &bindings_json)
        .map_err(|e| format!("Failed to save: {}", e))?;

    Ok(())
}
