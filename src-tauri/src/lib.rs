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
use storage::settings::AppSettings;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Register application state
        .manage(LayoutState(Mutex::new(LayoutEngine::new())))
        .manage(ClipboardState(Arc::new(ClipboardManager::new(500))))
        .manage(SnippetState(Mutex::new(SnippetEngine::new())))
        .manage(AIState::new())
        .manage(SettingsState(Mutex::new(AppSettings::default())))
        // Register all IPC command handlers
        .invoke_handler(tauri::generate_handler![
            // Layout commands
            commands::layout::convert_text,
            commands::layout::auto_convert,
            commands::layout::detect_layout,
            commands::layout::get_layouts,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Brava");
}
