# Codebase Concerns

**Analysis Date:** 2026-03-27

## Tech Debt

**Custom base64 decoders (2 copies):**
- Issue: Hand-rolled base64 decode in `src-tauri/src/commands/screenshot.rs` and `src-tauri/src/commands/transcription.rs` instead of using `base64` crate
- Impact: Potential data corruption, inconsistent behavior, unmaintainable
- Fix: Add `base64` crate to Cargo.toml, replace both implementations

**Snippet trie full rebuild on every modification:**
- Issue: `rebuild_trie()` in `src-tauri/src/engine/snippets.rs` reconstructs entire trie on add/update/remove
- Impact: O(n*m) per modification, slow with 100+ snippets
- Fix: Implement incremental trie updates (remove specific node, re-insert)

**Regex compiled per keystroke for regex snippets:**
- Issue: `match_buffer()` in `src-tauri/src/engine/snippets.rs` compiles `Regex::new()` for each regex snippet on every call
- Impact: High CPU when typing with regex snippets enabled
- Fix: Pre-compile regex patterns on snippet load, cache in Snippet struct

## Known Bugs

**Global key monitor crashes on macOS:**
- Symptoms: App crash when `rdev` key listener runs on macOS
- Trigger: Enabling global typing detection on macOS
- Workaround: Feature auto-disabled on macOS, auto-disables after 2+ crashes
- File: `src-tauri/src/lib.rs` (line ~223, TODO comment)

**Transcription jobs stuck in "processing" on timeout:**
- Symptoms: Spinner shows indefinitely, job never completes
- Trigger: OpenAI API hangs or network timeout
- File: `src-tauri/src/commands/transcription.rs`
- Fix: Add timeout with automatic transition to "failed"

**Missing image files show broken thumbnails:**
- Symptoms: Broken image placeholders in clipboard history
- Trigger: Screenshot file deleted or moved after capture
- File: `src/components/ClipboardHistory.tsx`
- Fix: Add `onError` handler to `<img>` tags, show fallback

## Security Considerations

**Unsafe FFI calls for permission checking:**
- Risk: `AXIsProcessTrusted` and `CGPreflightScreenCaptureAccess` called via raw `extern "C"` without safe bindings
- Files: `src-tauri/src/commands/settings.rs` (lines 154-203)
- Mitigation: Functions are simple boolean checks, low risk in practice
- Recommendation: Use `accessibility-sys` or `core-foundation` crate for proper bindings

**API key fallback when keyring unavailable:**
- Risk: If OS keyring is locked/unavailable, keys silently not loaded
- File: `src-tauri/src/lib.rs` (load_api_keys_from_keyring)
- Mitigation: Logged at debug level, user re-enters keys in Settings
- Recommendation: Show toast notification when keyring access fails

## Performance Bottlenecks

**Clipboard dedup is O(n) on in-memory vec:**
- Problem: `ClipboardManager::add()` iterates all items for hash dedup
- File: `src-tauri/src/engine/clipboard.rs`
- Measurement: Negligible for <500 items, potentially noticeable at 1000+
- Fix: Use HashSet for O(1) dedup lookup alongside the Vec

**Screenshot canvas operations at 4K:**
- Problem: Each undo entry stores full ImageData (~33MB at 4K)
- File: `src/components/ScreenshotEditor.tsx`
- Measurement: 20 entries × 33MB = 660MB max (capped at 20)
- Fix: Consider storing diff-based undo or compressed snapshots

## Fragile Areas

**App.tsx event listener setup:**
- File: `src/App.tsx` (lines 63-159)
- Why fragile: 10+ Tauri event listeners registered in one useEffect
- Safe modification: Use refs for mutable values, keep dependency array minimal
- Test coverage: Not tested

**Transcription worker thread:**
- File: `src-tauri/src/commands/transcription.rs`
- Why fragile: Single worker with queue, race conditions possible between enqueue and worker exit
- Safe modification: Hold queue lock when checking empty + setting running flag
- Test coverage: Not tested

**SQLite database migrations:**
- File: `src-tauri/src/storage/database.rs`
- Why fragile: Schema changes must be backward-compatible, no rollback
- Safe modification: Always add columns (never remove), use `ALTER TABLE ... ADD COLUMN` with `.ok()` error suppression

## Test Coverage Gaps

**Frontend (0% coverage):**
- No React component tests
- No i18n coverage verification
- No E2E tests
- Priority: Medium — Rust handles critical logic

**Database operations:**
- SQLite read/write not tested directly
- Migration system not tested
- Priority: Medium

**AI provider HTTP responses:**
- Only request formatting tested, not response parsing
- No mock HTTP layer
- Priority: Low — errors surface as user-visible toasts

**Platform-specific code:**
- macOS Keychain, Windows Credential Manager not tested
- Screenshot capture not tested
- Hotkey registration not tested
- Priority: Low — requires platform-specific CI

## Missing Critical Features

**No structured logging:**
- Problem: Only `log` crate with `env_logger`, no file output or rotation
- Workaround: Users must run from terminal to see logs
- Fix: Add `tracing` crate with file appender

**No error telemetry:**
- Problem: No way to know when users hit crashes
- Workaround: Users report issues manually
- Fix: Consider opt-in Sentry integration

---

*Concerns audit: 2026-03-27*
*Update as issues are fixed or new ones discovered*
