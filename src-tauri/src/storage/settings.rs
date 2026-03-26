use serde::{Deserialize, Serialize};

/// Application settings with defaults
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    // General
    pub launch_at_login: bool,
    #[serde(default)]
    pub start_minimized_to_tray: bool,
    pub theme: String, // "system", "light", "dark"
    pub language: String, // UI language
    #[serde(default = "default_ui_scale")]
    pub ui_scale: f32,

    // Layout conversion
    pub default_source_layout: String,
    pub default_target_layout: String,
    pub auto_detect_layout: bool,
    pub realtime_detection: bool,
    #[serde(default = "default_global_typing_detection")]
    pub global_typing_detection: bool,

    // Clipboard
    pub clipboard_enabled: bool,
    pub max_clipboard_items: usize,
    #[serde(default = "default_clipboard_preview_length")]
    pub clipboard_preview_length: usize,
    #[serde(default)]
    pub clipboard_retention_days: Option<u32>,
    pub auto_categorize: bool,

    // Snippets
    pub snippets_enabled: bool,
    #[serde(default = "default_snippet_expansion_delay_ms")]
    pub snippet_expansion_delay_ms: u32,

    // AI
    pub ai_provider: String, // "gemini", "openai", "claude", "openrouter", "ollama"
    pub ai_model: Option<String>,
    pub ollama_endpoint: String,
    #[serde(default = "default_ai_output_language")]
    pub ai_output_language: String,

    // Keyboard lock
    pub keyboard_lock_timer: Option<u32>, // seconds, None = manual unlock

    // Caffeine
    pub caffeine_enabled: bool,

    // Grammar correction
    #[serde(default)]
    pub grammar_enabled: bool,

    // Sounds
    #[serde(default = "default_sounds_enabled")]
    pub sounds_enabled: bool,
    #[serde(default = "default_notification_transcription_complete")]
    pub notification_transcription_complete: bool,
}

fn default_sounds_enabled() -> bool {
    true
}

fn default_notification_transcription_complete() -> bool { true }
fn default_ui_scale() -> f32 { 1.0 }
fn default_clipboard_preview_length() -> usize { 200 }
fn default_snippet_expansion_delay_ms() -> u32 { 120 }
fn default_ai_output_language() -> String { "auto".to_string() }
fn default_global_typing_detection() -> bool {
    !cfg!(target_os = "macos")
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            launch_at_login: false,
            start_minimized_to_tray: false,
            theme: "system".to_string(),
            language: "en".to_string(),
            ui_scale: 1.0,

            default_source_layout: "auto".to_string(),
            default_target_layout: "en".to_string(),
            auto_detect_layout: true,
            realtime_detection: true,
            global_typing_detection: default_global_typing_detection(),

            clipboard_enabled: true,
            max_clipboard_items: 500,
            clipboard_preview_length: 200,
            clipboard_retention_days: None,
            auto_categorize: true,

            snippets_enabled: true,
            snippet_expansion_delay_ms: 120,

            ai_provider: "gemini".to_string(),
            ai_model: None,
            ollama_endpoint: "http://localhost:11434".to_string(),
            ai_output_language: "auto".to_string(),

            keyboard_lock_timer: None,

            caffeine_enabled: false,

            grammar_enabled: false,
            sounds_enabled: true,
            notification_transcription_complete: true,
        }
    }
}

impl AppSettings {
    /// Load settings from database, falling back to defaults
    pub fn load(db: &super::database::Database) -> Self {
        let json = db.get_setting("app_settings").unwrap_or(None);
        match json {
            Some(j) => serde_json::from_str(&j).unwrap_or_default(),
            None => AppSettings::default(),
        }
    }

    /// Save settings to database
    pub fn save(&self, db: &super::database::Database) -> Result<(), String> {
        let json = serde_json::to_string(self)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        db.set_setting("app_settings", &json)
    }
}
