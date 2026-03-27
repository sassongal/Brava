# Codebase Structure

**Analysis Date:** 2026-03-27

## Directory Layout

```
Brava/
├── src/                          # Frontend (React + TypeScript)
│   ├── main.tsx                 # Entry point (routes to App or ScreenshotEditor)
│   ├── App.tsx                  # Main app (7 tabs, hotkeys, events)
│   ├── components/              # 16 feature components
│   ├── hooks/                   # Custom React hooks
│   ├── lib/                     # Utilities (tauri.ts, i18n.ts, sounds.ts)
│   ├── styles/                  # CSS (theme.css, app.css)
│   └── assets/brava-brand/      # Brand logos, icons, guidelines
├── src-tauri/                   # Backend (Rust)
│   ├── src/
│   │   ├── main.rs             # Binary entry point
│   │   ├── lib.rs              # Core setup (500+ lines)
│   │   ├── commands/           # 9 IPC handler modules
│   │   ├── engine/             # 5 business logic modules
│   │   ├── storage/            # Database + settings
│   │   ├── ai/                 # 5 AI provider clients
│   │   └── layouts/            # 4 keyboard layout maps
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri config (CSP, updater, bundle)
│   ├── icons/                  # App icons (all sizes + tray)
│   └── capabilities/           # Tauri permissions
├── .github/workflows/          # CI + Release pipelines
├── .planning/                  # Codebase documentation
├── package.json                # Node dependencies
├── tsconfig.json               # TypeScript strict config
├── vite.config.ts              # Vite dev server on :1420
└── CLAUDE.md                   # AI assistant instructions
```

## Directory Purposes

**`src/components/`** (16 files):
- `ClipboardHistory.tsx` — Clipboard grid with search, categories, pin/fav
- `AITools.tsx` — Enhance, translate, freeform + prompt library
- `LayoutConverter.tsx` — Manual layout conversion with detection
- `SnippetManager.tsx` — Snippet CRUD with variable preview + search
- `Transcription.tsx` — Media transcription with queue + quick recording
- `UniversalSearch.tsx` — Cross-content search
- `Settings.tsx` — 6-tab settings (general, AI, layouts, shortcuts, permissions, about)
- `ScreenshotEditor.tsx` — Lightshot-style editor (selection, annotations, actions)
- `QuickPaste.tsx` — Floating clipboard popup (Cmd+K)
- `KeyboardLock.tsx` — Full-screen lock overlay
- `Onboarding.tsx` — 7-step wizard with language + permissions
- `Toast.tsx` — Notification system
- `WhatsNew.tsx` — Post-update changelog modal
- `ErrorBoundary.tsx` — React error boundary

**`src-tauri/src/commands/`** (9 modules):
- `ai.rs` — AI complete, enhance, translate, grammar, streaming, health check
- `clipboard.rs` — CRUD, system read/write, image clipboard
- `layout.rs` — Convert text, auto-convert, detect, clipboard convert
- `snippets.rs` — CRUD with DB persistence
- `settings.rs` — Settings, caffeine, keyboard lock, permissions, backup/restore
- `hotkeys.rs` — Get/update/reset hotkey bindings
- `screenshot.rs` — Capture, editor window, save/crop, cancel
- `transcription.rs` — Queue-based Whisper transcription with ffmpeg compression
- `prompts.rs` — Prompt library CRUD

**`src-tauri/src/engine/`** (5 modules):
- `layout.rs` — LayoutEngine with auto-detection and 4-language conversion
- `clipboard.rs` — ClipboardManager with dedup, categorization, image support
- `snippets.rs` — SnippetEngine with Trie-based matching
- `hotkeys.rs` — HotkeyManager with customizable bindings
- `detector.rs` — WrongLayoutDetector with confidence scoring

## Key File Locations

**Entry Points:**
- `src/main.tsx` — React root (routes screenshot window vs main app)
- `src-tauri/src/lib.rs` — Rust app setup (DB, state, plugins, tray, hotkeys, threads)

**Configuration:**
- `src-tauri/tauri.conf.json` — CSP, window, bundle, updater config
- `tsconfig.json` — TypeScript strict mode
- `src-tauri/capabilities/default.json` — Tauri permissions

**Core Logic:**
- `src/lib/tauri.ts` — 50+ typed IPC command wrappers
- `src/lib/i18n.ts` — 200+ translation keys (en + he)
- `src-tauri/src/storage/database.rs` — SQLite with WAL, migrations, 6 tables

## Naming Conventions

**Files:**
- PascalCase.tsx for React components (`ClipboardHistory.tsx`)
- camelCase.ts for utilities (`tauri.ts`, `sounds.ts`)
- snake_case.rs for Rust modules (`clipboard.rs`)

**Directories:**
- kebab-case for frontend (`brava-brand/`)
- snake_case for Rust (`src-tauri/`)

## Where to Add New Code

**New Tauri Command:**
1. Handler: `src-tauri/src/commands/{module}.rs`
2. Register: `src-tauri/src/lib.rs` invoke_handler
3. Frontend wrapper: `src/lib/tauri.ts`

**New React Component:**
1. Component: `src/components/{Name}.tsx`
2. Tab entry: `src/App.tsx` TABS array
3. i18n keys: `src/lib/i18n.ts`

**New AI Provider:**
1. Client: `src-tauri/src/ai/{provider}.rs`
2. Register: `src-tauri/src/ai/mod.rs`
3. Add to AIState: `src-tauri/src/commands/ai.rs`

**New Keyboard Layout:**
1. Map: `src-tauri/src/layouts/{language}.rs`
2. Register: `src-tauri/src/layouts/mod.rs`

---

*Structure analysis: 2026-03-27*
*Update when directory structure changes*
