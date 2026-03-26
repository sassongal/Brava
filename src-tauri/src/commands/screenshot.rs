use crate::commands::clipboard::ClipboardState;
use crate::DatabaseState;
use tauri::{Manager, State};

#[tauri::command]
pub async fn take_screenshot(
    app: tauri::AppHandle,
    clipboard_state: State<'_, ClipboardState>,
    db: State<'_, DatabaseState>,
) -> Result<String, String> {
    use tauri::Emitter;

    // Determine screenshot directory
    let screenshots_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("screenshots");
    std::fs::create_dir_all(&screenshots_dir)
        .map_err(|e| format!("Failed to create screenshots dir: {}", e))?;

    // Generate filename
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("screenshot_{}.png", timestamp);
    let filepath = screenshots_dir.join(&filename);
    let filepath_str = filepath.to_string_lossy().to_string();

    // Take screenshot using platform-specific tool
    let status = if cfg!(target_os = "macos") {
        std::process::Command::new("screencapture")
            .args(["-i", &filepath_str])
            .status()
            .map_err(|e| format!("Failed to launch screencapture: {}", e))?
    } else if cfg!(target_os = "linux") {
        // Try gnome-screenshot first, fall back to scrot
        std::process::Command::new("gnome-screenshot")
            .args(["-a", "-f", &filepath_str])
            .status()
            .or_else(|_| {
                std::process::Command::new("scrot")
                    .args(["-s", "-f", &filepath_str])
                    .status()
            })
            .map_err(|e| format!("No screenshot tool found: {}", e))?
    } else {
        return Err("Screenshot not supported on this platform".to_string());
    };

    if !status.success() {
        return Err("Screenshot cancelled".to_string());
    }

    // Verify file was created
    if !filepath.exists() {
        return Err("Screenshot cancelled".to_string());
    }

    // Add to clipboard history
    if let Some(item) = clipboard_state.0.add_image(filepath_str.clone()) {
        if let Err(e) = db.0.save_clipboard_item(&item) {
            log::error!("Failed to persist screenshot: {}", e);
        }
        let _ = app.emit("clipboard-changed", &item);
    }

    Ok(filepath_str)
}
