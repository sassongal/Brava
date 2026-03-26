# Brava — Cursor Development Prompt

You are continuing development on **Brava**, a cross-platform productivity toolkit built with **Tauri 2 + Rust + React + TypeScript**. The project foundation is complete — all modules compile, the UI renders, and the architecture is solid. Your job is to make every feature fully functional end-to-end.

## Project Location
`/Users/galsasson/Brava` (clone from https://github.com/sassongal/Brava)

## What Already Exists (Phase 1 — DONE)
- Rust core: layout engine, clipboard manager, snippet trie, AI providers, SQLite storage, hotkey manager, wrong-layout detector
- React frontend: 5-tab UI (Clipboard, Converter, Snippets, AI Tools, Settings), onboarding wizard, dark/light theme
- Tauri IPC: 30+ commands bridging Rust to React
- AI providers: Gemini, OpenAI, Claude, OpenRouter, Ollama (API clients built, not yet wired to settings persistence)
- Keyboard layouts: Hebrew, English, Arabic, Russian (data-driven, extensible)

## What Needs To Be Done (in priority order)

### Priority 1 — Make Core Features Work End-to-End

**1. Clipboard Monitoring (background polling)**
- File: `src-tauri/src/lib.rs` + `src-tauri/src/engine/clipboard.rs`
- Add a background thread/task that polls the system clipboard via `arboard` every 500ms
- On change: create `ClipboardItem`, auto-categorize, save to SQLite via `storage/database.rs`, emit Tauri event to frontend
- Frontend (`src/components/ClipboardHistory.tsx`) already polls via `getClipboardItems` — connect it to real data
- Wire clipboard persistence: load history from SQLite on startup, save new items as they arrive

**2. Snippet Expansion (keystroke monitoring)**
- Add `rdev` crate to `Cargo.toml` for cross-platform keyboard listening
- Monitor keystrokes globally, maintain a buffer, match against `SnippetEngine.match_buffer()`
- On match: simulate backspaces to delete trigger, then paste expanded content via `arboard` + simulated Cmd+V
- This is the hardest feature — test carefully on macOS, handle edge cases (focus changes, modifier keys)

**3. Global Hotkeys**
- Add `global-hotkey` crate (from tauri-apps) or use `tauri-plugin-global-shortcut`
- Register hotkeys from `engine/hotkeys.rs` defaults: Cmd+Shift+T (convert), Cmd+Shift+V (show window), Cmd+Shift+P (enhance), Cmd+Shift+L (translate)
- On hotkey press: read selected text (via clipboard trick: Cmd+C, read clipboard, process, paste back), perform action, show result
- Wire to frontend via Tauri events

**4. System Tray**
- Tauri config already has `trayIcon` configured
- Add tray menu in `lib.rs`: Show/Hide Window, Convert Selection, Quick Clipboard (last 5 items), Settings, Quit
- Left-click: toggle main window
- Right-click: show context menu
- Update tray icon when keyboard lock is active

**5. Settings Persistence**
- Wire `storage/database.rs` + `storage/settings.rs` to actually load/save on startup and settings change
- Store API keys securely (use `keyring` crate for OS keystore — macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Load API keys into AI providers on startup
- Save/restore hotkey bindings, theme preference, clipboard settings

**6. AI Features — Full Integration**
- Ensure all 5 providers work end-to-end: user enters API key in Settings → key saved → provider activated → enhance/translate/chat works
- Add error handling: show toast notifications on API errors, rate limits, missing keys
- Add loading states in UI while AI is processing
- Test with real API keys for each provider

### Priority 2 — Feature Parity with JoyaFix

**7. Keyboard Lock ("Cleaner")**
- Use `rdev` to intercept and block all keyboard events when locked
- Show a fullscreen overlay with timer and unlock instructions
- Add timer option (30s, 1m, 5m) from settings
- Update tray icon with lock badge when active

**8. Smart Translation**
- `commands/ai.rs` already has `ai_translate` — wire it to a hotkey (Cmd+Shift+L)
- Auto-detect source language from text content
- Show result as a toast or replace selected text

**9. Prompt Enhancer — Hotkey Integration**
- Cmd+Shift+P: grab selected text → send to `ai_enhance_prompt` → replace selection with result
- Show brief loading indicator while processing
- Add a review step: show original vs enhanced, let user accept/reject

**10. Voice Input**
- Use `cpal` crate for cross-platform audio capture
- Use Whisper API (OpenAI) or local Whisper model for transcription
- Show recording indicator in UI
- Paste transcribed text at cursor position

**11. Caffeine Mode (Prevent Sleep)**
- macOS: use `caffeinate` command or IOKit framework
- Windows: use `SetThreadExecutionState`
- Linux: use `systemd-inhibit` or D-Bus
- Toggle from tray menu and settings

### Priority 3 — Polish & Quality

**12. Real-time Wrong-Layout Detection**
- `engine/detector.rs` has the logic — wire it to the keystroke monitor from step 2
- When detection confidence > 70%, show a subtle notification: "Did you mean to type in English?"
- One-click fix: convert the buffer and replace

**13. Onboarding Improvements**
- Add permission request screens (Accessibility on macOS for keystroke monitoring)
- Add API key setup step during onboarding
- Test first-run experience end-to-end

**14. Toast Notification System**
- Add a React toast component (bottom-right corner)
- Show toasts for: conversion complete, clipboard saved, snippet expanded, AI response ready, errors
- Auto-dismiss after 3 seconds

**15. Search & Filtering Polish**
- Clipboard: add date range filter, sort by frequency/recency
- Snippets: add search by trigger or content
- Fuzzy search using string similarity

**16. Export/Import**
- Export settings + snippets + prompt library as JSON
- Import from file
- Add to Settings view

## Technical Guidelines

### Build & Test Commands
```bash
npm run tauri dev          # Dev mode with hot reload
npm run tauri build        # Production build (.app / .msi / .deb)
cargo test --manifest-path src-tauri/Cargo.toml   # Run Rust tests
npx tsc --noEmit           # TypeScript type check
```

### Architecture Rules
- All business logic in Rust (`src-tauri/src/engine/`), never in React
- React only handles UI rendering and calls Tauri commands via `src/lib/tauri.ts`
- New Tauri commands go in `src-tauri/src/commands/`, registered in `lib.rs`
- New types must be added to both Rust (serde) and TypeScript (`src/lib/tauri.ts`)
- Use Tauri events (`app.emit()`) for backend-to-frontend notifications (clipboard changes, hotkey presses)
- API keys in OS keystore via `keyring` crate, never in plaintext

### Key Dependencies to Add
```toml
# Add to src-tauri/Cargo.toml [dependencies]
rdev = "0.5"                    # Cross-platform keyboard/mouse events
keyring = "2"                   # OS keystore (macOS Keychain, Win Credential Manager)
tauri-plugin-global-shortcut = "2"  # Global hotkeys via Tauri
```

### File Structure Reference
```
src-tauri/src/
├── lib.rs              # App setup, state registration, command handlers
├── main.rs             # Binary entry
├── engine/             # Core business logic
│   ├── layout.rs       # Layout conversion with auto-detection
│   ├── clipboard.rs    # ClipboardManager with categorization
│   ├── snippets.rs     # SnippetEngine with Trie
│   ├── hotkeys.rs      # HotkeyManager with platform-aware defaults
│   └── detector.rs     # Wrong-layout real-time detection
├── ai/                 # AI provider implementations
│   ├── provider.rs     # AIRequest, AIResponse, AIError types
│   ├── gemini.rs       # Google Gemini 2.5 Flash
│   ├── openai.rs       # GPT-4o / GPT-4o-mini
│   ├── claude.rs       # Claude Sonnet/Opus
│   ├── openrouter.rs   # Multi-model gateway
│   └── ollama.rs       # Local LLM
├── storage/            # Persistence
│   ├── database.rs     # SQLite (clipboard, snippets, settings)
│   └── settings.rs     # AppSettings struct
└── commands/           # Tauri IPC handlers
    ├── layout.rs       # convert_text, auto_convert, detect_layout
    ├── clipboard.rs    # CRUD + system clipboard read/write
    ├── snippets.rs     # CRUD + match_buffer + expand_variables
    ├── ai.rs           # ai_complete, ai_enhance, ai_translate
    └── settings.rs     # get/update settings, app info

src/
├── App.tsx             # Tab navigation (Clipboard, Converter, Snippets, AI, Settings)
├── lib/tauri.ts        # Typed wrappers for all 30+ Tauri commands
├── components/
│   ├── ClipboardHistory.tsx    # Grid with search, categories, pin/fav
│   ├── LayoutConverter.tsx     # Manual conversion with detection
│   ├── SnippetManager.tsx      # CRUD with variable preview
│   ├── AITools.tsx             # Enhance, translate, freeform chat
│   ├── Settings.tsx            # General, AI, Layouts, About tabs
│   └── Onboarding.tsx          # 6-step wizard
├── hooks/useTauriCommand.ts    # Generic async hook
└── styles/
    ├── theme.css               # CSS variables, dark/light
    └── app.css                 # Component styles
```

## Reference: JoyaFix Feature Parity Checklist
These features exist in JoyaFix (Swift/macOS) and must work in Brava (cross-platform):
- [x] Hebrew ↔ English layout conversion (Brava: 4 languages)
- [ ] Real-time clipboard monitoring with history
- [ ] Snippet auto-expansion as you type
- [ ] Global hotkeys (Cmd+Shift+T, etc.)
- [ ] System tray with context menu
- [ ] AI prompt enhancer (select → enhance → paste)
- [ ] Smart translator (select → translate → paste)
- [ ] Keyboard lock/cleaner mode
- [ ] Settings with API key management
- [ ] Voice input (speech-to-text)
- [ ] Caffeine mode (prevent sleep)
- [ ] Onboarding with permission setup
- [ ] Auto-update system
- [ ] Launch at login

## How To Work
1. Start with Priority 1 items — they make the app actually useful
2. Work on one feature at a time, test it, then move to the next
3. After each feature, run `cargo test` and `npx tsc --noEmit` to ensure nothing breaks
4. Commit after each working feature with a descriptive message
5. Push to `main` branch on `sassongal/Brava`

Start with **clipboard monitoring** (Priority 1, item 1) — it's the most visible feature and will immediately make the app feel alive.
