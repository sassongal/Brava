use crate::commands::ai::AIState;
use crate::storage::database::{Database, TranscriptionJobRow};
use crate::DatabaseState;
use tauri::State;
use serde::{Serialize, Deserialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri::Manager;

#[derive(Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: String,
    pub duration_seconds: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TranscriptionJobRecord {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub status: String,
    pub text: Option<String>,
    pub language: Option<String>,
    pub duration_seconds: Option<f64>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TranscriptionJobEvent {
    pub id: String,
    pub status: String,
    pub file_name: String,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct EnqueueTranscriptionResponse {
    pub job_id: String,
    pub status: String,
}

#[derive(Clone)]
pub struct TranscriptionTask {
    pub job_id: String,
    pub file_path: String,
}

pub struct TranscriptionQueueState {
    pub queue: Arc<Mutex<VecDeque<TranscriptionTask>>>,
    pub worker_running: Arc<Mutex<bool>>,
}

impl Default for TranscriptionQueueState {
    fn default() -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            worker_running: Arc::new(Mutex::new(false)),
        }
    }
}

/// Legacy synchronous transcription command kept for compatibility.
#[tauri::command]
pub async fn transcribe_media(file_path: &str, state: State<'_, AIState>) -> Result<TranscriptionResult, String> {
    let api_key = {
        let provider = state.openai.lock().unwrap_or_else(|e| e.into_inner());
        provider
            .get_api_key()
            .ok_or_else(|| "OpenAI API key required for transcription".to_string())?
    };
    transcribe_media_internal(file_path, &api_key).await
}

#[tauri::command]
pub async fn enqueue_transcription(
    file_path: &str,
    app: tauri::AppHandle,
    _state: State<'_, AIState>,
    db: State<'_, DatabaseState>,
    queue_state: State<'_, TranscriptionQueueState>,
) -> Result<EnqueueTranscriptionResponse, String> {
    let normalized = std::fs::canonicalize(file_path)
        .map_err(|e| format!("Invalid file path: {}", e))?;
    let normalized_str = normalized.to_string_lossy().to_string();
    let file_name = normalized
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "media".to_string());

    let job_id = uuid::Uuid::new_v4().to_string();
    db.0.insert_transcription_job(&job_id, &file_name, &normalized_str)?;
    emit_job_update(&app, &job_id, "queued", &file_name, None);

    {
        let mut queue = queue_state.queue.lock().map_err(|e| e.to_string())?;
        queue.push_back(TranscriptionTask {
            job_id: job_id.clone(),
            file_path: normalized_str,
        });
    }

    start_worker_if_needed(
        app,
        db.0.clone(),
        queue_state.inner().queue.clone(),
        queue_state.inner().worker_running.clone(),
    );

    Ok(EnqueueTranscriptionResponse {
        job_id,
        status: "queued".to_string(),
    })
}

