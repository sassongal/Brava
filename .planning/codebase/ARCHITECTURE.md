# Architecture

**Analysis Date:** 2026-03-27

## Pattern Overview

**Overall:** Cross-platform Desktop Application (Tauri 2 — Rust backend + React frontend)

**Key Characteristics:**
- Two-process model: Rust native backend + WebView frontend
- IPC bridge via Tauri commands (`invoke`) and events (`emit`/`listen`)
- Background threads for clipboard monitoring and keyboard detection
- SQLite for all persistence, OS keyring for secrets
- Plugin-based AI with 5 swappable providers

## Layers

**Frontend Layer** (`src/`):
- Purpose: UI rendering, user interaction, event listening
- Contains: React components, hooks, CSS, i18n, sound effects
- Depends on: Tauri IPC bridge only
- Used by: User directly (WebView)

**Commands Layer** (`src-tauri/src/commands/`):
- Purpose: IPC handlers — thin bridge between frontend and engine
- Contains: 9 modules (layout, clipboard, snippets, ai, settings, hotkeys, screenshot, transcription, prompts)
- Depends on: Engine layer, Storage layer, AI layer
- Used by: Frontend via `invoke()`

**Engine Layer** (`src-tauri/src/engine/`):
- Purpose: Core business logic, pure computation
- Contains: LayoutEngine, ClipboardManager, SnippetEngine, HotkeyManager, WrongLayoutDetector
- Depends on: Standard library only (no Tauri deps)
- Used by: Commands layer

**Storage Layer** (`src-tauri/src/storage/`):
- Purpose: Data persistence
- Contains: SQLite database abstraction, AppSettings struct
- Depends on: rusqlite, serde
- Used by: Commands layer, lib.rs setup

**AI Layer** (`src-tauri/src/ai/`):
- Purpose: LLM provider integrations
- Contains: 5 providers (Gemini, OpenAI, Claude, OpenRouter, Ollama)
- Depends on: reqwest for HTTP
- Used by: Commands layer

## Data Flow

**Typical IPC Command:**
1. User action in React component
2. `invoke("command_name", { params })` via `src/lib/tauri.ts`
3. Tauri router matches command in `invoke_handler`
4. `#[tauri::command]` handler executes with state injection
5. Engine/storage processes request
6. Result serialized back to frontend as JSON

**Background Monitoring (clipboard):**
1. `clipboard_monitor()` thread spawned on startup (`src-tauri/src/lib.rs`)
2. Polls system clipboard via `arboard` every 500ms
3. On change: creates `ClipboardItem`, categorizes, persists to SQLite
4. Emits `clipboard-changed` event
5. Frontend components listen and update UI

**State Management:**
- Rust: `app.manage()` registers shared state (Mutex-wrapped)
- Frontend: React `useState` + `useRef` for local, Tauri events for cross-component

## Key Abstractions

**Tauri State Pattern:**
- Purpose: Dependency injection for command handlers
- Examples: `DatabaseState(Arc<Database>)`, `LayoutState(Mutex<LayoutEngine>)`, `AIState`
- Pattern: Registered in `lib.rs` setup, accessed via `State<'_, T>` parameter

**AI Provider Pattern:**
- Purpose: Swappable LLM backends with common interface
- Examples: `GeminiProvider`, `OpenAIProvider`, `ClaudeProvider`
- Pattern: Each implements `complete()`, `set_api_key()`, `available_models()`

**Command-Engine Separation:**
- Purpose: Keep IPC handlers thin, business logic testable
- Pattern: Commands validate input + delegate to engine, engine is pure logic

## Entry Points

**Frontend:**
- `src/main.tsx` — React root, routes to ScreenshotEditor or App
- `src/App.tsx` — 7-tab UI, hotkey listeners, event handlers

**Backend:**
- `src-tauri/src/main.rs` — calls `brava_lib::run()`
- `src-tauri/src/lib.rs` — full app setup (DB, state, plugins, tray, hotkeys, background threads)

## Error Handling

**Strategy:** Result-based in Rust, try-catch in TypeScript, toast notifications for user-facing errors

**Patterns:**
- Rust commands return `Result<T, String>` — errors serialized to frontend
- `.unwrap_or_else(|e| e.into_inner())` on poisoned mutexes (recovers instead of panicking)
- Frontend shows `showToast(error, "error")` for user-facing failures

## Cross-Cutting Concerns

**Logging:** `log` + `env_logger` crates (Rust), `console.error` (frontend)

**i18n:** Custom system in `src/lib/i18n.ts` — 200+ keys, Hebrew + English, RTL support

**Security:** API keys in OS keyring, CSP in `tauri.conf.json`, path validation for screenshots

---

*Architecture analysis: 2026-03-27*
*Update when major patterns change*
