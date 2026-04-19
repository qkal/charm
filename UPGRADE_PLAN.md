# Charm Upgrade Plan

> Safe, incremental improvements to make the codebase more solid, stable,
> fully TypeScript with strict typing, and linted with oxlint.

## Baseline Status (v0.1.0)

- **TypeScript**: `strict: true` already enabled in `tsconfig.json` ✅
- **Typecheck**: `tsc --noEmit` passes clean ✅
- **Tests**: 51 test files, 1562 passing, 20 skipped, 0 failing ✅
- **Linter**: None configured ❌
- **`any` usage**: ~40+ instances across `src/` (db-base, pi-extension, security, server, opencode-plugin)
- **JS-only files**: `start.mjs`, 37 hook `.mjs` files, 3 scripts — not type-checked
- **`server.ts`**: 2327-line monolith — all MCP tool registrations in one file

---

## Phase 1 — Foundation (Zero Risk)

No behavioral changes. Only tooling, config, and type tightening.

### 1.1 Add oxlint

- [ ] Install `oxlint` as devDependency
- [ ] Create `oxlint.json` config with recommended rules + TypeScript-aware rules
- [ ] Add `"lint": "oxlint src/"` script to `package.json`
- [ ] Run and fix all auto-fixable violations (unused imports, prefer-const, etc.)
- [ ] Add `"lint:fix": "oxlint src/ --fix"` script

### 1.2 Eliminate `any` in core modules

Safe type narrowing — no logic changes.

- [ ] **`db-base.ts`**: Type `BunSQLiteAdapter.#raw` and `NodeSQLiteAdapter.#raw` as `unknown` with assertion helpers instead of `any`. Type `pragma()` return as `unknown`.
- [ ] **`security.ts`**: Replace `let parsed: any` (lines 225, 308) with `unknown` + type guards
- [ ] **`executor.ts`**: Replace `(err as any).stderr` (line 197) with proper typed error handling
- [ ] **`server.ts`**: Type `coerceCommandsArray` / `coerceJsonArray` return values; type the session stats object as an interface

### 1.3 Eliminate `any` in peripheral modules

- [ ] **`pi-extension.ts`**: Define minimal `PiExtensionAPI` interface for the `pi` parameter and `ctx`/`event` callback parameters (lines 130-261)
- [ ] **`opencode-plugin.ts`**: Type `args: any` and `metadata: any` fields (lines 45, 53, 60) with actual shapes
- [ ] **`session/analytics.ts`**: `DatabaseAdapter` is fine — review callers for `any` leaks

### 1.4 Stricter tsconfig

- [ ] Add `"noUncheckedIndexedAccess": true` — catches `arr[i]` returning `T | undefined`
- [ ] Add `"exactOptionalPropertyTypes": true` — distinguishes `undefined` from missing
- [ ] Add `"noPropertyAccessFromIndexSignature": true`
- [ ] Fix all resulting errors (expect ~20-40 new errors, mostly adding `?.` or `!` guards)

### 1.5 Fix existing test failures

- [ ] Investigate 23 failing hook integration tests (JSON parse errors in `tests/hooks/integration.test.ts`)
- [ ] Fix or skip environment-dependent tests on Windows

---

## Phase 2 — Structural Improvements (Low Risk)

Small refactors that improve maintainability without changing behavior.

### 2.1 Break up `server.ts` monolith (2327 lines)

Extract tool registrations into focused modules. Each tool handler becomes its own file.

- [ ] Create `src/tools/` directory
- [ ] Extract `ctx_execute` + `ctx_execute_file` → `src/tools/execute.ts`
- [ ] Extract `ctx_batch_execute` → `src/tools/batch-execute.ts`
- [ ] Extract `ctx_search` → `src/tools/search.ts`
- [ ] Extract `ctx_fetch_and_index` → `src/tools/fetch-and-index.ts`
- [ ] Extract `ctx_stats` / `ctx_upgrade` → `src/tools/stats.ts`
- [ ] Extract helper functions (`extractSnippet`, `positionsFromHighlight`, `stripMarkers`, `checkDenyPolicy`, etc.) → `src/tools/helpers.ts`
- [ ] Keep `server.ts` as thin orchestrator: MCP server init + tool registration imports
- [ ] Verify all tests still pass after each extraction

### 2.2 Type the `sessionStats` object

- [ ] Define `SessionStats` interface in `types.ts`
- [ ] Replace inline object literal in `server.ts` (line 208-216)
- [ ] Type `trackResponse` and `trackIndexed` with proper signatures

### 2.3 Type the `ToolResult` properly

- [ ] Move `ToolResult` type to `types.ts` (currently inline in server.ts line 218-221)
- [ ] Use MCP SDK's actual response types where possible instead of custom `ToolResult`

### 2.4 Improve error handling patterns

- [ ] Replace bare `catch {}` blocks that swallow errors with `catch { /* reason */ }` where the suppression is intentional (already mostly done — audit for any without comments)
- [ ] In `executor.ts`: type the Rust compilation error properly instead of `(err as any).stderr`

---

## Phase 3 — Convert `.mjs` to TypeScript (Medium Risk)

