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
use commands::transcription::TranscriptionQueueState;
use engine::clipboard::ClipboardManager;
use engine::detector::WrongLayoutDetector;
use engine::layout::LayoutEngine;
use engine::snippets::SnippetEngine;
use serde::Serialize;
use storage::database::Database;
use storage::settings::AppSettings;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::path::PathBuf;
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

pub struct SessionMarkerState {
    pub path: PathBuf,
}

impl Drop for SessionMarkerState {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Initialize database in the app data directory
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            let db = Arc::new(
                Database::open(&app_data_dir)
                    .expect("Failed to open database")
            );
            if let Err(e) = db.mark_stale_processing_jobs_failed() {
                log::warn!("Failed to recover stale transcription jobs: {}", e);
            }

            // Load settings from database
            let mut settings = AppSettings::load(&db);
            let session_marker = app_data_dir.join("session-active.lock");
            let mut crash_streak = db
                .get_setting("global_detector_crash_streak")
                .ok()
                .flatten()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);
            if session_marker.exists() {
                crash_streak = crash_streak.saturating_add(1);
            } else {
                crash_streak = 0;
            }
            let _ = std::fs::write(&session_marker, chrono::Utc::now().to_rfc3339());
            let _ = db.set_setting("global_detector_crash_streak", &crash_streak.to_string());
            if crash_streak >= 2 {
                settings.global_typing_detection = false;
                let _ = settings.save(&db);
                log::warn!("Global typing detection auto-disabled after repeated abnormal exits");
            }

            // Create clipboard manager and load history from database
            let clipboard_manager = Arc::new(ClipboardManager::new(settings.max_clipboard_items));
            clipboard_manager.set_limits(settings.max_clipboard_items, settings.clipboard_preview_length);
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
            app.manage(SettingsState(Mutex::new(settings.clone())));
            app.manage(TranscriptionQueueState::default());
            app.manage(CaffeineState {
                inner: Mutex::new(CaffeineInner { active: false, process: None }),
            });
            app.manage(KeyboardLockState {
                locked: Mutex::new(false),
            });
            app.manage(SessionMarkerState {
                path: session_marker,
            });

            // Setup system tray
            setup_tray(app)?;
            if settings.start_minimized_to_tray {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Create hotkey manager and load saved bindings
            let mut hotkey_manager = engine::hotkeys::HotkeyManager::new();
            if let Ok(Some(bindings_json)) = db.get_setting("hotkey_bindings") {
                if let Ok(bindings) = serde_json::from_str::<Vec<(engine::hotkeys::HotkeyAction, engine::hotkeys::Hotkey)>>(&bindings_json) {
                    hotkey_manager.load_bindings(bindings);
                }
            }

            // Register all shortcuts
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
                use std::collections::HashSet;

                let mut seen_shortcuts = HashSet::new();

                for (action, hotkey) in hotkey_manager.get_all_bindings() {
                    let shortcut_str = hotkey.to_shortcut_string();
                    if !seen_shortcuts.insert(shortcut_str.clone()) {
                        log::warn!(
                            "Skipping duplicate hotkey '{}' for action '{}'",
                            shortcut_str,
                            action.display_name()
                        );
                        continue;
                    }
                    if let Ok(shortcut) = shortcut_str.parse::<Shortcut>() {
                        let handle = app.handle().clone();
                        let event = action.to_event_name().to_string();
                        if let Err(e) = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, e| {
                            if e.state == ShortcutState::Pressed {
                                let _ = handle.emit(&event, ());
                            }
                        }) {
                            log::warn!(
                                "Failed to register hotkey '{}' for action '{}': {}",
                                shortcut_str,
                                action.display_name(),
                                e
                            );
                        }
                    }
                }
            }

            app.manage(commands::hotkeys::HotkeyState(Mutex::new(hotkey_manager)));

            // Start background clipboard monitoring
            let app_handle = app.handle().clone();
            let monitor_clipboard = clipboard_manager.clone();
            let monitor_db = db.clone();
            std::thread::spawn(move || {
                clipboard_monitor(app_handle, monitor_clipboard, monitor_db);
            });

            #[cfg(not(target_os = "macos"))]
            {
                if settings.global_typing_detection {
                    let app_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        global_key_monitor(app_handle);
                    });
                }
            }
            #[cfg(target_os = "macos")]
            {
                log::warn!("Global key monitor is temporarily disabled on macOS due to event-tap queue crash risk");
            }

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
            commands::layout::detect_wrong_layout_alert,
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
            commands::clipboard::write_image_to_clipboard,
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
            commands::ai::ai_fix_grammar,
            commands::ai::set_ai_provider,
            commands::ai::set_api_key,
            commands::ai::get_ai_models,
            commands::ai::get_ai_providers,
            commands::ai::check_api_key_health,
            commands::ai::ai_complete_stream,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_setting_value,
            commands::settings::get_app_version,
            commands::settings::get_app_info,
            commands::settings::save_settings_to_db,
            commands::settings::export_settings,
            commands::settings::import_settings,
            commands::settings::create_full_backup,
            commands::settings::restore_full_backup,
            // Utility commands
            commands::settings::toggle_caffeine,
            commands::settings::get_caffeine_status,
            commands::settings::toggle_keyboard_lock,
            commands::settings::get_keyboard_lock_status,
            commands::settings::check_permissions,
            // Hotkey commands
            commands::hotkeys::get_hotkey_bindings,
            commands::hotkeys::update_hotkey,
            commands::hotkeys::reset_hotkey_defaults,
            // Screenshot commands
            commands::screenshot::capture_full_screen,
            commands::screenshot::open_screenshot_editor,
            commands::screenshot::save_screenshot_region,
            commands::screenshot::cancel_screenshot,
            commands::screenshot::copy_screenshot_to_clipboard,
            // Transcription commands
            commands::transcription::transcribe_media,
            commands::transcription::enqueue_transcription,
            commands::transcription::enqueue_transcription_blob,
            commands::transcription::list_transcriptions,
            // Prompt library commands
            commands::prompts::get_saved_prompts,
            commands::prompts::save_prompt,
            commands::prompts::delete_saved_prompt,
            commands::prompts::use_saved_prompt,
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
    use tauri::Manager;
    use tauri::Emitter;

    let mut clipboard = match arboard::Clipboard::new() {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to initialize clipboard monitor: {}", e);
            // On Linux/Wayland, suggest installing wl-clipboard
            if cfg!(target_os = "linux") {
                let _ = app.emit("toast", "Clipboard not available. On Wayland, install wl-clipboard package.");
            }
            return;
        }
    };

    let mut last_content = clipboard.get_text().unwrap_or_default();
    let mut last_prune = std::time::Instant::now();
    let mut layout_detector = WrongLayoutDetector::new();
    let layout_engine = LayoutEngine::new();
    let mut last_wrong_layout_alert = Instant::now()
        .checked_sub(Duration::from_secs(30))
        .unwrap_or_else(Instant::now);

    loop {
        std::thread::sleep(Duration::from_millis(500));

        let current = match clipboard.get_text() {
            Ok(text) => text,
            Err(_) => continue,
        };

        if current.is_empty() || current == last_content {
            continue;
        }

        // Skip content larger than 1MB
        if current.len() > 1_048_576 {
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

            if should_analyze_wrong_layout(&item.content) {
                layout_detector.clear();
                for ch in item.content.chars().take(120) {
                    layout_detector.push_char(ch);
                }
                if layout_detector.analyze().is_some()
                    && last_wrong_layout_alert.elapsed() >= Duration::from_secs(8)
                {
                    if let Ok(converted) = layout_engine.auto_convert(&item.content) {
                        if converted.converted != item.content {
                            let detected = layout_engine.detect_layout(&item.content);
                            let converted_detected = layout_engine.detect_layout(&converted.converted);
                            let strong_signal = (detected.detected_code == "en"
                                && converted_detected.detected_code != "en"
                                && converted_detected.confidence >= 0.70)
                                || (detected.detected_code != "en"
                                    && converted_detected.detected_code == "en"
                                    && converted_detected.confidence >= 0.70);
                            if strong_signal {
                                let event = WrongLayoutDetectedEvent {
                                    wrong_text: item.content.clone(),
                                    suggested_text: converted.converted,
                                    source_layout: converted.source_layout,
                                    target_layout: converted.target_layout,
                                    confidence: converted_detected.confidence.max(detected.confidence),
                                };
                                let _ = app.emit("wrong-layout-detected", event);
                                last_wrong_layout_alert = Instant::now();
                            }
                        }
                    }
                }
            }
        }

        if last_prune.elapsed() >= Duration::from_secs(1800) {
            if let Some(settings_state) = app.try_state::<SettingsState>() {
                if let Ok(settings) = settings_state.0.lock() {
                    if let Some(days) = settings.clipboard_retention_days {
                        if days > 0 {
                            let _ = db.delete_clipboard_older_than_days(days);
                            let _ = manager.remove_older_than_days(days);
                        }
                    }
                }
            }
            last_prune = std::time::Instant::now();
        }
    }
}

