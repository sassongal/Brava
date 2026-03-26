use super::provider::{AIError, AIModel, AIRequest, AIResponse};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL: &str = "gemini-2.5-flash";

#[derive(Clone)]
pub struct GeminiProvider {
    client: Client,
    api_key: Option<String>,
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Serialize, Deserialize)]
struct GeminiContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize)]
struct GenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    error: Option<GeminiError>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
}

#[derive(Deserialize)]
struct GeminiError {
    message: String,
    code: Option<u16>,
}

impl GeminiProvider {
    pub fn new(api_key: Option<String>) -> Self {
        GeminiProvider {
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
            provider: "Gemini".to_string(),
        })?;

        let model = request.model.as_deref().unwrap_or(DEFAULT_MODEL);
        let url = format!("{}{}:generateContent?key={}", GEMINI_API_BASE, model, api_key);

        let body = GeminiRequest {
            contents: vec![GeminiContent {
                role: Some("user".to_string()),
                parts: vec![GeminiPart {
                    text: request.prompt.clone(),
                }],
            }],
            system_instruction: request.system_prompt.as_ref().map(|sp| GeminiContent {
                role: None,
                parts: vec![GeminiPart { text: sp.clone() }],
            }),
            generation_config: Some(GenerationConfig {
                max_output_tokens: request.max_tokens,
                temperature: request.temperature,
            }),
        };

        let response = self
            .client
            .post(&url)
            .json(&body)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await?;

        let status = response.status().as_u16();
        let body_text = response.text().await?;
        let response_body: GeminiResponse = serde_json::from_str(&body_text).map_err(|_| {
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
                status: error.code.unwrap_or(status),
                message: error.message,
            });
        }

        let content = response_body
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content.parts.into_iter().next())
            .map(|p| p.text)
            .unwrap_or_default();

        Ok(AIResponse {
            content,
            model: model.to_string(),
            provider: "gemini".to_string(),
            tokens_used: None,
        })
    }

    pub fn name(&self) -> &str {
        "Gemini"
    }

    pub fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn available_models(&self) -> Vec<AIModel> {
        vec![
            AIModel {
                id: "gemini-2.5-flash".to_string(),
                name: "Gemini 2.5 Flash".to_string(),
                provider: "gemini".to_string(),
                is_free: true,
                supports_vision: true,
            },
            AIModel {
                id: "gemini-2.5-pro".to_string(),
                name: "Gemini 2.5 Pro".to_string(),
                provider: "gemini".to_string(),
                is_free: false,
                supports_vision: true,
            },
        ]
    }
}
