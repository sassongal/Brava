# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Brava is a cross-platform desktop productivity toolkit built with **Tauri 2.0** (Rust backend + React/TypeScript frontend). It provides keyboard layout conversion (Hebrew/English/Arabic/Russian), clipboard history, text snippets, and AI-powered text tools.

## Commands

```bash
# Development (starts both Vite dev server on :1420 and Rust backend)
npm run tauri dev

# Build production app
npm run tauri build

# Frontend only (no Rust backend)
npm run dev

# Type-check frontend
tsc

# Run Rust tests
cd src-tauri && cargo test

# Check Rust compilation
cd src-tauri && cargo check

# Run a single Rust test
cd src-tauri && cargo test test_name
```

## Architecture

### Two-process model
- **Frontend** (`src/`): React 19 + TypeScript + Vite. Tab-based UI (clipboard, converter, snippets, AI tools, settings). No router — `App.tsx` switches views via `activeTab` state.
- **Backend** (`src-tauri/`): Rust. All core logic, platform integration, persistence. Communicates with frontend via Tauri IPC (`invoke`).

### Rust backend structure (`src-tauri/src/`)

| Module | Purpose |
|--------|---------|
| `commands/` | Tauri IPC handlers — thin layer that validates input and delegates to engine/ai/storage |
| `engine/` | Core business logic: `LayoutEngine` (char-map conversion), `ClipboardManager` (SHA256 dedup, categorization), `SnippetEngine` (Trie-based matching), `detector` (real-time wrong-layout detection), `hotkeys` |
| `ai/` | AI provider clients (Gemini, OpenAI, Claude, OpenRouter, Ollama). Each is a concrete type — no trait objects. Uses `reqwest` for HTTP. Common types in `provider.rs` (`AIRequest`, `AIResponse`, `AIError`) |
| `layouts/` | Keyboard layout definitions as `HashMap<char, char>` mappings. One file per language. Adding a language = adding one mapping file |
| `storage/` | `Database` (SQLite via rusqlite — clipboard history, snippets), `AppSettings` (user preferences) |

### State management
All Tauri state is registered in `lib.rs` via `.manage()`:
- `LayoutState(Mutex<LayoutEngine>)`
- `ClipboardState(Arc<ClipboardManager>)`
- `SnippetState(Mutex<SnippetEngine>)`
- `AIState` (provider config + API keys)
- `SettingsState(Mutex<AppSettings>)`

### Frontend patterns
- `useTauriCommand` hook wraps any Tauri `invoke` call with loading/error state
- `src/lib/tauri.ts` has Tauri API helpers
- Styling: CSS Modules + CSS Variables for dark/light theming (`src/styles/theme.css`)
- No state management library — component-local state + Tauri as source of truth

### Key design decisions
- **SQLite for all persistence** (except API keys) — single `brava.db` file in app data dir
- **OS keystore for API keys** (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Tauri events for streaming** — AI responses stream back via events, not polling
- **Data-driven layouts** — adding a keyboard layout requires only a new `HashMap<char, char>` file in `layouts/`
- **Clipboard dedup** uses SHA256 hashing

### IPC command registration
All commands are registered in `lib.rs` `invoke_handler`. When adding a new command:
1. Add the function in the appropriate `commands/*.rs` file
2. Register it in `lib.rs` `generate_handler![]` macro

## Prerequisites
- Rust 1.75+
- Node.js 20+
- macOS: Xcode Command Line Tools
- Windows: Visual Studio Build Tools + WebView2
- Linux: `libwebkit2gtk-4.1-dev librsvg2-dev libgtk-3-dev libayatana-appindicator3-dev libxdo-dev`
