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
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use std::path::PathBuf;

static TYPING_MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);
use tauri::Manager;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

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
            if crash_streak >= 3 {
                settings.global_typing_detection = false;
                let _ = settings.save(&db);
                log::warn!("Global typing detection auto-disabled after {} consecutive abnormal exits", crash_streak);
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
            setup_tray(app, &settings)?;
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
            let monitor_app_data_dir = app_data_dir.clone();
            std::thread::spawn(move || {
                clipboard_monitor(app_handle, monitor_clipboard, monitor_db, monitor_app_data_dir);
            });

            #[cfg(not(target_os = "macos"))]
            {
                if settings.global_typing_detection {
                    TYPING_MONITOR_RUNNING.store(true, Ordering::SeqCst);
                    let app_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        global_key_monitor(app_handle);
                        TYPING_MONITOR_RUNNING.store(false, Ordering::SeqCst);
                    });
                }
            }
            #[cfg(target_os = "macos")]
            {
                if settings.global_typing_detection {
                    // Check accessibility permission first
                    let has_access = {
                        extern "C" {
                            fn AXIsProcessTrusted() -> u8;
                        }
                        unsafe { AXIsProcessTrusted() != 0 }
                    };

                    if has_access {
                        TYPING_MONITOR_RUNNING.store(true, Ordering::SeqCst);
                        let app_handle = app.handle().clone();
                        std::thread::spawn(move || {
                            match engine::macos_keys::monitor::start_key_monitor() {
                                Ok(rx) => {
                                    macos_key_consumer(app_handle, rx);
                                }
                                Err(e) => {
                                    log::error!("Failed to start macOS key monitor: {}", e);
                                }
                            }
                            TYPING_MONITOR_RUNNING.store(false, Ordering::SeqCst);
                        });
                    } else {
                        log::warn!(
                            "macOS key monitor requires Accessibility permission (AXIsProcessTrusted)"
                        );
                    }
                }
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
            commands::layout::simulate_paste_action,
            commands::layout::get_current_keyboard_layout,
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
            monitor_cmd::start_global_typing_monitor,
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
fn setup_tray(app: &mut tauri::App, settings: &AppSettings) -> Result<(), Box<dyn std::error::Error>> {
    let is_hebrew = settings.language == "he";

    // Menu items with accelerator hints in labels
    let show = MenuItemBuilder::with_id("show",
        if is_hebrew { "הצג Brava" } else { "Show Brava" }).build(app)?;
    let clipboard = MenuItemBuilder::with_id("clipboard",
        if is_hebrew { "היסטוריית לוח           \u{21E7}\u{2318}V" } else { "Clipboard History       \u{21E7}\u{2318}V" }).build(app)?;
    let convert = MenuItemBuilder::with_id("convert",
        if is_hebrew { "המר בחירה              \u{21E7}\u{2318}T" } else { "Convert Selection        \u{21E7}\u{2318}T" }).build(app)?;
    let enhance = MenuItemBuilder::with_id("enhance",
        if is_hebrew { "שפר פרומפט             \u{21E7}\u{2318}P" } else { "Enhance Prompt         \u{21E7}\u{2318}P" }).build(app)?;
    let translate = MenuItemBuilder::with_id("translate",
        if is_hebrew { "תרגום                   \u{21E7}\u{2318}L" } else { "Translate                  \u{21E7}\u{2318}L" }).build(app)?;
    let screenshot = MenuItemBuilder::with_id("screenshot",
        if is_hebrew { "צילום מסך              \u{21E7}\u{2318}S" } else { "Screenshot               \u{21E7}\u{2318}S" }).build(app)?;
    let search = MenuItemBuilder::with_id("search",
        if is_hebrew { "חיפוש מהיר              \u{2318}K" } else { "Quick Search              \u{2318}K" }).build(app)?;

    // Detection mode
    let detection_label = match settings.wrong_layout_mode.as_str() {
        "autofix" => if is_hebrew { "זיהוי פריסה: תיקון אוטומטי" } else { "Detection: Auto-fix" },
        "popup" => if is_hebrew { "זיהוי פריסה: פופאפ" } else { "Detection: Popup" },
        _ => if is_hebrew { "זיהוי פריסה: כבוי" } else { "Detection: Off" },
    };
    let detection = MenuItemBuilder::with_id("detection", detection_label).build(app)?;

    let caffeine_label = if settings.caffeine_enabled {
        if is_hebrew { "\u{2615} מצב ערנות (פעיל)" } else { "\u{2615} Caffeine Mode (Active)" }
    } else {
        if is_hebrew { "\u{2615} מצב ערנות" } else { "\u{2615} Caffeine Mode" }
    };
    let caffeine = MenuItemBuilder::with_id("caffeine", caffeine_label).build(app)?;

    let lock = MenuItemBuilder::with_id("lock",
        if is_hebrew { "\u{1F512} נעילת מקלדת" } else { "\u{1F512} Keyboard Lock" }).build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings",
        if is_hebrew { "\u{2699}\u{FE0F} הגדרות" } else { "\u{2699}\u{FE0F} Settings" }).build(app)?;
    let quit = MenuItemBuilder::with_id("quit",
        if is_hebrew { "\u{1F6AA} צא מ-Brava" } else { "\u{1F6AA} Quit Brava" }).build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&clipboard)
        .item(&convert)
        .item(&enhance)
        .item(&translate)
        .item(&screenshot)
        .item(&search)
        .separator()
        .item(&detection)
        .item(&caffeine)
        .item(&lock)
        .separator()
        .item(&settings_item)
        .item(&quit)
        .build()?;

    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon@1x.png"))
        .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("Brava - Smart Productivity Toolkit")
        .show_menu_on_left_click(true)
        .on_tray_icon_event(|tray, event| {
            use tauri::Emitter;
            let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            else {
                return;
            };
            if button != MouseButton::Right || button_state != MouseButtonState::Down {
                return;
            }
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("navigate-tab", "clipboard");
        })
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
                "enhance" => show_and_navigate("ai"),
                "translate" => show_and_navigate("ai"),
                "screenshot" => { let _ = app.emit("hotkey-screenshot", ()); }
                "search" => { let _ = app.emit("hotkey-quick-paste", ()); }
                "detection" => show_and_navigate("settings"),
                "caffeine" => { let _ = app.emit("toggle-caffeine", ()); }
                "lock" => { let _ = app.emit("toggle-keyboard-lock", ()); }
                "settings" => show_and_navigate("settings"),
                "quit" => { app.exit(0); }
                _ => {}
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

