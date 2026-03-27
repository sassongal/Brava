# External Integrations

**Analysis Date:** 2026-03-27

## APIs & External Services

**AI/LLM Providers (5 integrated):**

- **Google Gemini** — Default AI provider (free tier)
  - SDK/Client: reqwest HTTP client
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models`
  - Auth: API key as query parameter
  - File: `src-tauri/src/ai/gemini.rs`

- **OpenAI** — GPT-4o-mini, Whisper transcription
  - SDK/Client: reqwest HTTP client
  - Endpoints: `https://api.openai.com/v1/chat/completions`, `/v1/audio/transcriptions`
  - Auth: Bearer token in Authorization header
  - File: `src-tauri/src/ai/openai.rs`

- **Anthropic Claude** — Claude 4 Sonnet/Opus/Haiku
  - SDK/Client: reqwest HTTP client
  - Endpoint: `https://api.anthropic.com/v1/messages`
  - Auth: x-api-key header
  - File: `src-tauri/src/ai/claude.rs`

- **OpenRouter** — Multi-model aggregator (100+ models)
  - SDK/Client: reqwest HTTP client
  - Endpoint: `https://openrouter.ai/api/v1/chat/completions`
  - Auth: Bearer token + HTTP-Referer/X-Title headers
  - File: `src-tauri/src/ai/openrouter.rs`

- **Ollama** — Local LLM (no external calls)
  - Default: `http://localhost:11434`
  - Configurable endpoint per user
  - File: `src-tauri/src/ai/ollama.rs`

**Speech-to-Text:**
- **OpenAI Whisper API** — Media transcription
  - Endpoint: `https://api.openai.com/v1/audio/transcriptions`
  - Model: whisper-1
  - Max file size: 25MB (auto-compresses via ffmpeg for larger files)
  - Formats: MP3, WAV, M4A, OGG, FLAC, MP4, MOV, AVI, MKV, WebM
  - File: `src-tauri/src/commands/transcription.rs`

## Data Storage

**Database:**
- SQLite via rusqlite (bundled) — `{app_data_dir}/brava.db`
  - WAL mode enabled for crash safety
  - Tables: clipboard_history, snippets, settings, prompt_library, transcription_jobs, schema_migrations
  - Connection: `src-tauri/src/storage/database.rs`

**File Storage:**
- Screenshots: `{app_data_dir}/screenshots/` — PNG files
- Voice recordings: `{app_data_dir}/recordings/` — WebM files
- Temp files: compressed transcription audio

**Caching:**
- In-memory clipboard history (ClipboardManager with max_items cap)
- In-memory snippet trie (SnippetEngine)

## Authentication & Identity

**Credential Storage:**
- OS Keyring — macOS Keychain, Windows Credential Manager, Linux Secret Service
  - Service name: "brava"
  - Keys: `api_key_gemini`, `api_key_openai`, `api_key_claude`, `api_key_openrouter`
  - File: `src-tauri/src/lib.rs` (load_api_keys_from_keyring)

**No User Authentication:**
- Desktop app, single user, no login required
- All data stored locally

## Monitoring & Observability

**Error Tracking:**
- `log` + `env_logger` crates — Rust logging
- Console logging — Frontend errors
- No external error tracking (no Sentry)

**Analytics:**
- None (privacy-first, no telemetry)

**Crash Detection:**
- Session marker file: `{app_data_dir}/session-active.lock`
- Auto-disables global typing detection after 2+ consecutive crashes
- File: `src-tauri/src/lib.rs`

## CI/CD & Deployment

**Hosting:**
- Distributed as desktop installers (.dmg, .msi, .deb, .AppImage)
- Installers created by Tauri bundler

**CI Pipeline:**
- GitHub Actions — `.github/workflows/ci.yml`
  - Triggers: push to main, pull requests
  - Checks: TypeScript, Rust compilation, 32 unit tests

**Release Pipeline:**
- GitHub Actions — `.github/workflows/release.yml`
  - Triggers: version tags (v*)
  - Builds: macOS (arm64 + x86_64), Windows, Linux
  - Publishes: GitHub Release with signed update artifacts

**Auto-Update:**
- `tauri-plugin-updater` — checks GitHub Releases
- Endpoint: `https://github.com/sassongal/Brava/releases/latest/download/latest.json`
- Verification: minisign public key in `tauri.conf.json`
- Secrets: TAURI_SIGNING_PRIVATE_KEY in GitHub Actions

## Environment Configuration

**Development:**
- `env.local` — GitHub access token (gitignored)
- `npm run tauri dev` — starts Vite + Rust dev server
- Dev server: `http://localhost:1420`

**Production:**
- API keys: OS Keyring (never in files)
- Settings: SQLite database
- CSP: Strict policy in `tauri.conf.json`

## Webhooks & Callbacks

**Incoming:** None
**Outgoing:** None (all API calls are request-response)

---

*Integration audit: 2026-03-27*
*Update when adding/removing external services*
