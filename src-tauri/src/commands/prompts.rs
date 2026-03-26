use crate::DatabaseState;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct SavedPrompt {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub category: Option<String>,
    pub use_count: u32,
}

#[tauri::command]
pub fn get_saved_prompts(db: State<'_, DatabaseState>) -> Result<Vec<SavedPrompt>, String> {
    let rows = db.0.load_prompts()?;
    Ok(rows
        .into_iter()
        .map(|(id, title, prompt, category, use_count)| SavedPrompt {
            id,
            title,
            prompt,
            category,
            use_count,
        })
        .collect())
}

#[tauri::command]
pub fn save_prompt(
    title: &str,
    prompt: &str,
    category: Option<&str>,
    db: State<'_, DatabaseState>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    db.0.save_prompt(&id, title, prompt, category)?;
    Ok(id)
}

#[tauri::command]
pub fn delete_saved_prompt(id: &str, db: State<'_, DatabaseState>) -> Result<(), String> {
    db.0.delete_prompt(id)
}

#[tauri::command]
pub fn use_saved_prompt(id: &str, db: State<'_, DatabaseState>) -> Result<(), String> {
    db.0.increment_prompt_usage(id)
}
