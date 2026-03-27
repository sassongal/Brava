# Technology Stack

**Analysis Date:** 2026-03-27

## Languages

**Primary:**
- TypeScript ~5.8.3 — All frontend code (`src/`)
- Rust 2021 edition — All backend code (`src-tauri/src/`)

**Secondary:**
- CSS — Styling (`src/styles/`)
- HTML — Entry point (`index.html`)

## Runtime

**Environment:**
- Tauri 2.x — Desktop runtime (Rust backend + WebView frontend)
- Node.js 20+ — Frontend build/dev tooling
- Target: ES2020 (TypeScript compilation)

**Package Manager:**
- npm — `package-lock.json` present
- Cargo — `Cargo.lock` present (Rust dependencies)

## Frameworks

**Core:**
- React 19.1.0 — Frontend UI (`src/`)
- Tauri 2.x — Desktop app framework (`src-tauri/`)

**Build/Dev:**
- Vite 7.0.4 — Frontend bundler with React plugin
- TypeScript ~5.8.3 — Compilation and type checking
- Cargo/rustc — Rust compilation

**Testing:**
- Rust built-in `#[test]` — Unit tests in `src-tauri/src/engine/*.rs` and `src-tauri/src/ai/provider.rs`

## Key Dependencies

**Frontend (Critical):**
- `@tauri-apps/api@^2` — IPC bridge to Rust backend
- `@tauri-apps/plugin-dialog` — Native file dialogs
- `@tauri-apps/plugin-opener` — Open system URLs/apps
- `@tauri-apps/plugin-updater` — Auto-update mechanism

**Backend (Critical):**
- `tauri@2` — App framework (tray-icon, macos-private-api features)
- `tokio@1` — Async runtime (full features)
- `reqwest@0.12` — HTTP client (json, stream, multipart)
- `rusqlite@0.31` — SQLite database (bundled)
- `arboard@3` — Cross-platform clipboard access
- `keyring@3` — OS keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- `tauri-plugin-global-shortcut@2` — Global keyboard shortcuts
- `tauri-plugin-updater@2` — Update checking
- `image@0.25` — PNG image support

**Platform-specific:**
- `rdev@0.5` — Key monitoring (Windows/Linux only, not macOS)
- `windows-sys@0.59` — Windows power management APIs

## Configuration

**Environment:**
- `env.local` — GitHub access token (gitignored)
- API keys stored in OS Keyring, never in files
- Settings stored in SQLite as JSON blob

**Build:**
- `tauri.conf.json` — Tauri app config (CSP, window, bundle, updater)
- `tsconfig.json` — TypeScript strict mode, ES2020, react-jsx
- `vite.config.ts` — Dev server on port 1420

## Platform Requirements

**Development:**
- macOS/Windows/Linux
- Rust 1.75+, Node.js 20+
- macOS: Xcode Command Line Tools
- Linux: libwebkit2gtk-4.1-dev, libgtk-3-dev, libayatana-appindicator3-dev, libxdo-dev

**Production:**
- macOS: .app bundle + .dmg installer
- Windows: .msi installer
- Linux: .deb + .AppImage
- Auto-update via GitHub Releases

---

*Stack analysis: 2026-03-27*
*Update after major dependency changes*
