use serde::{Deserialize, Serialize};

/// Unified error type for AI service operations
#[derive(Debug, thiserror::Error)]
pub enum AIError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("API returned error: {status} - {message}")]
    Api { status: u16, message: String },
    #[error("No API key configured for {provider}")]
    NoApiKey { provider: String },
    #[error("Provider not available: {0}")]
    Unavailable(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Request timeout")]
    Timeout,
}

// Implement Serialize for AIError so it can be returned from Tauri commands
impl Serialize for AIError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// A request to an AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

/// A response from an AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIResponse {
    pub content: String,
    pub model: String,
    pub provider: String,
    pub tokens_used: Option<u32>,
}

/// Available AI models organized by provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIModel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub is_free: bool,
    pub supports_vision: bool,
}

// Note: We use concrete types per provider rather than a trait object,
// since each provider is called directly from the Tauri command handlers.
// This avoids the need for async_trait and dynamic dispatch overhead.

/// Factory function to create AI requests for common tasks
impl AIRequest {
    pub fn enhance_prompt(text: &str) -> Self {
        AIRequest {
            prompt: text.to_string(),
            system_prompt: Some(
                "You are an expert prompt engineer. Take the user's text and improve it to be a more effective prompt. \
                 Make it clearer, more specific, and more likely to produce good results. \
                 Return ONLY the improved prompt, no explanations.".to_string()
            ),
            model: None,
            max_tokens: Some(2048),
            temperature: Some(0.7),
        }
    }

    pub fn translate(text: &str, source_lang: &str, target_lang: &str) -> Self {
        AIRequest {
            prompt: text.to_string(),
            system_prompt: Some(format!(
                "You are a professional translator. Translate the following text from {} to {}. \
                 Preserve the tone, style, and meaning. Return ONLY the translation, no explanations.",
                source_lang, target_lang
            )),
            model: None,
            max_tokens: Some(4096),
            temperature: Some(0.3),
        }
    }

    pub fn describe_image(prompt: &str) -> Self {
        AIRequest {
            prompt: prompt.to_string(),
            system_prompt: Some(
                "Describe this image in detail. Include objects, colors, composition, and any text visible.".to_string()
            ),
            model: None,
            max_tokens: Some(1024),
            temperature: Some(0.5),
        }
    }
}