#[tauri::command]
pub fn list_transcriptions(
    limit: Option<usize>,
    offset: Option<usize>,
    db: State<'_, DatabaseState>,
) -> Result<Vec<TranscriptionJobRecord>, String> {
    let bounded_limit = limit.unwrap_or(50).min(200);
    let bounded_offset = offset.unwrap_or(0).min(10_000);
    let rows = db.0.list_transcription_jobs(bounded_limit, bounded_offset)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

fn emit_job_update(app: &tauri::AppHandle, id: &str, status: &str, file_name: &str, message: Option<String>) {
    let event = TranscriptionJobEvent {
        id: id.to_string(),
        status: status.to_string(),
        file_name: file_name.to_string(),
        message,
    };
    let _ = app.emit("transcription-job-updated", event.clone());
    if status == "completed" {
        let _ = app.emit("transcription-completed", event);
    }
}

fn start_worker_if_needed(
    app: tauri::AppHandle,
    db: Arc<Database>,
    queue: Arc<Mutex<VecDeque<TranscriptionTask>>>,
    worker_running: Arc<Mutex<bool>>,
) {
    let should_start = {
        let mut running = worker_running.lock().unwrap_or_else(|e| e.into_inner());
        if *running {
            false
        } else {
            *running = true;
            true
        }
    };

    if !should_start {
        return;
    }

    tauri::async_runtime::spawn(async move {
        loop {
            let task = {
                let mut q = queue.lock().unwrap_or_else(|e| e.into_inner());
                q.pop_front()
            };

            let Some(task) = task else {
                {
                    let mut running = worker_running.lock().unwrap_or_else(|e| e.into_inner());
                    *running = false;
                }

                // A task may have been enqueued while we were winding down.
                // Re-check and continue processing if needed.
                let has_pending = {
                    let q = queue.lock().unwrap_or_else(|e| e.into_inner());
                    !q.is_empty()
                };
                if has_pending {
                    let mut running = worker_running.lock().unwrap_or_else(|e| e.into_inner());
                    if !*running {
                        *running = true;
                        continue;
                    }
                }
                break;
            };

            let file_name = std::path::Path::new(&task.file_path)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "media".to_string());

            let _ = db.update_transcription_job_status(&task.job_id, "processing");
            emit_job_update(&app, &task.job_id, "processing", &file_name, None);

            let api_key: Result<String, String> = app
                .try_state::<AIState>()
                .ok_or_else(|| "AI state unavailable".to_string())
                .and_then(|state| {
                    let provider = state.openai.lock().map_err(|e| e.to_string())?;
                    provider
                        .get_api_key()
                        .ok_or_else(|| "OpenAI API key required for transcription".to_string())
                });

            match api_key {
                Ok(api_key) => match transcribe_media_internal(&task.file_path, &api_key).await {
                Ok(res) => {
                    let _ = db.complete_transcription_job(
                        &task.job_id,
                        &res.text,
                        &res.language,
                        res.duration_seconds,
                    );
                    emit_job_update(&app, &task.job_id, "completed", &file_name, Some("Transcription complete".to_string()));
                }
                Err(err) => {
                    let _ = db.fail_transcription_job(&task.job_id, &err);
                    emit_job_update(&app, &task.job_id, "failed", &file_name, Some(err));
                }
                },
                Err(err) => {
                    let _ = db.fail_transcription_job(&task.job_id, &err);
                    emit_job_update(&app, &task.job_id, "failed", &file_name, Some(err));
                }
            }
        }

        let mut running = worker_running.lock().unwrap_or_else(|e| e.into_inner());
        *running = false;
    });
}

async fn transcribe_media_internal(
    file_path: &str,
    api_key: &str,
) -> Result<TranscriptionResult, String> {
    let extension = std::path::Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let allowed_ext = ["mp3", "wav", "m4a", "ogg", "flac", "mp4", "mov", "avi", "mkv", "webm"];
    if !allowed_ext.contains(&extension.as_str()) {
        return Err("Unsupported media format".to_string());
    }

    // Check file size before reading
    let metadata = std::fs::metadata(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let file_size_mb = metadata.len() as f64 / (1024.0 * 1024.0);
    if file_size_mb > 25.0 {
        return Err(format!(
            "File is {:.1}MB. OpenAI Whisper limit is 25MB.",
            file_size_mb
        ));
    }

    // Read the file
    let file_bytes = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let file_name = std::path::Path::new(file_path)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "audio.mp3".to_string());

    // Derive MIME type from extension
    let mime_type = match extension.as_str() {
        "wav" => "audio/wav",
        "m4a" | "aac" => "audio/mp4",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "mp4" | "mov" => "video/mp4",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        _ => "audio/mpeg",
    };

    // Build multipart form request
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(file_name)
        .mime_str(mime_type)
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
        let status = response.status().as_u16();
        let error_text = response.text().await.unwrap_or_default();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&error_text) {
            let message = value.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Transcription provider rejected the request");
            return Err(format!("Whisper API error ({}): {}", status, message));
        }
        let short: String = error_text.chars().take(240).collect();
        return Err(format!("Whisper API error ({}): {}", status, short));
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

impl From<TranscriptionJobRow> for TranscriptionJobRecord {
    fn from(value: TranscriptionJobRow) -> Self {
        Self {
            id: value.id,
            file_name: value.file_name,
            file_path: value.file_path,
            status: value.status,
            text: value.text,
            language: value.language,
            duration_seconds: value.duration_seconds,
            error_message: value.error_message,
            created_at: value.created_at,
            completed_at: value.completed_at,
        }
    }
}
