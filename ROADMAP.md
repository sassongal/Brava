# Brava Development Roadmap

## Phase 1: Foundation (Current)
- [x] Project scaffold (Tauri 2 + React + TypeScript)
- [x] Documentation (README, ARCHITECTURE, ROADMAP)
- [x] Rust core: Layout conversion engine (Hebrew, English, Arabic, Russian)
- [x] Rust core: Clipboard manager (cross-platform)
- [x] Rust core: Snippet engine with Trie
- [x] Rust core: AI service layer (5 providers)
- [x] Rust core: Settings/storage (SQLite + OS keystore)
- [x] Rust core: Global hotkey manager
- [x] Rust core: Tauri IPC commands
- [x] React: App shell with system tray
- [x] React: Clipboard history view
- [x] React: Snippet manager
- [x] React: AI tools (prompt enhancer, translator)
- [x] React: Settings panel
- [x] React: Onboarding wizard

## Phase 2: Smart Features
- [ ] Real-time wrong-layout detection (type-ahead analysis)
- [ ] Auto-categorization of clipboard items (URL, email, code, phone)
- [ ] Contextual actions on clipboard items ("Open URL", "Call number")
- [ ] Snippet variables: `{date}`, `{time}`, `{clipboard}`, `{cursor}`, `{selection}`
- [ ] Grammar/spell check after conversion (optional AI pass)
- [ ] Multi-item paste (select multiple clipboard items, paste as list)

## Phase 3: AI Enhancements
- [ ] Streaming AI responses with live preview
- [ ] Conversation memory for translator (context-aware)
- [ ] Image-to-text (OCR) via local model or API
- [ ] Voice input with Whisper (local) or cloud STT
- [ ] AI-suggested snippets based on typing patterns
- [ ] Custom AI prompts library with templates

## Phase 4: Platform Polish
- [ ] macOS: native menu bar integration, Spotlight-style popup
- [ ] Windows: system tray, Win+V style clipboard popup
- [ ] Linux: X11 + Wayland support, desktop notifications
- [ ] Auto-update via Tauri's built-in updater
- [ ] Installer/DMG/MSI generation
- [ ] Code signing + notarization (macOS, Windows)

## Phase 5: Sync & Collaboration
- [ ] End-to-end encrypted clipboard sync across devices
- [ ] Snippet library sync (cloud backup)
- [ ] Settings export/import
- [ ] Share snippets via link

## Phase 6: Extensions
- [ ] Plugin system for custom layout files (JSON)
- [ ] Custom AI provider configuration
- [ ] Theming (user-created color schemes)
- [ ] Browser extension for web clipboard sync
- [ ] Mobile companion app (Tauri Mobile)
