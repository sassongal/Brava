use super::provider::{AIError, AIModel, AIRequest, AIResponse};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const DEFAULT_ENDPOINT: &str = "http://localhost:11434";

#[derive(Clone)]
pub struct OllamaProvider {
    client: Client,
    endpoint: String,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    stream: bool,
    options: Option<OllamaOptions>,
}

#[derive(Serialize)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModelInfo>>,
}

#[derive(Deserialize)]
struct OllamaModelInfo {
    name: String,
}

impl OllamaProvider {
    pub fn new(endpoint: Option<String>) -> Self {
        OllamaProvider {
            client: Client::new(),
            endpoint: endpoint.unwrap_or_else(|| DEFAULT_ENDPOINT.to_string()),
        }
    }

    pub fn set_endpoint(&mut self, endpoint: String) {
        self.endpoint = endpoint;
    }

    pub fn get_endpoint(&self) -> String {
        self.endpoint.clone()
    }

    pub async fn complete(&self, request: &AIRequest) -> Result<AIResponse, AIError> {
        let model = request.model.as_deref().unwrap_or("llama3.2");
        let url = format!("{}/api/generate", self.endpoint);

        let body = OllamaRequest {
            model: model.to_string(),
            prompt: request.prompt.clone(),
            system: request.system_prompt.clone(),
            stream: false,
            options: Some(OllamaOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
            }),
        };

        let response = self
            .client
            .post(&url)
            .json(&body)
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| {
                if e.is_connect() {
                    AIError::Unavailable("Ollama is not running. Start it with: ollama serve".to_string())
                } else {
                    AIError::Http(e)
                }
            })?;

        let response_body: OllamaResponse = response.json().await?;

        if let Some(error) = response_body.error {
            return Err(AIError::Api {
                status: 500,
                message: error,
            });
        }

        let content = response_body.response.unwrap_or_default();

        Ok(AIResponse {
            content,
            model: model.to_string(),
            provider: "ollama".to_string(),
            tokens_used: None,
        })
    }

    /// List locally available models
    pub async fn list_local_models(&self) -> Result<Vec<AIModel>, AIError> {
        let url = format!("{}/api/tags", self.endpoint);

        let response = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| {
                if e.is_connect() {
                    AIError::Unavailable("Ollama is not running".to_string())
                } else {
                    AIError::Http(e)
                }
            })?;

        let tags: OllamaTagsResponse = response.json().await?;

        Ok(tags
            .models
            .unwrap_or_default()
            .into_iter()
            .map(|m| AIModel {
                id: m.name.clone(),
                name: m.name,
                provider: "ollama".to_string(),
                is_free: true,
                supports_vision: false,
            })
            .collect())
    }

    pub fn name(&self) -> &str {
        "Ollama"
    }

    /// Ollama is always "configured" since it's local - just might not be running
    pub fn is_configured(&self) -> bool {
        true
    }

    pub fn available_models(&self) -> Vec<AIModel> {
        // Static list of common models - actual list fetched via list_local_models()
        vec![
            AIModel {
                id: "llama3.2".to_string(),
                name: "Llama 3.2 (Local)".to_string(),
                provider: "ollama".to_string(),
                is_free: true,
                supports_vision: false,
            },
            AIModel {
                id: "mistral".to_string(),
                name: "Mistral (Local)".to_string(),
                provider: "ollama".to_string(),
                is_free: true,
                supports_vision: false,
            },
        ]
    }
}
