# Server Composition And Regression Design

Date: 2026-04-19
Repo: `C:\Users\Better\Documents\charm`
Status: Draft approved in chat, written for review

## Goal

Execute the next hardening slice by decomposing [`src/server.ts`](C:\Users\Better\Documents\charm\src\server.ts) into clearer composition boundaries while expanding general and regression test coverage, with strict CI merge gates.

This slice follows the already-completed extraction of `PolicyEngine`, `ExecutionService`, and `ExecutionEffects`. The focus now is composition integrity and sustained reliability, not feature work.

## Scope

This design covers:

- further decomposition of `server.ts` into composition-friendly modules
- explicit preservation of current MCP/runtime invariants
- general test expansion and regression test hardening
- CI enforcement strategy (fast iteration + hard merge gates)

This design does not cover:

- end-user feature additions
- adapter redesign beyond what composition extraction requires
- content store algorithm rewrites
- major CLI/packaging redesign

## Context

`server.ts` still carries multiple concerns in one file:

- MCP bootstrapping and capability registration
- tool registration for multiple domains
- stats and response tracking
- lifecycle shutdown wiring
- cache/preload and cleanup behavior

Even after execution extraction, this concentration increases change risk and makes it easy to break hidden contracts.

## Approaches Considered

1. Keep refactoring ad hoc inside `server.ts`
- fastest initially
- highest long-term regression risk
- unclear boundaries

2. Big-bang rewrite of `server.ts`
- potentially cleanest end-state
- highest migration and compatibility risk

3. Incremental composition extraction with invariant locks (recommended)
- controlled risk
- preserves existing behavior
- creates enforceable test contracts per extracted boundary

## Recommended Architecture

Use `server.ts` as a thin composition root with extracted registration/bootstrap helpers.

### Target module boundaries

- `server/bootstrap/*`
  - MCP server construction
  - capability registration
  - transport connect and startup sequencing

- `server/tools/*`
  - grouped tool registration functions by domain:
    - execution
    - indexing/search/fetch
    - batch
    - diagnostics/ops (`ctx_doctor`, `ctx_upgrade`, `ctx_purge`, `ctx_stats`)
    - insight

- `server/session/*`
  - session stats accumulator wiring
  - response tracking and metrics adapters

- `server/lifecycle/*`
  - shutdown order
  - preload cleanup
  - executor background cleanup wiring

- `server/compat/*`
  - compatibility helpers for behavior that is currently test-pinned

`server.ts` should only orchestrate dependency wiring, not contain domain logic.

## Non-Negotiable Invariants

These are compatibility locks that must remain true during decomposition:

- empty prompts/resources/resource-template handlers remain registered to prevent `-32601` client breakage
- `ctx_doctor` remains in-process (no CLI delegation)
- `ctx_upgrade` keeps current bundle-first fallback behavior
- `trackResponse` and stats accounting semantics stay intact
- `CM_FS_PRELOAD` behavior and cleanup stay intact
- `__CM_FS__` and `__CM_NET__` parsing and stripping behavior stay intact
- lifecycle shutdown order preserves process cleanup guarantees
- cross-platform execution behavior remains unchanged

Any intentional change to one invariant requires:

- explicit spec amendment
- targeted regression tests
- migration note in PR

## Testing Strategy

Testing is a first-class deliverable for this slice.

### 1) Fast Iteration Suite (local during refactor)

Run targeted tests for touched boundaries on every development loop:

- new/updated module unit tests
- server invariants affected by current extraction
- boundary integration tests

Purpose:

- keep refactor cycle fast
- catch local regressions early

### 2) Slice Checkpoint Gate (required before each refactor checkpoint commit)

Required commands:

- `pnpm typecheck`
- `pnpm test:release-blocking`

Purpose:

- ensure each checkpoint is production-safe
- avoid stacking hidden regressions across multiple commits

### 3) Merge Gate (hard CI requirement)

Protected branch must require green status for:

- `typecheck`
- `test:release-blocking`

No merge without both checks passing.

### 4) Regression Invariant Test Expansion

Add/strengthen tests that assert composition-sensitive behavior:

- capability/handler registration invariants
- diagnostics/upgrade behavior invariants
- preload/metrics extraction invariants
- lifecycle cleanup invariants
- tool registration surfaces and response-shaping invariants

Regression tests should validate externally visible behavior, not internal file layout.

### 5) General Test Expansion

Add general tests for newly extracted modules:

- unit tests per module boundary
- integration tests for composition wiring
- minimal smoke tests for startup/registration path

## CI And Delivery Policy

Best-practice enforcement model:

1. Local developers iterate with fast targeted tests.
2. Every checkpoint commit must pass typecheck + release-blocking locally.
3. CI runs the same required gates.
4. Branch protection blocks merge on any gate failure.

This gives both speed and safety.

## Migration Plan

### Phase 0: Freeze current behavior baseline

- inventory current invariants
- identify test files that already pin behavior
- add any missing invariant tests before moving code

Success criteria:

- no blind refactor of untested behavior

### Phase 1: Extract composition helpers

- move bootstrap/capability registration
- move tool registration groups
- keep existing public tool contracts unchanged

Success criteria:

- smaller `server.ts`
- no behavior drift in release-blocking tests

### Phase 2: Extract lifecycle/session wiring

- isolate shutdown and cleanup sequencing
- isolate stats/response tracking wiring

Success criteria:

- explicit ownership of runtime lifecycle
- preserved metrics and cleanup behavior

### Phase 3: Harden tests and CI enforcement

- complete invariant and general test additions
- codify required CI checks in branch protection/docs

Success criteria:

- merge requires hard green gates
- regression-sensitive behavior covered by targeted tests

## Risks And Mitigations

### Risk: superficial decomposition

Moving code into more files without clearer contracts.

Mitigation:

- each extracted module must have a clear owner and tests
- reject pure “move-only” extraction without boundary intent

### Risk: hidden compatibility regressions

Breaking tool behavior while preserving compile/test superficially.

Mitigation:

- invariant tests prioritized before extraction
- release-blocking gate on every checkpoint

### Risk: developer friction from strict gates

Slower loops if only full suite is used.

Mitigation:

- use fast targeted suite during iteration
- enforce full gates at checkpoints and merge

## Success Criteria

This slice is successful when:

- `server.ts` is materially slimmer and mostly composition wiring
- extracted modules have direct tests
- release-blocking suite stays green through each checkpoint
- CI merge gate enforces `typecheck` + `test:release-blocking`
- core MCP/runtime invariants remain stable

## Implementation Planning Readiness

This spec is ready for implementation planning with explicit milestones:

- extraction milestones by boundary
- test additions per milestone
- checkpoint gate commands
- merge gate readiness tasks

