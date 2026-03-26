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
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
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
    } else if cfg!(target_os = "windows") {
        // Windows: launch Snipping Tool, then capture from clipboard
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "ms-screenclip:"])
            .status()
            .or_else(|_| {
                std::process::Command::new("snippingtool.exe")
                    .status()
            })
            .map_err(|e| format!("Failed to launch screenshot tool: {}", e))?;

        // Wait for user to complete selection (Snipping Tool saves to clipboard)
        std::thread::sleep(std::time::Duration::from_secs(5));

        // Read image from Windows clipboard and save to file
        let mut clip = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        if let Ok(img) = clip.get_image() {
            image::save_buffer(
                &filepath,
                &img.bytes,
                img.width as u32,
                img.height as u32,
                image::ColorType::Rgba8,
            ).map_err(|e| format!("Failed to save screenshot: {}", e))?;
        } else {
            return Err("Screenshot cancelled".to_string());
        }

        // Fake a success status for the flow below
        std::process::Command::new("cmd").args(["/C", "echo", "ok"]).status()
            .map_err(|e| format!("{}", e))?
    } else {
        return Err("Screenshot not supported on this platform".to_string());
    };

    // For non-Windows platforms, check exit status and file existence
    if !cfg!(target_os = "windows") {
        if !status.success() {
            return Err("Screenshot cancelled".to_string());
        }
    }

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
