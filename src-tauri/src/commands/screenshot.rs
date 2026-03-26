use crate::commands::clipboard::ClipboardState;
use crate::DatabaseState;
use serde::Deserialize;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

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
        let status = std::process::Command::new("screencapture")
            .args(["-x", &filepath_str])
            .status()
            .map_err(|e| format!("Failed to capture screen: {}", e))?;
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
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f");
    let filename = format!("screenshot_{}.png", timestamp);
    let filepath = screenshots_dir.join(&filename);
    let filepath_str = filepath.to_string_lossy().to_string();

    if let Some(data_url) = annotated_data_url {
        // Decode base64 data URL from canvas
        let base64_data = data_url
            .strip_prefix("data:image/png;base64,")
            .ok_or("Invalid data URL format")?;
        let bytes = base64_decode(base64_data)?;
        std::fs::write(&filepath, bytes)
            .map_err(|e| format!("Failed to save screenshot: {}", e))?;
    } else {
        // Crop from source
        let img = image::open(&source_path)
            .map_err(|e| format!("Failed to open source image: {}", e))?;
        let cropped = image::imageops::crop_imm(
            &img, region.x, region.y, region.width, region.height,
        ).to_image();
        cropped.save(&filepath)
            .map_err(|e| format!("Failed to save cropped screenshot: {}", e))?;
    }

    // Clean up temp full-screen capture
    let _ = std::fs::remove_file(&source_path);

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
    if let Some(path) = source_path {
        let _ = std::fs::remove_file(&path);
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
) -> Result<(), String> {
    use image::GenericImageView;

    let img = image::open(image_path)
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

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    static TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &b in input.as_bytes() {
        if b == b'=' || b == b'\n' || b == b'\r' || b == b' ' { continue; }
        let val = TABLE.iter().position(|&c| c == b)
            .ok_or_else(|| format!("Invalid base64 character: {}", b as char))? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(output)
}
