use crate::ai::provider::{AIModel, AIRequest, AIResponse};
use crate::ai::{claude, gemini, ollama, openai, openrouter};
use std::sync::Mutex;
use tauri::State;
use serde::Serialize;
use tauri::Emitter;

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
        .unwrap_or_else(|| state.active_provider.lock().unwrap_or_else(|e| e.into_inner()).clone());

    complete_with_provider(&active, &state, &request).await
}

#[derive(Serialize, Clone)]
pub struct AiStreamChunkEvent {
    pub request_id: String,
    pub chunk: String,
}

#[derive(Serialize, Clone)]
pub struct AiStreamDoneEvent {
    pub request_id: String,
    pub content: String,
    pub provider: String,
    pub model: String,
}

#[tauri::command]
pub async fn ai_complete_stream(
    prompt: &str,
    system_prompt: Option<&str>,
    provider: Option<&str>,
    model: Option<&str>,
    request_id: Option<&str>,
    app: tauri::AppHandle,
    state: State<'_, AIState>,
) -> Result<String, String> {
    let request = AIRequest {
        prompt: prompt.to_string(),
        system_prompt: system_prompt.map(|s| s.to_string()),
        model: model.map(|s| s.to_string()),
        max_tokens: Some(2048),
        temperature: Some(0.7),
    };
    let active = provider
        .map(|s| s.to_string())
        .unwrap_or_else(|| state.active_provider.lock().unwrap_or_else(|e| e.into_inner()).clone());
    let rid = request_id
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let response = complete_with_provider(&active, &state, &request).await?;
    for part in response.content.split_whitespace() {
        let _ = app.emit(
            "ai-stream-chunk",
            AiStreamChunkEvent {
                request_id: rid.clone(),
                chunk: format!("{} ", part),
            },
        );
    }
    let _ = app.emit(
        "ai-stream-done",
        AiStreamDoneEvent {
            request_id: rid.clone(),
            content: response.content.clone(),
            provider: response.provider.clone(),
            model: response.model.clone(),
        },
    );
    Ok(rid)
}

#[tauri::command]
pub async fn ai_enhance_prompt(
    text: &str,
    provider: Option<&str>,
    state: State<'_, AIState>,
) -> Result<AIResponse, String> {
    let request = AIRequest::enhance_prompt(text);
    let active = provider
        .map(|s| s.to_string())
        .unwrap_or_else(|| state.active_provider.lock().unwrap_or_else(|e| e.into_inner()).clone());
    complete_with_provider(&active, &state, &request).await
}

#[tauri::command]
pub async fn ai_translate(
    text: &str,
    source_lang: &str,
    target_lang: &str,
    provider: Option<&str>,
    state: State<'_, AIState>,
) -> Result<AIResponse, String> {
    let request = AIRequest::translate(text, source_lang, target_lang);
    let active = provider
        .map(|s| s.to_string())
        .unwrap_or_else(|| state.active_provider.lock().unwrap_or_else(|e| e.into_inner()).clone());
    complete_with_provider(&active, &state, &request).await
}

