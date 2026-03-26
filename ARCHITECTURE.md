# Brava Architecture

## Overview

Brava is a cross-platform desktop application built with Tauri 2.0. The backend (Rust) handles all core logic, platform integration, and data persistence. The frontend (React + TypeScript) provides the user interface.

## Directory Structure

```
Brava/
├── src/                          # React frontend
│   ├── components/               # Reusable UI components
│   │   ├── ClipboardHistory.tsx  # Clipboard grid with search
│   │   ├── SnippetManager.tsx    # Snippet CRUD interface
│   │   ├── AITools.tsx           # Prompt enhancer, translator
│   │   ├── Settings.tsx          # App settings + API keys
│   │   ├── Onboarding.tsx        # First-run setup wizard
│   │   └── common/               # Shared components (Toast, Modal)
│   ├── hooks/                    # Custom React hooks
│   │   ├── useTauriCommand.ts    # Generic Tauri invoke wrapper
│   │   ├── useClipboard.ts       # Clipboard state management
│   │   └── useSettings.ts        # Settings state management
│   ├── styles/                   # CSS modules + theme variables
│   ├── lib/                      # Frontend utilities
│   │   └── tauri.ts              # Tauri API helpers
│   ├── App.tsx                   # Root component with routing
│   └── main.tsx                  # Entry point
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Tauri app setup + plugin registration
│   │   ├── main.rs               # Binary entry point
│   │   ├── commands/             # Tauri IPC command handlers
│   │   │   ├── mod.rs
│   │   │   ├── clipboard.rs      # Clipboard commands
│   │   │   ├── layout.rs         # Layout conversion commands
│   │   │   ├── snippets.rs       # Snippet commands
│   │   │   ├── ai.rs             # AI service commands
│   │   │   └── settings.rs       # Settings commands
│   │   ├── engine/               # Core business logic
│   │   │   ├── mod.rs
│   │   │   ├── layout.rs         # Layout conversion engine
│   │   │   ├── clipboard.rs      # Clipboard monitoring + history
│   │   │   ├── snippets.rs       # Snippet engine with Trie
│   │   │   ├── hotkeys.rs        # Global hotkey registration
│   │   │   └── detector.rs       # Real-time wrong-layout detection
│   │   ├── ai/                   # AI service integrations
│   │   │   ├── mod.rs
│   │   │   ├── provider.rs       # AIProvider trait
│   │   │   ├── gemini.rs         # Google Gemini client
│   │   │   ├── openai.rs         # OpenAI/ChatGPT client
│   │   │   ├── claude.rs         # Anthropic Claude client
│   │   │   ├── openrouter.rs     # OpenRouter client
│   │   │   └── ollama.rs         # Ollama local client
│   │   ├── storage/              # Data persistence
│   │   │   ├── mod.rs
│   │   │   ├── database.rs       # SQLite via rusqlite
│   │   │   ├── keystore.rs       # OS keychain for API keys
│   │   │   └── settings.rs       # User preferences
│   │   └── layouts/              # Keyboard layout definitions
│   │       ├── mod.rs
│   │       ├── english.rs        # QWERTY layout map
│   │       ├── hebrew.rs         # Hebrew layout map
│   │       ├── arabic.rs         # Arabic layout map
│   │       └── russian.rs        # Russian ЙЦУКЕН layout map
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
│
├── package.json                  # Node dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite bundler config
├── README.md                     # Project documentation
├── ARCHITECTURE.md               # This file
└── ROADMAP.md                    # Development roadmap
```

## Data Flow

### Layout Conversion
```
User selects text → Presses Cmd+Shift+T
  → Tauri hotkey listener fires
  → Rust reads clipboard/selection
  → LayoutEngine.detect_language(text)
  → LayoutEngine.convert(text, source, target)
  → Rust pastes converted text back
  → Toast notification shown via frontend
```

### Clipboard Monitoring
```
OS clipboard changes → arboard detects change
  → Rust compares with last known content
  → Deduplication check (SHA256)
  → Auto-categorize (URL, email, code, phone, etc.)
  → Store in SQLite (plain text preview + full content)
  → Notify frontend via Tauri event
  → React updates clipboard grid
```

### AI Service Call
```
User triggers AI action → Frontend invoke("ai_request", {...})
  → Rust AIService selects provider based on settings
  → Build provider-specific HTTP request (reqwest)
  → Stream response back via Tauri events
  → Frontend displays result progressively
  → Store in history if needed
```

## Key Design Decisions

1. **Data-driven layouts**: Keyboard layouts are defined as HashMap<char, char> mappings, loaded from Rust modules. Adding a new language = adding one file with the character map.

2. **SQLite for everything**: Single database for clipboard history, snippets, prompt library, and settings (except API keys). No UserDefaults/registry fragmentation.

3. **OS keystore for secrets**: API keys stored in macOS Keychain, Windows Credential Manager, or Linux Secret Service. Never in plaintext.

4. **Tauri events for streaming**: AI responses stream back via Tauri's event system rather than polling, giving real-time UI updates.

5. **arboard for clipboard**: Cross-platform clipboard access without platform-specific code.

6. **rdev for input**: Cross-platform keyboard/mouse event listening for hotkeys and snippet detection.
