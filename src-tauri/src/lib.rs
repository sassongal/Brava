mod ai;
mod commands;
mod engine;
mod layouts;
mod storage;

use commands::ai::AIState;
use commands::clipboard::ClipboardState;
use commands::layout::LayoutState;
use commands::settings::SettingsState;
use commands::snippets::SnippetState;
use engine::clipboard::ClipboardManager;
use engine::layout::LayoutEngine;
use engine::snippets::SnippetEngine;
use storage::database::Database;
use storage::settings::AppSettings;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;

/// Shared database state accessible from commands and background tasks
pub struct DatabaseState(pub Arc<Database>);

/// Caffeine mode state — single mutex to avoid lock-ordering issues
pub struct CaffeineState {
    pub inner: Mutex<CaffeineInner>,
}

pub struct CaffeineInner {
    pub active: bool,
    pub process: Option<std::process::Child>,
}

impl Drop for CaffeineInner {
    fn drop(&mut self) {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
        }
    }
}

/// Keyboard lock state
pub struct KeyboardLockState {
    pub locked: Mutex<bool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Initialize database in the app data directory
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            let db = Arc::new(
                Database::open(&app_data_dir)
                    .expect("Failed to open database")
            );

            // Load settings from database
            let settings = AppSettings::load(&db);

            // Create clipboard manager and load history from database
            let clipboard_manager = Arc::new(ClipboardManager::new(settings.max_clipboard_items));
            if let Ok(stored_items) = db.load_clipboard_history(settings.max_clipboard_items) {
                if !stored_items.is_empty() {
                    log::info!("Loaded {} clipboard items from database", stored_items.len());
                    clipboard_manager.load(stored_items);
                }
            }

            // Create AI state and load API keys from OS keyring
            let ai_state = AIState::new();
            load_api_keys_from_keyring(&ai_state);

            // Set active provider from settings
            if let Ok(mut active) = ai_state.active_provider.lock() {
                *active = settings.ai_provider.clone();
            }

            // Register state
            app.manage(DatabaseState(db.clone()));
            app.manage(LayoutState(Mutex::new(LayoutEngine::new())));
            app.manage(ClipboardState(clipboard_manager.clone()));
            // Create snippet engine and load snippets from database
            let mut snippet_engine = SnippetEngine::new();
            if let Ok(stored_snippets) = db.load_snippets() {
                if !stored_snippets.is_empty() {
                    log::info!("Loaded {} snippets from database", stored_snippets.len());
                    snippet_engine.load(stored_snippets);
                }
            }
            app.manage(SnippetState(Mutex::new(snippet_engine)));
            app.manage(ai_state);
            app.manage(SettingsState(Mutex::new(settings)));
            app.manage(CaffeineState {
                inner: Mutex::new(CaffeineInner { active: false, process: None }),
            });
            app.manage(KeyboardLockState {
                locked: Mutex::new(false),
            });

            // Setup system tray
            setup_tray(app)?;

            // Register global shortcuts
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

                let shortcuts: Vec<(&str, &str)> = vec![
                    ("CmdOrCtrl+Shift+T", "hotkey-convert"),
                    ("CmdOrCtrl+Shift+V", "hotkey-clipboard"),
                    ("CmdOrCtrl+Shift+P", "hotkey-enhance"),
                    ("CmdOrCtrl+Shift+L", "hotkey-translate"),
                ];

