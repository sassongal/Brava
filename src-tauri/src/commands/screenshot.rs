use crate::commands::clipboard::ClipboardState;
use crate::DatabaseState;
use serde::Deserialize;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Capture the full screen silently (no user interaction)
#[tauri::command]
pub async fn capture_full_screen(app: tauri::AppHandle) -> Result<String, String> {
    let screenshots_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("screenshots");
    std::fs::create_dir_all(&screenshots_dir)
        .map_err(|e| format!("Failed to create screenshots dir: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let filename = format!("fullscreen_{}.png", timestamp);
    let filepath = screenshots_dir.join(&filename);
    let filepath_str = filepath.to_string_lossy().to_string();

    if cfg!(target_os = "macos") {
        if !is_screen_recording_allowed() {
            return Err("Screen Recording permission is required. Enable it in System Settings > Privacy & Security > Screen Recording.".to_string());
        }
        let mut hid_main = false;
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
            tokio::time::sleep(Duration::from_millis(120)).await;
            hid_main = true;
        }
        let status = std::process::Command::new("screencapture")
            .args(["-x", &filepath_str])
            .status()
            .map_err(|e| format!("Failed to capture screen: {}", e))?;
        if hid_main {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
            }
        }
        if !status.success() {
            return Err("Screen capture failed".to_string());
        }
    } else if cfg!(target_os = "linux") {
        let status = std::process::Command::new("scrot")
            .arg(&filepath_str)
            .status()
            .or_else(|_| {
                std::process::Command::new("gnome-screenshot")
                    .args(["-f", &filepath_str])
                    .status()
            })
            .map_err(|e| format!("No screenshot tool found: {}", e))?;
        if !status.success() {
            return Err("Screen capture failed".to_string());
        }
    } else if cfg!(target_os = "windows") {
        // Safety: filepath is generated from timestamp + UUID, contains no special characters.
        // Validate defensively anyway to prevent PowerShell injection.
        if filepath_str.contains('$') || filepath_str.contains('`') || filepath_str.contains(')') {
            return Err("Screenshot path contains special characters".to_string());
        }
        let ps_script = format!(
            r#"Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size); $bitmap.Save('{}'); $graphics.Dispose(); $bitmap.Dispose()"#,
            filepath_str.replace('\'', "''")
        );
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .status()
            .map_err(|e| format!("Failed to capture screen: {}", e))?;
        if !status.success() {
            return Err("Screen capture failed".to_string());
        }
    } else {
        return Err("Screenshot not supported on this platform".to_string());
    }

    if !filepath.exists() {
        return Err("Screen capture failed - no file created".to_string());
    }

    Ok(filepath_str)
}
/// Open the screenshot editor window
#[tauri::command]
pub async fn open_screenshot_editor(
    app: tauri::AppHandle,
    image_path: String,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("screenshot-editor") {
        let _ = existing.close();
        std::thread::sleep(Duration::from_millis(150));
    }
    let url = format!("index.html?image={}", urlencoding::encode(&image_path));
    let _window = WebviewWindowBuilder::new(
        &app,
        "screenshot-editor",
        WebviewUrl::App(url.into()),
    )
    .title("Brava Screenshot")
    .fullscreen(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .build()
    .map_err(|e| format!("Failed to open screenshot editor: {}", e))?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn is_screen_recording_allowed() -> bool {
    unsafe extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}

#[cfg(not(target_os = "macos"))]
fn is_screen_recording_allowed() -> bool {
    true
}

#[derive(Deserialize)]
pub struct CropRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Crop and save the selected screenshot region
#[tauri::command]
pub async fn save_screenshot_region(
    app: tauri::AppHandle,
    source_path: String,
    region: CropRegion,
    annotated_data_url: Option<String>,
    clipboard_state: State<'_, ClipboardState>,
    db: State<'_, DatabaseState>,
) -> Result<String, String> {
    use tauri::Emitter;

    let screenshots_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("screenshots");
    std::fs::create_dir_all(&screenshots_dir)
        .map_err(|e| format!("Failed to create screenshots dir: {}", e))?;
    let validated_source = validate_path_in_screenshots_dir(&screenshots_dir, &source_path)?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let filename = format!("screenshot_{}.png", timestamp);
    let filepath = screenshots_dir.join(&filename);
    let filepath_str = filepath.to_string_lossy().to_string();

    if let Some(data_url) = annotated_data_url {
        if data_url.len() > 30_000_000 {
            return Err("Annotated image is too large".to_string());
        }
        // Decode base64 data URL from canvas
        let base64_data = data_url
            .strip_prefix("data:image/png;base64,")
            .ok_or("Invalid data URL format")?;
        let bytes = base64_decode(base64_data)?;
        if bytes.len() > 20_000_000 {
            return Err("Annotated PNG exceeds size limit".to_string());
        }
        std::fs::write(&filepath, bytes)
            .map_err(|e| format!("Failed to save screenshot: {}", e))?;
    } else {
        // Crop from source
        let img = image::open(&validated_source)
            .map_err(|e| format!("Failed to open source image: {}", e))?;
        if region.width == 0 || region.height == 0 {
            return Err("Invalid crop region size".to_string());
        }
        let max_w = img.width();
        let max_h = img.height();
        if region.x >= max_w
            || region.y >= max_h
            || region.x.saturating_add(region.width) > max_w
            || region.y.saturating_add(region.height) > max_h
        {
            return Err("Crop region is out of image bounds".to_string());
        }
        let cropped = image::imageops::crop_imm(
            &img, region.x, region.y, region.width, region.height,
        ).to_image();
        cropped.save(&filepath)
            .map_err(|e| format!("Failed to save cropped screenshot: {}", e))?;
    }

    // Clean up temp full-screen capture
    let _ = std::fs::remove_file(&validated_source);

    // Add to clipboard history
    if let Some(item) = clipboard_state.0.add_image(filepath_str.clone()) {
        if let Err(e) = db.0.save_clipboard_item(&item) {
            log::error!("Failed to persist screenshot: {}", e);
        }
        let _ = app.emit("clipboard-changed", &item);
    }

    // Close the screenshot editor window
    if let Some(window) = app.get_webview_window("screenshot-editor") {
        let _ = window.close();
    }

    Ok(filepath_str)
}

/// Cancel screenshot and close editor
#[tauri::command]
pub async fn cancel_screenshot(
    app: tauri::AppHandle,
    source_path: Option<String>,
) -> Result<(), String> {
    let screenshots_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("screenshots");
    std::fs::create_dir_all(&screenshots_dir)
        .map_err(|e| format!("Failed to create screenshots dir: {}", e))?;
    if let Some(path) = source_path {
        if let Ok(validated) = validate_path_in_screenshots_dir(&screenshots_dir, &path) {
            let _ = std::fs::remove_file(validated);
        }
    }
    if let Some(window) = app.get_webview_window("screenshot-editor") {
        let _ = window.close();
    }
    Ok(())
}

/// Copy an image file to the system clipboard
#[tauri::command]
pub fn copy_screenshot_to_clipboard(
    image_path: &str,
    clipboard_state: State<'_, ClipboardState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use image::GenericImageView;
    let screenshots_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("screenshots");
    let validated_path = validate_path_in_screenshots_dir(&screenshots_dir, image_path)?;

    let img = image::open(validated_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    let rgba = img.to_rgba8();
    let (width, height) = img.dimensions();

    let img_data = arboard::ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
    };

    clipboard_state.0.set_skip(&format!("__image_{}x{}", width, height));

    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;
    clipboard.set_image(img_data)
        .map_err(|e| format!("Failed to write image to clipboard: {}", e))
}

/// Save a data URL (base64 PNG) to an arbitrary path chosen by the user
#[tauri::command]
pub async fn save_data_url_to_path(
    data_url: String,
    dest_path: String,
) -> Result<(), String> {
    if data_url.len() > 30_000_000 {
        return Err("Image data is too large".to_string());
    }
    let base64_data = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("Invalid data URL format")?;
    let bytes = base64_decode(base64_data)?;
    if bytes.len() > 20_000_000 {
        return Err("PNG exceeds size limit".to_string());
    }
    std::fs::write(&dest_path, bytes)
        .map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(())
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(input)
        .map_err(|e| format!("Base64 decode error: {}", e))
}

fn validate_path_in_screenshots_dir(base_dir: &Path, candidate: &str) -> Result<PathBuf, String> {
    let canonical_base = std::fs::canonicalize(base_dir)
        .map_err(|e| format!("Failed to resolve screenshots dir: {}", e))?;
    let canonical_candidate = std::fs::canonicalize(candidate)
        .map_err(|e| format!("Invalid screenshot path: {}", e))?;
    if !canonical_candidate.starts_with(&canonical_base) {
        return Err("Path must be within screenshots directory".to_string());
    }
    Ok(canonical_candidate)
}
