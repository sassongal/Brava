# Testing Patterns

**Analysis Date:** 2026-03-27

## Test Framework

**Runner:**
- Rust built-in `#[test]` attribute — no external test framework
- Config: default Cargo test runner

**Assertion Library:**
- Rust standard: `assert!()`, `assert_eq!()`, `assert_ne!()`

**Run Commands:**
```bash
cd src-tauri && cargo test --lib       # Run all 32 unit tests
cd src-tauri && cargo test test_name   # Run single test by name
npx tsc --noEmit                       # TypeScript type checking (no runtime tests)
```

## Test File Organization

**Location:**
- Colocated with source: `#[cfg(test)] mod tests { ... }` inside source files
- No separate test directories

**Naming:**
- `test_<feature>_<scenario>` pattern (e.g., `test_detect_hebrew`, `test_manager_dedup`)

**Structure:**
```
src-tauri/src/
  engine/
    layout.rs         # 5 tests (detect, convert, auto_convert)
    clipboard.rs      # 15 tests (create, categorize, CRUD, dedup, search)
    snippets.rs       # 8 tests (create, match, remove, load, variables)
  ai/
    provider.rs       # 4 tests (hebrew detection, prompt formatting)
```

## Test Structure

**Suite Organization:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_feature_scenario() {
        // arrange
        let engine = LayoutEngine::new();

        // act
        let result = engine.detect_layout("שלום עולם");

        // assert
        assert_eq!(result.detected_code, "he");
        assert!(result.confidence > 0.0);
    }
}
```

**Patterns:**
- Each test is independent (no shared state)
- Factory constructors for setup (`LayoutEngine::new()`, `ClipboardManager::new(10)`)
- No `beforeEach`/`afterEach` — Rust tests are isolated by default

## Test Coverage

**32 tests total across 4 modules:**

| Module | Tests | Coverage |
|--------|-------|----------|
| `engine/clipboard.rs` | 15 | Item creation, 5 categories (URL/email/color/code/path), manager CRUD, dedup, search, size limit, skip mechanism, image items |
| `engine/snippets.rs` | 8 | Creation, trie matching, no-match, remove, get_all, load, variable expansion |
| `engine/layout.rs` | 5 | Hebrew/English detection, available layouts, explicit convert, auto_convert |
| `ai/provider.rs` | 4 | Hebrew detection, enhance prompt (en/he), translate request |

**What's NOT Tested:**
- React components (no frontend test framework)
- Database operations (SQLite read/write)
- Tauri IPC command marshaling
- Network calls to AI providers
- Platform-specific code (macOS/Windows/Linux)
- Hotkey registration
- Screenshot capture flow
- Transcription pipeline

## Test Types

**Unit Tests:**
- Scope: Single function/struct in isolation
- Mocking: None (pure logic, no external deps)
- Speed: All 32 tests complete in <0.01s

**Integration Tests:** Not implemented

**E2E Tests:** Not implemented

## Gaps & Recommendations

1. **No frontend tests** — Add Vitest for React component testing
2. **No database tests** — Add integration tests for SQLite operations
3. **No HTTP mocking** — AI provider tests only check request format, not responses
4. **No E2E tests** — Consider Playwright or WebdriverIO for full flow testing

---

*Testing analysis: 2026-03-27*
*Update when test patterns change*
