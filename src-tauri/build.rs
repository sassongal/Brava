fn main() {
    // Link macOS frameworks for AXIsProcessTrusted and CGEventTap key monitoring
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
        println!("cargo:rustc-link-lib=framework=CoreFoundation");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=Carbon");
    }

    tauri_build::build()
}
