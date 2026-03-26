use crate::commands::ai::AIState;
use tauri::State;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: String,
    pub duration_seconds: Option<f64>,
}

/// Transcribe a media file using OpenAI Whisper API
#[tauri::command]
pub async fn transcribe_media(
    file_path: &str,
    state: State<'_, AIState>,
) -> Result<TranscriptionResult, String> {
    // Get OpenAI API key
    let api_key = {
        let provider = state.openai.lock().unwrap_or_else(|e| e.into_inner());
        provider.get_api_key().ok_or_else(|| "OpenAI API key required for transcription".to_string())?
    };

    // Read the file
    let file_bytes = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let file_name = std::path::Path::new(file_path)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "audio.mp3".to_string());

    // Check file size — Whisper API limit is 25MB
    let file_size_mb = file_bytes.len() as f64 / (1024.0 * 1024.0);

    if file_size_mb > 25.0 {
        return Err(format!(
            "File is {:.1}MB. OpenAI Whisper limit is 25MB. Please use a shorter clip or compress the file.",
            file_size_mb
        ));
    }

    // Build multipart form request
    let client = reqwest::Client::new();
    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(file_name)
        .mime_str("audio/mpeg")
        .map_err(|e| format!("Failed to create form part: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-1")
        .text("response_format", "verbose_json");

    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Transcription request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Whisper API error: {}", error_text));
    }

    let json: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let text = json["text"].as_str().unwrap_or("").to_string();
    let language = json["language"].as_str().unwrap_or("unknown").to_string();
    let duration = json["duration"].as_f64();

    Ok(TranscriptionResult {
        text,
        language,
        duration_seconds: duration,
    })
}