                for (shortcut_str, event_name) in shortcuts {
                    let shortcut: Shortcut = shortcut_str.parse().expect(&format!("Invalid shortcut: {}", shortcut_str));
                    let handle = app.handle().clone();
                    let event = event_name.to_string();
                    app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, e| {
                        if e.state == ShortcutState::Pressed {
                            let _ = handle.emit(&event, ());
                        }
                    })?;
                }
            }

            // Start background clipboard monitoring
            let app_handle = app.handle().clone();
            let monitor_clipboard = clipboard_manager.clone();
            let monitor_db = db.clone();
            std::thread::spawn(move || {
                clipboard_monitor(app_handle, monitor_clipboard, monitor_db);
            });

            Ok(())
        })
        // Register all IPC command handlers
        .invoke_handler(tauri::generate_handler![
            // Layout commands
            commands::layout::convert_text,
            commands::layout::auto_convert,
            commands::layout::detect_layout,
            commands::layout::get_layouts,
            commands::layout::convert_clipboard_text,
            // Clipboard commands
            commands::clipboard::get_clipboard_items,
            commands::clipboard::add_clipboard_item,
            commands::clipboard::toggle_clipboard_pin,
            commands::clipboard::toggle_clipboard_favorite,
            commands::clipboard::delete_clipboard_item,
            commands::clipboard::clear_clipboard_history,
            commands::clipboard::get_clipboard_count,
            commands::clipboard::read_system_clipboard,
            commands::clipboard::write_system_clipboard,
            // Snippet commands
            commands::snippets::get_snippets,
            commands::snippets::add_snippet,
            commands::snippets::update_snippet,
            commands::snippets::delete_snippet,
            commands::snippets::match_snippet_buffer,
            commands::snippets::expand_snippet_variables,
            // AI commands
            commands::ai::ai_complete,
            commands::ai::ai_enhance_prompt,
            commands::ai::ai_translate,
            commands::ai::set_ai_provider,
            commands::ai::set_api_key,
            commands::ai::get_ai_models,
            commands::ai::get_ai_providers,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_setting_value,
            commands::settings::get_app_version,
            commands::settings::get_app_info,
            commands::settings::save_settings_to_db,
            commands::settings::export_settings,
            commands::settings::import_settings,
            // Utility commands
            commands::settings::toggle_caffeine,
            commands::settings::get_caffeine_status,
            commands::settings::toggle_keyboard_lock,
            commands::settings::get_keyboard_lock_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Brava");
}

/// Setup the system tray with menu items
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("show", "Show Brava").build(app)?;
    let clipboard_item = MenuItemBuilder::with_id("clipboard", "Clipboard History").build(app)?;
    let convert_item = MenuItemBuilder::with_id("convert", "Convert Selection").build(app)?;
    let caffeine_item = MenuItemBuilder::with_id("caffeine", "Caffeine Mode").build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Brava").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&clipboard_item)
        .item(&convert_item)
        .separator()
        .item(&caffeine_item)
        .separator()
        .item(&settings_item)
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Brava - Smart Productivity Toolkit")
        .on_menu_event(move |app, event| {
            use tauri::Emitter;

            let show_and_navigate = |tab: &str| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("navigate-tab", tab);
            };

            match event.id().as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "clipboard" => show_and_navigate("clipboard"),
                "convert" => show_and_navigate("converter"),
                "caffeine" => { let _ = app.emit("toggle-caffeine", ()); }
                "settings" => show_and_navigate("settings"),
                "quit" => { app.exit(0); }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Load API keys from OS keyring into AI providers on startup
fn load_api_keys_from_keyring(ai_state: &AIState) {
    let providers = ["gemini", "openai", "claude", "openrouter"];
    for provider in providers {
        match keyring::Entry::new("brava", &format!("api_key_{}", provider)) {
            Ok(entry) => {
                if let Ok(key) = entry.get_password() {
                    if !key.is_empty() {
                        match provider {
                            "gemini" => { if let Ok(mut p) = ai_state.gemini.lock() { p.set_api_key(key); } }
                            "openai" => { if let Ok(mut p) = ai_state.openai.lock() { p.set_api_key(key); } }
                            "claude" => { if let Ok(mut p) = ai_state.claude.lock() { p.set_api_key(key); } }
                            "openrouter" => { if let Ok(mut p) = ai_state.openrouter.lock() { p.set_api_key(key); } }
                            _ => {}
                        }
                        log::info!("Loaded API key for {} from keyring", provider);
                    }
                }
            }
            Err(e) => {
                log::debug!("No keyring entry for {}: {}", provider, e);
            }
        }
    }
}

/// Background thread that polls the system clipboard every 500ms.
fn clipboard_monitor(
    app: tauri::AppHandle,
    manager: Arc<ClipboardManager>,
    db: Arc<Database>,
) {
    use tauri::Emitter;

    let mut clipboard = match arboard::Clipboard::new() {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to initialize clipboard monitor: {}", e);
            return;
        }
    };

    let mut last_content = clipboard.get_text().unwrap_or_default();

    loop {
        std::thread::sleep(Duration::from_millis(500));

        let current = match clipboard.get_text() {
            Ok(text) => text,
            Err(_) => continue,
        };

        if current.is_empty() || current == last_content {
            continue;
        }

        last_content = current.clone();

        // Skip content we wrote ourselves (from write_system_clipboard)
        if manager.should_skip(&current) {
            continue;
        }

        if let Some(item) = manager.add(current) {
            if let Err(e) = db.save_clipboard_item(&item) {
                log::error!("Failed to persist clipboard item: {}", e);
            }
            let _ = app.emit("clipboard-changed", &item);
        }
    }
}