#[derive(Clone, Serialize)]
struct WrongLayoutDetectedEvent {
    wrong_text: String,
    suggested_text: String,
    source_layout: String,
    target_layout: String,
    confidence: f64,
}

fn should_analyze_wrong_layout(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.len() < 4 || trimmed.len() > 200 {
        return false;
    }
    let lower = trimmed.to_lowercase();
    let blacklist = [
        "http://", "https://", "www.", "@", ".com", ".io", ".dev", ".org", "npm ", "cargo ", "git ",
    ];
    if blacklist.iter().any(|token| lower.contains(token)) {
        return false;
    }
    true
}

#[cfg(not(target_os = "macos"))]
fn global_key_monitor(app: tauri::AppHandle) {
    use rdev::{listen, EventType, Key};
    use tauri::Emitter;

    let mut detector = WrongLayoutDetector::new();
    let engine = LayoutEngine::new();
    let mut last_alert = Instant::now()
        .checked_sub(Duration::from_secs(30))
        .unwrap_or_else(Instant::now);

    let callback = move |event: rdev::Event| {
        let realtime_enabled = app
            .try_state::<SettingsState>()
            .and_then(|s| s.0.lock().ok().map(|st| st.realtime_detection))
            .unwrap_or(false);
        if !realtime_enabled {
            return;
        }

        match event.event_type {
            EventType::KeyPress(Key::Backspace) => detector.pop_char(),
            EventType::KeyPress(Key::Return)
            | EventType::KeyPress(Key::Space) => detector.push_char(' '),
            EventType::KeyPress(_) => {
                if let Some(name) = event.name {
                    let mut chars = name.chars();
                    if let Some(ch) = chars.next() {
                        if chars.next().is_none() {
                            detector.push_char(ch);
                        }
                    }
                }
            }
            _ => {}
        }

        let snapshot = detector.get_buffer().trim().to_string();
        if !should_analyze_wrong_layout(&snapshot) {
            return;
        }
        if last_alert.elapsed() < Duration::from_secs(8) {
            return;
        }

        if detector.analyze().is_some() {
            if let Ok(converted) = engine.auto_convert(&snapshot) {
                if converted.converted != snapshot {
                    let detected = engine.detect_layout(&snapshot);
                    let converted_detected = engine.detect_layout(&converted.converted);
                    let strong_signal = (detected.detected_code == "en"
                        && converted_detected.detected_code != "en"
                        && converted_detected.confidence >= 0.70)
                        || (detected.detected_code != "en"
                            && converted_detected.detected_code == "en"
                            && converted_detected.confidence >= 0.70);
                    if strong_signal {
                        let event = WrongLayoutDetectedEvent {
                            wrong_text: snapshot.clone(),
                            suggested_text: converted.converted,
                            source_layout: converted.source_layout,
                            target_layout: converted.target_layout,
                            confidence: converted_detected.confidence.max(detected.confidence),
                        };
                        let _ = app.emit("wrong-layout-detected", event);
                        last_alert = Instant::now();
                        detector.clear();
                    }
                }
            }
        }
    };

    if let Err(err) = listen(callback) {
        log::warn!("Global key monitor failed to start: {:?}", err);
    }
}
