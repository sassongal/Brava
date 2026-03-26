use super::provider::{AIError, AIModel, AIRequest, AIResponse};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const CLAUDE_API_BASE: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";
const API_VERSION: &str = "2023-06-01";

#[derive(Clone)]
pub struct ClaudeProvider {
    client: Client,
    api_key: Option<String>,
}

#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    messages: Vec<ClaudeMessage>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize, Deserialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Option<Vec<ClaudeContent>>,
    model: Option<String>,
    usage: Option<ClaudeUsage>,
    error: Option<ClaudeError>,
}

#[derive(Deserialize)]
struct ClaudeContent {
    text: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeUsage {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct ClaudeError {
    message: String,
}

impl ClaudeProvider {
    pub fn new(api_key: Option<String>) -> Self {
        ClaudeProvider {
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
            provider: "Claude".to_string(),
        })?;

        let model = request.model.as_deref().unwrap_or(DEFAULT_MODEL);

        let body = ClaudeRequest {
            model: model.to_string(),
            messages: vec![ClaudeMessage {
                role: "user".to_string(),
                content: request.prompt.clone(),
            }],
            max_tokens: request.max_tokens.unwrap_or(2048),
            system: request.system_prompt.clone(),
            temperature: request.temperature,
        };

        let response = self
            .client
            .post(CLAUDE_API_BASE)
            .header("x-api-key", api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await?;

        let status = response.status().as_u16();
        let body_text = response.text().await?;
        let response_body: ClaudeResponse = serde_json::from_str(&body_text).map_err(|_| {
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
            .content
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.text)
            .unwrap_or_default();

        let tokens_used = response_body.usage.map(|u| {
            u.input_tokens.unwrap_or(0) + u.output_tokens.unwrap_or(0)
        });

        Ok(AIResponse {
            content,
            model: response_body.model.unwrap_or_else(|| model.to_string()),
            provider: "claude".to_string(),
            tokens_used,
        })
    }

    pub fn name(&self) -> &str {
        "Claude"
    }

    pub fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn available_models(&self) -> Vec<AIModel> {
        vec![
            AIModel {
                id: "claude-sonnet-4-6".to_string(),
                name: "Claude Sonnet 4.6".to_string(),
                provider: "claude".to_string(),
                is_free: false,
                supports_vision: true,
            },
            AIModel {
                id: "claude-haiku-4-5-20251001".to_string(),
                name: "Claude Haiku 4.5".to_string(),
                provider: "claude".to_string(),
                is_free: false,
                supports_vision: true,
            },
            AIModel {
                id: "claude-opus-4-6".to_string(),
                name: "Claude Opus 4.6".to_string(),
                provider: "claude".to_string(),
                is_free: false,
                supports_vision: true,
            },
        ]
    }
}
