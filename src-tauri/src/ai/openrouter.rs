use super::provider::{AIError, AIModel, AIRequest, AIResponse};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const OPENROUTER_API_BASE: &str = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL: &str = "google/gemini-2.5-flash";

#[derive(Clone)]
pub struct OpenRouterProvider {
    client: Client,
    api_key: Option<String>,
}

#[derive(Serialize)]
struct ORRequest {
    model: String,
    messages: Vec<ORMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize, Deserialize)]
struct ORMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ORResponse {
    choices: Option<Vec<ORChoice>>,
    model: Option<String>,
    usage: Option<ORUsage>,
    error: Option<ORError>,
}

#[derive(Deserialize)]
struct ORChoice {
    message: ORMessage,
}

#[derive(Deserialize)]
struct ORUsage {
    total_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct ORError {
    message: String,
}

impl OpenRouterProvider {
    pub fn new(api_key: Option<String>) -> Self {
        OpenRouterProvider {
            client: Client::new(),
            api_key,
        }
    }

    pub fn set_api_key(&mut self, key: String) {
        self.api_key = Some(key);
    }

    pub fn get_api_key(&self) -> Option<String> {
        self.api_key.clone()
    }

    pub async fn complete(&self, request: &AIRequest) -> Result<AIResponse, AIError> {
        let api_key = self.api_key.as_ref().ok_or(AIError::NoApiKey {
            provider: "OpenRouter".to_string(),
        })?;

        let model = request.model.as_deref().unwrap_or(DEFAULT_MODEL);

        let mut messages = Vec::new();
        if let Some(ref system) = request.system_prompt {
            messages.push(ORMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }
        messages.push(ORMessage {
            role: "user".to_string(),
            content: request.prompt.clone(),
        });

        let body = ORRequest {
            model: model.to_string(),
            messages,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
        };

        let response = self
            .client
            .post(OPENROUTER_API_BASE)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("HTTP-Referer", "https://brava.app")
            .header("X-Title", "Brava")
            .json(&body)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await?;

        let status = response.status().as_u16();
        let body_text = response.text().await?;
        let response_body: ORResponse = serde_json::from_str(&body_text).map_err(|_| {
            AIError::Api {
                status,
                message: if body_text.is_empty() {
                    "Provider returned empty response".to_string()
                } else {
                    let trimmed: String = body_text.chars().take(240).collect();
                    format!("Provider returned non-JSON response: {}", trimmed)
                },
            }
        })?;

        if let Some(error) = response_body.error {
            return Err(AIError::Api {
                status,
                message: error.message,
            });
        }

        let content = response_body
            .choices
            .and_then(|c| c.into_iter().next())
            .map(|c| c.message.content)
            .unwrap_or_default();

        Ok(AIResponse {
            content,
            model: response_body.model.unwrap_or_else(|| model.to_string()),
            provider: "openrouter".to_string(),
            tokens_used: response_body.usage.and_then(|u| u.total_tokens),
        })
    }

    pub fn name(&self) -> &str {
        "OpenRouter"
    }

    pub fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn available_models(&self) -> Vec<AIModel> {
        vec![
            AIModel {
                id: "google/gemini-2.5-flash".to_string(),
                name: "Gemini 2.5 Flash (Free)".to_string(),
                provider: "openrouter".to_string(),
                is_free: true,
                supports_vision: true,
            },
            AIModel {
                id: "deepseek/deepseek-chat".to_string(),
                name: "DeepSeek Chat (Free)".to_string(),
                provider: "openrouter".to_string(),
                is_free: true,
                supports_vision: false,
            },
            AIModel {
                id: "meta-llama/llama-3.3-70b-instruct".to_string(),
                name: "Llama 3.3 70B (Free)".to_string(),
                provider: "openrouter".to_string(),
                is_free: true,
                supports_vision: false,
            },
            AIModel {
                id: "mistralai/mistral-7b-instruct".to_string(),
                name: "Mistral 7B (Free)".to_string(),
                provider: "openrouter".to_string(),
                is_free: true,
                supports_vision: false,
            },
        ]
    }
}
