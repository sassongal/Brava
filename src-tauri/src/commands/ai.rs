use crate::ai::provider::{AIModel, AIRequest, AIResponse};
use crate::ai::{claude, gemini, ollama, openai, openrouter};
use std::sync::Mutex;
use tauri::State;

/// Holds all AI provider instances
pub struct AIState {
    pub gemini: Mutex<gemini::GeminiProvider>,
    pub openai: Mutex<openai::OpenAIProvider>,
    pub claude: Mutex<claude::ClaudeProvider>,
    pub openrouter: Mutex<openrouter::OpenRouterProvider>,
    pub ollama: Mutex<ollama::OllamaProvider>,
    pub active_provider: Mutex<String>,
}

impl AIState {
    pub fn new() -> Self {
        AIState {
            gemini: Mutex::new(gemini::GeminiProvider::new(None)),
            openai: Mutex::new(openai::OpenAIProvider::new(None)),
            claude: Mutex::new(claude::ClaudeProvider::new(None)),
            openrouter: Mutex::new(openrouter::OpenRouterProvider::new(None)),
            ollama: Mutex::new(ollama::OllamaProvider::new(None)),
            active_provider: Mutex::new("gemini".to_string()),
        }
    }
}

/// Helper: clone provider out of mutex, then call async method without holding lock
async fn complete_with_provider(
    active: &str,
    state: &State<'_, AIState>,
    request: &AIRequest,
) -> Result<AIResponse, String> {
    match active {
        "gemini" => {
            let provider = state.gemini.lock().map_err(|e| e.to_string())?.clone();
            provider.complete(request).await.map_err(|e| e.to_string())
        }
        "openai" => {
            let provider = state.openai.lock().map_err(|e| e.to_string())?.clone();
            provider.complete(request).await.map_err(|e| e.to_string())
        }
        "claude" => {
            let provider = state.claude.lock().map_err(|e| e.to_string())?.clone();
            provider.complete(request).await.map_err(|e| e.to_string())
        }
        "openrouter" => {
            let provider = state.openrouter.lock().map_err(|e| e.to_string())?.clone();
            provider.complete(request).await.map_err(|e| e.to_string())
        }
        "ollama" => {
            let provider = state.ollama.lock().map_err(|e| e.to_string())?.clone();
            provider.complete(request).await.map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown provider: {}", active)),
    }
}

#[tauri::command]
pub async fn ai_complete(
    prompt: &str,
    system_prompt: Option<&str>,
    provider: Option<&str>,
    model: Option<&str>,
    state: State<'_, AIState>,
) -> Result<AIResponse, String> {
    let request = AIRequest {
        prompt: prompt.to_string(),
        system_prompt: system_prompt.map(|s| s.to_string()),
        model: model.map(|s| s.to_string()),
        max_tokens: Some(2048),
        temperature: Some(0.7),
    };

    let active = provider
        .map(|s| s.to_string())
        .unwrap_or_else(|| state.active_provider.lock().unwrap().clone());

    complete_with_provider(&active, &state, &request).await
}

#[tauri::command]
pub async fn ai_enhance_prompt(
    text: &str,
    state: State<'_, AIState>,
) -> Result<AIResponse, String> {
    let request = AIRequest::enhance_prompt(text);
    let active = state.active_provider.lock().unwrap().clone();
    complete_with_provider(&active, &state, &request).await
}

#[tauri::command]
pub async fn ai_translate(
    text: &str,
    source_lang: &str,
    target_lang: &str,
    state: State<'_, AIState>,
) -> Result<AIResponse, String> {
    let request = AIRequest::translate(text, source_lang, target_lang);
    let active = state.active_provider.lock().unwrap().clone();
    complete_with_provider(&active, &state, &request).await
}

#[tauri::command]
pub fn set_ai_provider(provider: &str, state: State<'_, AIState>) -> Result<(), String> {
    let valid = ["gemini", "openai", "claude", "openrouter", "ollama"];
    if !valid.contains(&provider) {
        return Err(format!("Invalid provider: {}. Valid: {:?}", provider, valid));
    }
    *state.active_provider.lock().map_err(|e| e.to_string())? = provider.to_string();
    Ok(())
}

#[tauri::command]
pub fn set_api_key(provider: &str, key: &str, state: State<'_, AIState>) -> Result<(), String> {
    match provider {
        "gemini" => state.gemini.lock().map_err(|e| e.to_string())?.set_api_key(key.to_string()),
        "openai" => state.openai.lock().map_err(|e| e.to_string())?.set_api_key(key.to_string()),
        "claude" => state.claude.lock().map_err(|e| e.to_string())?.set_api_key(key.to_string()),
        "openrouter" => state
            .openrouter
            .lock()
            .map_err(|e| e.to_string())?
            .set_api_key(key.to_string()),
        _ => return Err(format!("Cannot set API key for: {}", provider)),
    }
    Ok(())
}

#[tauri::command]
pub fn get_ai_models(state: State<'_, AIState>) -> Vec<AIModel> {
    let mut models = Vec::new();
    models.extend(state.gemini.lock().unwrap().available_models());
    models.extend(state.openai.lock().unwrap().available_models());
    models.extend(state.claude.lock().unwrap().available_models());
    models.extend(state.openrouter.lock().unwrap().available_models());
    models.extend(state.ollama.lock().unwrap().available_models());
    models
}

#[tauri::command]
pub fn get_ai_providers() -> Vec<serde_json::Value> {
    serde_json::from_str(
        r#"[
            {"id": "gemini", "name": "Google Gemini", "has_free_tier": true},
            {"id": "openai", "name": "OpenAI / ChatGPT", "has_free_tier": false},
            {"id": "claude", "name": "Anthropic Claude", "has_free_tier": false},
            {"id": "openrouter", "name": "OpenRouter", "has_free_tier": true},
            {"id": "ollama", "name": "Ollama (Local)", "has_free_tier": true}
        ]"#,
    )
    .unwrap()
}