#[tauri::command]
pub async fn ai_fix_grammar(
    text: &str,
    provider: Option<&str>,
    state: State<'_, AIState>,
) -> Result<AIResponse, String> {
    use crate::ai::provider::AIRequest;

    // Detect if Hebrew
    let is_hebrew = text.trim().chars()
        .filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation())
        .take(30)
        .any(|c| ('\u{0590}'..='\u{05FF}').contains(&c));

    let system_prompt = if is_hebrew {
        "אתה עורך טקסט מקצועי. תקן שגיאות דקדוק, כתיב ופיסוק בטקסט. \
         שמור על המשמעות המקורית. החזר רק את הטקסט המתוקן, ללא הסברים."
    } else {
        "You are a professional text editor. Fix grammar, spelling, and punctuation errors in the text. \
         Preserve the original meaning. Return ONLY the corrected text, no explanations."
    };

    let request = AIRequest {
        prompt: text.to_string(),
        system_prompt: Some(system_prompt.to_string()),
        model: None,
        max_tokens: Some(4096),
        temperature: Some(0.2),
    };

    let active = provider
        .map(|s| s.to_string())
        .unwrap_or_else(|| state.active_provider.lock().unwrap_or_else(|e| e.into_inner()).clone());
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
    // Save to in-memory provider
    match provider {
        "gemini" => state.gemini.lock().map_err(|e| e.to_string())?.set_api_key(key.to_string()),
        "openai" => state.openai.lock().map_err(|e| e.to_string())?.set_api_key(key.to_string()),
        "claude" => state.claude.lock().map_err(|e| e.to_string())?.set_api_key(key.to_string()),
        "openrouter" => state.openrouter.lock().map_err(|e| e.to_string())?.set_api_key(key.to_string()),
        _ => return Err(format!("Cannot set API key for: {}", provider)),
    }

    // Persist to OS keyring
    match keyring::Entry::new("brava", &format!("api_key_{}", provider)) {
        Ok(entry) => {
            if let Err(e) = entry.set_password(key) {
                log::error!("Failed to save API key to keyring: {}", e);
            }
        }
        Err(e) => {
            log::error!("Failed to create keyring entry: {}", e);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_ai_models(state: State<'_, AIState>) -> Vec<AIModel> {
    let mut models = Vec::new();
    models.extend(state.gemini.lock().unwrap_or_else(|e| e.into_inner()).available_models());
    models.extend(state.openai.lock().unwrap_or_else(|e| e.into_inner()).available_models());
    models.extend(state.claude.lock().unwrap_or_else(|e| e.into_inner()).available_models());
    models.extend(state.openrouter.lock().unwrap_or_else(|e| e.into_inner()).available_models());
    models.extend(state.ollama.lock().unwrap_or_else(|e| e.into_inner()).available_models());
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
    .expect("Invalid static JSON for AI providers")
}

#[derive(Serialize)]
pub struct ApiKeyHealth {
    pub status: String,
    pub message: String,
}

#[tauri::command]
pub async fn check_api_key_health(
    provider: &str,
    key: Option<&str>,
    state: State<'_, AIState>,
) -> Result<ApiKeyHealth, String> {
    let provider_id = provider.to_lowercase();

    let resolved_key = match provider_id.as_str() {
        "gemini" => key
            .map(|k| k.to_string())
            .or_else(|| state.gemini.lock().ok().and_then(|p| p.get_api_key())),
        "openai" => key
            .map(|k| k.to_string())
            .or_else(|| state.openai.lock().ok().and_then(|p| p.get_api_key())),
        "claude" => key
            .map(|k| k.to_string())
            .or_else(|| state.claude.lock().ok().and_then(|p| p.get_api_key())),
        "openrouter" => key
            .map(|k| k.to_string())
            .or_else(|| state.openrouter.lock().ok().and_then(|p| p.get_api_key())),
        "ollama" => None,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    let timeout = std::time::Duration::from_secs(8);
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;

    if provider_id != "ollama" && resolved_key.as_deref().unwrap_or("").trim().is_empty() {
        return Ok(ApiKeyHealth {
            status: "missing".to_string(),
            message: "No API key configured".to_string(),
        });
    }

    let result = match provider_id.as_str() {
        "openai" => {
            client
                .get("https://api.openai.com/v1/models")
                .header(
                    "Authorization",
                    format!("Bearer {}", resolved_key.as_deref().unwrap_or_default()),
                )
                .send()
                .await
        }
        "gemini" => {
            client
                .get(format!(
                    "https://generativelanguage.googleapis.com/v1beta/models?key={}",
                    resolved_key.as_deref().unwrap_or_default()
                ))
                .send()
                .await
        }
        "claude" => {
            client
                .get("https://api.anthropic.com/v1/models")
                .header("x-api-key", resolved_key.as_deref().unwrap_or_default())
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
        }
        "openrouter" => {
            client
                .get("https://openrouter.ai/api/v1/models")
                .header(
                    "Authorization",
                    format!("Bearer {}", resolved_key.as_deref().unwrap_or_default()),
                )
                .send()
                .await
        }
        "ollama" => {
            let endpoint = state
                .ollama
                .lock()
                .map_err(|e| e.to_string())?
                .get_endpoint();
            client
                .get(format!("{}/api/tags", endpoint.trim_end_matches('/')))
                .send()
                .await
        }
        _ => unreachable!(),
    };

    match result {
        Ok(resp) if resp.status().is_success() => Ok(ApiKeyHealth {
            status: "valid".to_string(),
            message: "Connection and credentials look good".to_string(),
        }),
        Ok(resp) if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 => {
            Ok(ApiKeyHealth {
                status: "invalid".to_string(),
                message: "Credentials rejected by provider".to_string(),
            })
        }
        Ok(resp) => Ok(ApiKeyHealth {
            status: "check_failed".to_string(),
            message: format!("Provider returned {}", resp.status()),
        }),
        Err(err) if err.is_timeout() || err.is_connect() => Ok(ApiKeyHealth {
            status: "unreachable".to_string(),
            message: "Provider is unreachable or timed out".to_string(),
        }),
        Err(err) => Ok(ApiKeyHealth {
            status: "check_failed".to_string(),
            message: format!("Health check failed: {}", err),
        }),
    }
}
