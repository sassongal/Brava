use super::provider::{AIError, AIModel, AIRequest, AIResponse};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const OPENAI_API_BASE: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL: &str = "gpt-4o-mini";

#[derive(Clone)]
pub struct OpenAIProvider {
    client: Client,
    api_key: Option<String>,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Option<Vec<ChatChoice>>,
    model: Option<String>,
    usage: Option<ChatUsage>,
    error: Option<ChatError>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatUsage {
    total_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct ChatError {
    message: String,
    #[serde(rename = "type")]
    error_type: Option<String>,
}

impl OpenAIProvider {
    pub fn new(api_key: Option<String>) -> Self {
        OpenAIProvider {
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
            provider: "OpenAI".to_string(),
        })?;

        let model = request.model.as_deref().unwrap_or(DEFAULT_MODEL);

        let mut messages = Vec::new();
        if let Some(ref system) = request.system_prompt {
            messages.push(ChatMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }
        messages.push(ChatMessage {
            role: "user".to_string(),
            content: request.prompt.clone(),
        });

        let body = ChatRequest {
            model: model.to_string(),
            messages,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
        };

        let response = self
            .client
            .post(OPENAI_API_BASE)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await?;

        let status = response.status().as_u16();
        let response_body: ChatResponse = response.json().await?;

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
            provider: "openai".to_string(),
            tokens_used: response_body.usage.and_then(|u| u.total_tokens),
        })
    }

    pub fn name(&self) -> &str {
        "OpenAI"
    }

    pub fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn available_models(&self) -> Vec<AIModel> {
        vec![
            AIModel {
                id: "gpt-4o".to_string(),
                name: "GPT-4o".to_string(),
                provider: "openai".to_string(),
                is_free: false,
                supports_vision: true,
            },
            AIModel {
                id: "gpt-4o-mini".to_string(),
                name: "GPT-4o Mini".to_string(),
                provider: "openai".to_string(),
                is_free: false,
                supports_vision: true,
            },
            AIModel {
                id: "gpt-4.1-nano".to_string(),
                name: "GPT-4.1 Nano".to_string(),
                provider: "openai".to_string(),
                is_free: false,
                supports_vision: false,
            },
        ]
    }
}