Hook scripts and startup files are currently plain JS, untyped, and not linted.

### 3.1 Convert scripts to TypeScript

- [ ] Convert `scripts/version-sync.mjs` → `scripts/version-sync.ts`
- [ ] Convert `scripts/postinstall.mjs` → `scripts/postinstall.ts`
- [ ] Add esbuild step to bundle scripts from TS → `.mjs` output
- [ ] Verify postinstall still works via `npm install`

### 3.2 Convert hook core modules

Start with shared modules (imported by all hook scripts).

- [ ] Convert `hooks/core/stdin.mjs` → TypeScript
- [ ] Convert `hooks/core/routing.mjs` → TypeScript
- [ ] Convert `hooks/core/formatters.mjs` → TypeScript
- [ ] Convert `hooks/core/tool-naming.mjs` → TypeScript
- [ ] Convert `hooks/core/mcp-ready.mjs` → TypeScript
- [ ] Convert `hooks/session-helpers.mjs` → TypeScript
- [ ] Convert `hooks/session-loaders.mjs` → TypeScript
- [ ] Add esbuild bundle steps for hook outputs (they must remain `.mjs` for platform compatibility)

### 3.3 Convert platform-specific hook scripts

- [ ] Claude Code hooks (`hooks/pretooluse.mjs`, etc.)
- [ ] Gemini CLI hooks
- [ ] Cursor hooks
- [ ] VS Code Copilot hooks
- [ ] Kiro hooks
- [ ] Codex hooks

### 3.4 Convert `start.mjs`

- [ ] Convert to `start.ts`, bundle to `start.mjs` via esbuild
- [ ] Verify MCP server startup still works via bundled output

---

## Phase 4 — Hardening (Medium Risk)

Improve runtime robustness without changing features.

### 4.1 Add runtime input validation at MCP boundaries

- [ ] Audit all `z.object()` schemas in tool registrations for completeness
- [ ] Ensure Zod schemas reject unexpected types (already using `z.preprocess` in some places — verify coverage)
- [ ] Add `z.string().url()` validation for `ctx_fetch_and_index` URL input

### 4.2 Improve SQLite robustness

- [ ] Add `PRAGMA integrity_check` on DB open (behind a flag — expensive for large DBs)
- [ ] Improve `withRetry` to use async sleep instead of busy-wait spin loop (line 346 of `db-base.ts`)
- [ ] Add connection pool or mutex for concurrent DB access in batch operations

### 4.3 Improve process lifecycle

- [ ] Add graceful shutdown handler that flushes pending DB writes
- [ ] Ensure `executor.cleanupBackgrounded()` is called on all exit paths
- [ ] Add timeout to `killTree` on Windows (taskkill can hang)

### 4.4 Test coverage gaps

- [ ] Add unit tests for `extractSnippet` / `positionsFromHighlight`
- [ ] Add unit tests for `BunSQLiteAdapter` and `NodeSQLiteAdapter`
- [ ] Add unit tests for `detectPlatform` with various env combinations
- [ ] Add tests for edge cases in `truncate.ts` (`byteSafePrefix` with emoji, surrogate pairs)

---

## Phase 5 — Build & CI Modernization (Low Risk)

### 5.1 Simplify build pipeline

- [ ] Replace the multi-`&&` esbuild one-liner in `package.json` with a `build.ts` script
- [ ] Each entrypoint as a separate esbuild call with shared config
- [ ] Add source maps for dev builds

### 5.2 Add CI checks

- [ ] `npm run lint` (oxlint) in CI
- [ ] `npm run typecheck` in CI
- [ ] `npm test` in CI with retry for flaky hook tests
- [ ] Fail CI on any `any` usage (oxlint rule: `@typescript-eslint/no-explicit-any`)

### 5.3 Add pre-commit hooks

- [ ] Add `lint-staged` + `husky` (or `simple-git-hooks`) for pre-commit
- [ ] Run oxlint + typecheck on staged `.ts` files only

---

## Execution Order & Safety Rules

1. **Each phase is a PR** — never mix phases in one commit
2. **Run `tsc --noEmit` after every change** — zero regressions allowed
3. **Run `vitest run` after every structural change** — passing test count must not decrease
4. **Phase 1 is fully safe** — no behavior changes, only types and tooling
5. **Phase 2 is safe if done file-by-file** — extract one tool handler, test, commit, repeat
6. **Phase 3 changes build output** — verify each hook script still produces identical behavior
7. **Phase 4 may change runtime behavior** — each change needs targeted tests
8. **Never refactor and add features in the same commit**

---

## Files by Risk Level

| Risk | Files |
|------|-------|
| **None** | `types.ts`, `truncate.ts`, `exit-classify.ts`, `lifecycle.ts` |
| **Low** | `security.ts`, `runtime.ts`, `adapters/types.ts`, `adapters/detect.ts` |
| **Medium** | `db-base.ts`, `store.ts`, `executor.ts`, `session/*.ts` |
| **High** | `server.ts`, `cli.ts`, `start.mjs`, hook scripts |

Always start changes from the top of this table (no-risk files) and work down.