/// Compute a lightweight signature for clipboard image data to detect changes
/// without comparing all pixel bytes.
fn image_signature(img: &arboard::ImageData) -> String {
    let len = img.bytes.len();
    let start: Vec<u8> = img.bytes.iter().take(128).copied().collect();
    let mid_offset = len / 2;
    let mid: Vec<u8> = img.bytes.iter().skip(mid_offset).take(128).copied().collect();
    format!("{}x{}:s{:?}m{:?}", img.width, img.height, start, mid)
}

/// Background thread that polls the system clipboard every 500ms.
fn clipboard_monitor(
    app: tauri::AppHandle,
    manager: Arc<ClipboardManager>,
    db: Arc<Database>,
    app_data_dir: PathBuf,
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
    let mut last_image_hash = String::new();
    let mut last_prune = std::time::Instant::now();
    let mut image_poll_counter: u32 = 0;
    let mut layout_detector = WrongLayoutDetector::new();
    let layout_engine = LayoutEngine::new();
    let mut last_wrong_layout_alert = Instant::now()
        .checked_sub(Duration::from_secs(30))
        .unwrap_or_else(Instant::now);

    loop {
        std::thread::sleep(Duration::from_millis(500));

        // Check text first
        let mut text_changed = false;
        if let Ok(current) = clipboard.get_text() {
            if !current.is_empty() && current != last_content && current.len() <= 1_048_576 {
                if !manager.should_skip(&current) {
                    last_content = current.clone();
                    text_changed = true;
                    // (text processing continues below via `current`)
                } else {
                    last_content = current;
                }
            }
        }

        // Only check images if text didn't change (avoid double capture)
        // Reduce image polling to every ~2 seconds (500ms * 4) to avoid costly decoding
        image_poll_counter = image_poll_counter.wrapping_add(1);
        let should_check_image = !text_changed && image_poll_counter % 4 == 0;
        if should_check_image {
            match clipboard.get_image() {
                Ok(img_data) => {
                    let sig = image_signature(&img_data);
                    if sig != last_image_hash {
                        if !manager.should_skip(&sig) {
                            last_image_hash = sig;

                            // Save image to file
                            let screenshots_dir = app_data_dir.join("screenshots");
                            let _ = std::fs::create_dir_all(&screenshots_dir);
                            let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
                            let uid = uuid::Uuid::new_v4();
                            let filepath = screenshots_dir.join(format!("clipboard_{}_{}.png", timestamp, &uid.to_string()[..8]));
                            let filepath_str = filepath.to_string_lossy().to_string();

                            if image::save_buffer(
                                &filepath,
                                &img_data.bytes,
                                img_data.width as u32,
                                img_data.height as u32,
                                image::ColorType::Rgba8,
                            ).is_ok() {
                                if let Some(item) = manager.add_image(filepath_str) {
                                    if let Err(e) = db.save_clipboard_item(&item) {
                                        log::error!("Failed to persist clipboard image: {}", e);
                                    }
                                    let _ = app.emit("clipboard-changed", &item);
                                }
                            }
                        } else {
                            last_image_hash = sig;
                        }
                    }
                }
                Err(_) => {} // No image on clipboard, that's fine
            }
        }

        // --- Text processing (only reached when text_changed is true) ---

        if text_changed {
        if let Some(item) = manager.add(last_content.clone()) {
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
                    && last_wrong_layout_alert.elapsed() >= Duration::from_secs(5)
                {
                    if let Ok(converted) = layout_engine.auto_convert(&item.content) {
                        if converted.converted != item.content {
                            let detected = layout_engine.detect_layout(&item.content);

                            // Check OS keyboard layout — if typed chars match active keyboard, skip
                            if script_matches_active_keyboard(&detected.detected_code) {
                                layout_detector.clear();
                            } else {
                            let converted_detected = layout_engine.detect_layout(&converted.converted);
                            let strong_signal = if detected.detected_code == "en" {
                                // English text -> might be wrong-layout Hebrew
                                // Only flag if the text does NOT look like real English
                                !looks_like_real_english(&item.content)
                                    && converted_detected.detected_code != "en"
                                    && converted_detected.confidence >= 0.70
                            } else {
                                // Non-English text -> might be wrong-layout English
                                converted_detected.detected_code == "en"
                                    && converted_detected.confidence >= 0.70
                            };
                            if strong_signal {
                                let event = WrongLayoutDetectedEvent {
                                    wrong_text: item.content.clone(),
                                    suggested_text: converted.converted,
                                    source_layout: converted.source_layout,
                                    target_layout: converted.target_layout,
                                    confidence: converted_detected.confidence.max(detected.confidence),
                                };
                                handle_wrong_layout_event(&app, &event);
                                last_wrong_layout_alert = Instant::now();
                            }
                            } // end else (script does not match keyboard)
                        }
                    }
                }
            }
        }
        } // end if text_changed

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

fn handle_wrong_layout_event(app: &tauri::AppHandle, event: &WrongLayoutDetectedEvent) {
    use tauri::Manager;

    let mode = app.try_state::<SettingsState>()
        .and_then(|s| s.0.lock().ok().map(|st| st.wrong_layout_mode.clone()))
        .unwrap_or_else(|| "popup".to_string());

    match mode.as_str() {
        "autofix" => {
            // Write converted text to clipboard (user can paste with Cmd+V)
            if let Ok(mut clip) = arboard::Clipboard::new() {
                let _ = clip.set_text(&event.suggested_text);
            }
            use tauri::Emitter;
            let _ = app.emit("toast", format!("Layout corrected, paste to apply ({} \u{2192} {})", event.source_layout, event.target_layout));
        }
        "popup" => {
            let _ = open_wrong_layout_popup(app, event);
        }
        _ => {} // "off" - do nothing
    }
}

fn open_wrong_layout_popup(app: &tauri::AppHandle, event: &WrongLayoutDetectedEvent) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    use tauri::Manager;

    // Close existing popup if any
    if let Some(w) = app.get_webview_window("wrong-layout-popup") {
        let _ = w.close();
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let language = app.try_state::<SettingsState>()
        .and_then(|s| s.0.lock().ok().map(|st| st.language.clone()))
        .unwrap_or_else(|| "en".to_string());

    let params = format!(
        "index.html?popup=wronglayout&wrong={}&suggested={}&source={}&target={}&lang={}",
        urlencoding::encode(&event.wrong_text),
        urlencoding::encode(&event.suggested_text),
        urlencoding::encode(&event.source_layout),
        urlencoding::encode(&event.target_layout),
        urlencoding::encode(&language),
    );

    let _window = WebviewWindowBuilder::new(
        app,
        "wrong-layout-popup",
        WebviewUrl::App(params.into()),
    )
    .title("")
    .inner_size(360.0, 120.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .center()
    .resizable(false)
    .build()
    .map_err(|e| format!("Failed to open popup: {}", e))?;

    // Force focus on the popup window
    if let Some(win) = app.get_webview_window("wrong-layout-popup") {
        let _ = win.set_focus();
    }

    Ok(())
}

/// Check if English text looks like genuine English (not wrong-layout Hebrew).
/// Wrong-layout Hebrew typed on English keyboard produces unusual patterns like:
/// "akuo" "shgk" "dktu" — rare consonant clusters and missing vowel patterns.
/// Real English has predictable vowel/consonant distribution.
pub fn looks_like_real_english(text: &str) -> bool {
    let lower = text.to_lowercase();
    let chars: Vec<char> = lower.chars().filter(|c| c.is_ascii_alphabetic()).collect();

    if chars.is_empty() {
        return false;
    }

    // Check 1: Vowel ratio. English text has ~35-45% vowels.
    // Wrong-layout Hebrew has very few vowels (Hebrew vowels map to uncommon keys).
    let vowels = chars.iter().filter(|&&c| "aeiou".contains(c)).count();
    let vowel_ratio = vowels as f64 / chars.len() as f64;

    // Real English: 20-60% vowels. Wrong-layout: typically < 15%
    if vowel_ratio >= 0.15 {
        return true; // Has enough vowels to be real English
    }

    // Check 2: Common English bigrams present
    let common_bigrams = ["th", "he", "in", "er", "an", "re", "on", "at", "en", "nd",
                          "ti", "es", "or", "te", "of", "ed", "is", "it", "al", "ar",
                          "st", "to", "nt", "ng", "se", "ha", "le", "ou", "ea", "ne"];
    let text_lower = lower.clone();
    let bigram_count = common_bigrams.iter()
        .filter(|&&bg| text_lower.contains(bg))
        .count();

    // If text has 2+ common English bigrams, it's likely real English
    if bigram_count >= 2 {
        return true;
    }

    // Check 3: Common short English words (exact match for short text)
    if chars.len() <= 6 {
        let common_words = [
            "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
            "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
            "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
            "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
            "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
            "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
            "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
            "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
            "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
            "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
            "is", "are", "was", "were", "been", "had", "did", "has", "does", "got",
            "let", "may", "much", "very", "too", "such", "more", "own", "must", "here",
            "still", "those", "each", "where", "many", "same", "old", "big", "long", "great",
            "help", "need", "home", "open", "play", "end", "put", "hand", "set", "try",
            "ask", "men", "run", "high", "keep", "last", "few", "start", "show", "real",
            "please", "plea", "plan", "test", "text", "next", "best", "left", "right", "life",
        ];

        // Check each word in the buffer
        let words: Vec<&str> = lower.split_whitespace().collect();
        let real_word_count = words.iter().filter(|w| common_words.contains(&w.as_ref())).count();
        if !words.is_empty() && real_word_count as f64 / words.len() as f64 > 0.5 {
            return true; // More than half the words are common English
        }
    }

    false
}

/// Get the active macOS keyboard layout name (e.g. "U.S.", "Hebrew", "Arabic").
/// On non-macOS platforms returns "unknown".
#[cfg(target_os = "macos")]
pub fn get_active_keyboard_id() -> String {
    std::process::Command::new("defaults")
        .args(["read", "com.apple.HIToolbox", "AppleSelectedInputSources"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            for line in s.lines() {
                let trimmed = line.trim();
                if trimmed.contains("KeyboardLayout Name") {
                    return Some(
                        trimmed
                            .replace("\"KeyboardLayout Name\" = ", "")
                            .trim_matches(|c: char| c == '"' || c == ';' || c == ' ')
                            .to_string(),
                    );
                }
            }
            None
        })
        .unwrap_or_else(|| "U.S.".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn get_active_keyboard_id() -> String {
    "unknown".to_string()
}

/// Returns true if the detected script matches the user's active OS keyboard layout,
/// meaning the user is typing correctly and should NOT be flagged.
fn script_matches_active_keyboard(detected_code: &str) -> bool {
    let active_kb = get_active_keyboard_id();
    let active_is_hebrew = active_kb.contains("Hebrew");
    let active_is_english = active_kb.contains("U.S.")
        || active_kb.contains("ABC")
        || active_kb.contains("British")
        || active_kb.contains("Australian");
    let active_is_arabic = active_kb.contains("Arabic");
    let active_is_russian = active_kb.contains("Russian");

    (detected_code == "he" && active_is_hebrew)
        || (detected_code == "en" && active_is_english)
        || (detected_code == "ar" && active_is_arabic)
        || (detected_code == "ru" && active_is_russian)
}

fn should_analyze_wrong_layout(text: &str) -> bool {
    let trimmed = text.trim();
    let char_count = trimmed.chars().count();
    if char_count < 5 || char_count > 200 {
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
        if last_alert.elapsed() < Duration::from_secs(5) {
            return;
        }

        if detector.analyze().is_some() {
            if let Ok(converted) = engine.auto_convert(&snapshot) {
                if converted.converted != snapshot {
                    let detected = engine.detect_layout(&snapshot);

                    // Check OS keyboard layout — if typed chars match active keyboard, skip
                    if script_matches_active_keyboard(&detected.detected_code) {
                        detector.clear();
                    } else {
                    let converted_detected = engine.detect_layout(&converted.converted);
                    let strong_signal = if detected.detected_code == "en" {
                        // English text -> might be wrong-layout Hebrew
                        // Only flag if the text does NOT look like real English
                        !looks_like_real_english(&snapshot)
                            && converted_detected.detected_code != "en"
                            && converted_detected.confidence >= 0.70
                    } else {
                        // Non-English text -> might be wrong-layout English
                        converted_detected.detected_code == "en"
                            && converted_detected.confidence >= 0.70
                    };
                    if strong_signal {
                        let event = WrongLayoutDetectedEvent {
                            wrong_text: snapshot.clone(),
                            suggested_text: converted.converted,
                            source_layout: converted.source_layout,
                            target_layout: converted.target_layout,
                            confidence: converted_detected.confidence.max(detected.confidence),
                        };
                        handle_wrong_layout_event(&app, &event);
                        last_alert = Instant::now();
                        detector.clear();
                    }
                    } // end else (script does not match keyboard)
                }
            }
        }
    };

    if let Err(err) = listen(callback) {
        log::warn!("Global key monitor failed to start: {:?}", err);
    }
}

#[cfg(target_os = "macos")]
fn macos_key_consumer(
    app: tauri::AppHandle,
    rx: std::sync::mpsc::Receiver<engine::macos_keys::monitor::KeyEvent>,
) {
    use engine::macos_keys::monitor::KeyEvent;

    let mut detector = WrongLayoutDetector::new();
    let engine_inst = LayoutEngine::new();
    let mut last_alert = Instant::now()
        .checked_sub(Duration::from_secs(30))
        .unwrap_or_else(Instant::now);

    while let Ok(event) = rx.recv() {
        // Check if realtime detection is still enabled
        let realtime_enabled = app
            .try_state::<SettingsState>()
            .and_then(|s| s.0.lock().ok().map(|st| st.realtime_detection))
            .unwrap_or(false);
        if !realtime_enabled {
            continue;
        }

        match event {
            KeyEvent::Character(ch) => detector.push_char(ch),
            KeyEvent::Backspace => detector.pop_char(),
            KeyEvent::WordBoundary => detector.push_char(' '),
        }

        let snapshot = detector.get_buffer().trim().to_string();
        if !should_analyze_wrong_layout(&snapshot) {
            continue;
        }
        if last_alert.elapsed() < Duration::from_secs(5) {
            continue;
        }

        if detector.analyze().is_some() {
            if let Ok(converted) = engine_inst.auto_convert(&snapshot) {
                if converted.converted != snapshot {
                    let detected = engine_inst.detect_layout(&snapshot);

                    // Check OS keyboard layout — if typed chars match active keyboard, skip
                    if script_matches_active_keyboard(&detected.detected_code) {
                        detector.clear();
                    } else {
                    let converted_detected = engine_inst.detect_layout(&converted.converted);
                    let strong_signal = if detected.detected_code == "en" {
                        // English text -> might be wrong-layout Hebrew
                        // Only flag if the text does NOT look like real English
                        !looks_like_real_english(&snapshot)
                            && converted_detected.detected_code != "en"
                            && converted_detected.confidence >= 0.70
                    } else {
                        // Non-English text -> might be wrong-layout English
                        converted_detected.detected_code == "en"
                            && converted_detected.confidence >= 0.70
                    };
                    if strong_signal {
                        let event_data = WrongLayoutDetectedEvent {
                            wrong_text: snapshot.clone(),
                            suggested_text: converted.converted,
                            source_layout: converted.source_layout,
                            target_layout: converted.target_layout,
                            confidence: converted_detected.confidence.max(detected.confidence),
                        };
                        handle_wrong_layout_event(&app, &event_data);
                        last_alert = Instant::now();
                        detector.clear();
                    }
                    } // end else (script does not match keyboard)
                }
            }
        }
    }

    log::warn!("macOS key monitor channel closed");
}

pub mod monitor_cmd {
    use super::*;

    #[tauri::command]
    pub fn start_global_typing_monitor(app: tauri::AppHandle) -> Result<bool, String> {
        if TYPING_MONITOR_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
            return Ok(true); // Already running
        }

        // Check settings
        let settings_enabled = app.try_state::<SettingsState>()
            .and_then(|s| s.0.lock().ok().map(|st| st.global_typing_detection))
            .unwrap_or(false);

        if !settings_enabled {
            TYPING_MONITOR_RUNNING.store(false, Ordering::SeqCst);
            return Err("Global typing detection is not enabled in settings".to_string());
        }

        #[cfg(target_os = "macos")]
        {
            // Check accessibility permission
            extern "C" { fn AXIsProcessTrusted() -> u8; }
            let has_access = unsafe { AXIsProcessTrusted() != 0 };
            if !has_access {
                TYPING_MONITOR_RUNNING.store(false, Ordering::SeqCst);
                return Err("Accessibility permission required. Grant it in System Settings > Privacy > Accessibility.".to_string());
            }

            let app_handle = app.clone();
            std::thread::spawn(move || {
                match engine::macos_keys::monitor::start_key_monitor() {
                    Ok(rx) => {
                        macos_key_consumer(app_handle, rx);
                    }
                    Err(e) => {
                        log::error!("Failed to start macOS key monitor: {}", e);
                    }
                }
                TYPING_MONITOR_RUNNING.store(false, Ordering::SeqCst);
            });
            return Ok(true);
        }

        #[cfg(not(target_os = "macos"))]
        {
            let app_handle = app.clone();
            std::thread::spawn(move || {
                global_key_monitor(app_handle);
                TYPING_MONITOR_RUNNING.store(false, Ordering::SeqCst);
            });
            return Ok(true);
        }
    }
}
