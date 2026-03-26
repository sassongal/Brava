fn main() {
    // Link macOS ApplicationServices framework for AXIsProcessTrusted
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-lib=framework=ApplicationServices");

    tauri_build::build()
}
