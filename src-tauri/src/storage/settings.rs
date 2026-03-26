use serde::{Deserialize, Serialize};

/// Application settings with defaults
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    // General
    pub launch_at_login: bool,
    pub theme: String, // "system", "light", "dark"
    pub language: String, // UI language

    // Layout conversion
    pub default_source_layout: String,
    pub default_target_layout: String,
    pub auto_detect_layout: bool,
    pub realtime_detection: bool,

    // Clipboard
    pub clipboard_enabled: bool,
    pub max_clipboard_items: usize,
    pub auto_categorize: bool,

    // Snippets
    pub snippets_enabled: bool,

    // AI
    pub ai_provider: String, // "gemini", "openai", "claude", "openrouter", "ollama"
    pub ai_model: Option<String>,
    pub ollama_endpoint: String,

    // Keyboard lock
    pub keyboard_lock_timer: Option<u32>, // seconds, None = manual unlock

    // Caffeine
    pub caffeine_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            launch_at_login: false,
            theme: "system".to_string(),
            language: "en".to_string(),

            default_source_layout: "auto".to_string(),
            default_target_layout: "en".to_string(),
            auto_detect_layout: true,
            realtime_detection: true,

            clipboard_enabled: true,
            max_clipboard_items: 500,
            auto_categorize: true,

            snippets_enabled: true,

            ai_provider: "gemini".to_string(),
            ai_model: None,
            ollama_endpoint: "http://localhost:11434".to_string(),

            keyboard_lock_timer: None,

            caffeine_enabled: false,
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
