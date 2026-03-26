# Brava

**Cross-platform productivity toolkit** — smart keyboard layout conversion, clipboard management, AI-powered text tools, and more.

Works on **macOS, Windows, and Linux**.

## Features

### Core
- **Smart Layout Conversion** — Detects wrong-language typing and converts between Hebrew, English, Arabic, and Russian keyboard layouts. Data-driven and extensible to any language pair.
- **Real-time Detection** — Monitors keystrokes and alerts you when typing in the wrong layout before you finish a sentence.
- **Clipboard History** — Stores up to 500 items with full-text search, auto-categorization (URLs, emails, code, phone numbers), and contextual actions.
- **Smart Snippets** — Text expansion with dynamic variables (`{date}`, `{time}`, `{clipboard}`, `{cursor}`). Trie-based matching for instant expansion.

### AI-Powered
- **Prompt Enhancer** — Select text, press a hotkey, get an improved version via AI.
- **Smart Translator** — Context-aware translation between any supported languages.
- **Vision Lab** — Drop an image, get AI-generated descriptions or extracted text.
- **Voice Input** — Speech-to-text transcription with language detection.

### AI Providers
- **Google Gemini** (free tier available)
- **OpenAI / ChatGPT** (GPT-4o, GPT-4o-mini)
- **Anthropic Claude** (Claude 4 Sonnet/Opus)
- **OpenRouter** (access to 100+ models)
- **Ollama** (fully local, private, free)

### Utilities
- **Keyboard Lock** — Block keyboard input for cleaning or child-proofing.
- **Caffeine Mode** — Prevent system sleep.
- **System Tray** — Lives in your tray/menubar. Left-click for quick clipboard access, right-click for full menu.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **App Framework** | [Tauri 2.0](https://tauri.app) |
| **Core Logic** | Rust |
| **Frontend** | React 19 + TypeScript + Vite |
| **Database** | SQLite (via rusqlite) |
| **AI Clients** | reqwest + serde (REST APIs) |
| **Hotkeys** | rdev (cross-platform input) |
| **Clipboard** | arboard (cross-platform clipboard) |
| **Styling** | CSS Modules + CSS Variables (dark/light theme) |

## Architecture

```
+-----------------------------------------+
|          React Frontend (UI)            |
|  System Tray Window / Settings          |
|  Clipboard Grid / Snippet Editor        |
|  AI Tools / Onboarding                  |
+------------------+----------------------+
                   | Tauri IPC (invoke)
+------------------v----------------------+
|          Rust Core Engine               |
|  LayoutEngine    ClipboardManager       |
|  SnippetEngine   AIService              |
|  HotkeyManager   StorageManager         |
+------------------+----------------------+
                   | Platform Abstraction
+------------------v----------------------+
|       OS-Specific Adapters              |
|  macOS: CoreGraphics, NSPasteboard      |
|  Windows: Win32 API, WinRT              |
|  Linux: X11/Wayland, xclip, xdotool    |
+-----------------------------------------+
```

## Getting Started

### Prerequisites
- [Rust](https://rustup.rs/) (1.75+)
- [Node.js](https://nodejs.org/) (20+)
- Platform dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools, WebView2
  - **Linux**: `libwebkit2gtk-4.1-dev librsvg2-dev libgtk-3-dev libayatana-appindicator3-dev libxdo-dev`

### Development
```bash
npm install
npm run tauri dev
```

### Build
```bash
npm run tauri build
```

## Supported Layouts

| Language | Keyboard | Status |
|----------|----------|--------|
| English | QWERTY | Built-in |
| Hebrew | Standard | Built-in |
| Arabic | Standard | Built-in |
| Russian | JCUKEN | Built-in |
| Custom | User-defined JSON | Extensible |

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Convert Layout | `Cmd+Shift+T` | `Ctrl+Shift+T` |
| Clipboard History | `Cmd+Shift+V` | `Ctrl+Shift+V` |
| Enhance Prompt | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Translate Selection | `Cmd+Shift+L` | `Ctrl+Shift+L` |
| Voice Input | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| Keyboard Lock | `Cmd+Shift+K` | `Ctrl+Shift+K` |

## License

MIT
