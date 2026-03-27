# Coding Conventions

**Analysis Date:** 2026-03-27

## Naming Patterns

**Files:**
- PascalCase.tsx for React components (`ClipboardHistory.tsx`, `AITools.tsx`)
- camelCase.ts for utilities/hooks (`tauri.ts`, `useTauriCommand.ts`)
- snake_case.rs for Rust modules (`clipboard.rs`, `provider.rs`)
- kebab-case.css for styles (`theme.css`, `app.css`)

**Functions:**
- TypeScript: camelCase (`handleCopy`, `loadItems`, `formatTime`)
- Rust: snake_case (`detect_layout`, `convert_text`, `clipboard_monitor`)
- Event handlers: `handle` + Action (`handleSave`, `handleDelete`)

**Variables:**
- TypeScript: camelCase, booleans use `is`/`has` prefix (`isLoading`, `hasError`)
- Rust: snake_case, constants UPPER_SNAKE_CASE
- State: `const [value, setValue] = useState()`

**Types:**
- TypeScript: PascalCase interfaces (`ClipboardItem`, `AppSettings`, `AIResponse`)
- Rust: PascalCase structs/enums (`LayoutEngine`, `ClipboardCategory`)
- No `I` prefix on interfaces

## Code Style

**Formatting:**
- TypeScript: 2-space indentation, double quotes
- Rust: 4-space indentation (standard rustfmt)
- No Prettier or ESLint configured — manually consistent
- No strict line length limit

**TypeScript Strictness** (`tsconfig.json`):
- `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`
- `jsx: "react-jsx"` (no React import needed)

## Import Organization

**TypeScript:**
1. React hooks (`useState`, `useEffect`, `useCallback`)
2. Tauri APIs (`listen`, `invoke`, `convertFileSrc`)
3. Local components/libs (`../lib/tauri`, `./Toast`)
4. Type imports inline (not separated)

**Rust:**
1. `use crate::` imports (internal modules)
2. `use tauri::` imports (framework)
3. `use std::` imports (standard library)
4. External crate imports

## Error Handling

**Rust Commands:**
- Return `Result<T, String>` for all IPC commands
- Use `.map_err(|e| e.to_string())?` for error propagation
- Use `.unwrap_or_else(|e| e.into_inner())` for poisoned mutex recovery

**TypeScript:**
- `try/catch` around all `invoke()` calls
- `showToast(error, "error")` for user-facing errors
- Silent catch for best-effort operations (grammar fix, sound effects)

## Logging

**Rust:** `log` crate with `env_logger`
- `log::info!()` for startup events
- `log::error!()` for failures
- `log::warn!()` for recoverable issues
- `log::debug!()` for verbose info

**TypeScript:** `console.error` for errors, no structured logging

## Comments

**When to Comment:**
- Rust: `///` doc comments on public structs/methods
- Inline `//` for non-obvious logic steps
- TypeScript: minimal — code is self-documenting via types

**TODO Pattern:** `// TODO:` or `// TODO(context):` — few in codebase

## Function Design

**Rust:**
- Commands are thin wrappers delegating to engine
- Engine functions are pure logic, no framework deps
- Max ~3 parameters; use struct for more

**TypeScript:**
- Components are function components with hooks
- `useCallback` for stable event handler references
- `useRef` for mutable values accessed in closures (prevents listener churn)

## Module Design

**Rust Exports:**
- `mod.rs` re-exports submodules
- `pub use` for public types
- Internal helper functions stay private

**TypeScript Exports:**
- Named exports for components and functions
- Default export for `App` only
- `src/lib/tauri.ts` is the single source of truth for all IPC types

---

*Convention analysis: 2026-03-27*
*Update when patterns change*
