# Core Hardening Design

Date: 2026-04-18
Repo: `C:\Users\Better\Documents\charm`
Status: Draft approved in chat, written for review

## Goal

Improve `charm` from the ground up by hardening the most important core code paths while making the codebase easier to understand, evolve, and secure.

This first design focuses on the runtime core rather than new features. The primary target is the logic currently concentrated in [`src/server.ts`](C:\Users\Better\Documents\charm\src\server.ts), especially the execution, policy, lifecycle, and tool-wiring paths that currently mix multiple responsibilities in one place.

## Why This First

The current core has a high-value but risky shape:

- `src/server.ts` acts as both composition root and operational logic hub.
- Execution, policy checks, diagnostics, store access, lifecycle, and formatting live too close together.
- Security-sensitive behavior is hard to reason about because the trust boundary is spread across modules and handlers.
- Test coverage exists, but the runtime core still lacks a single, explicit architectural center that can be locked down with focused contracts.

Starting here gives the largest maintainability and safety improvement without requiring a feature rewrite.

## Scope

This design covers:

- internal restructuring of the core runtime path
- security and policy hardening around execution
- migration of risky flows to a single internal boundary
- regression-oriented testing for the new boundaries

This design does not cover:

- broad adapter redesign
- new end-user features
- large changes to store/search architecture beyond what is needed for separation of concerns
- ecosystem-wide packaging changes except where needed to preserve compatibility during migration

## Design Principles

- Safety before elegance: risky execution paths get centralized before cosmetic refactors.
- Small modules with one purpose: no new giant replacement for `server.ts`.
- Compatibility by migration: external behavior may change where justified, but changes must be staged so the app remains usable throughout the refactor.
- One trusted path for dangerous operations: policy evaluation and execution must not be duplicated across handlers.
- Test the boundaries we create: each extracted responsibility must gain direct tests, not just indirect coverage.

## Recommended Approach

Use a phased architecture-first hardening plan centered on two steps:

1. Extract a new execution and security boundary.
2. Refactor the MCP server into a thin composition root that depends on that boundary.

This approach is preferred over a composition-only cleanup because it reduces real operational risk first. It is preferred over a full rewrite because it gives controlled migration points and rollback options.

## Target Architecture

The new center of the system should be a thin orchestrator over a small set of focused modules.

### Core Modules

#### `PolicyEngine`

Owns command, file, and tool policy evaluation.

Responsibilities:

- parse and load policy inputs
- evaluate allow, deny, and ask decisions
- normalize policy decisions into stable internal results
- provide one place to evolve trust-boundary logic

Policy evaluation must be context-aware:

- interactive hook contexts may continue to use `allow`, `deny`, and `ask`
- MCP server contexts remain deny-enforcing by default until a real server-side ask/approval path exists

The first hardening pass must not accidentally introduce unreachable `ask` states into the server runtime or silently weaken current deny-only behavior.

Non-responsibilities:

- process spawning
- MCP request validation
- response formatting

#### `ExecutionEngine`

Owns runtime selection and process execution.

Responsibilities:

- runtime resolution
- temp file strategy
- subprocess spawn and cleanup
- timeout enforcement
- background process handling
- environment shaping needed for safe execution

Non-responsibilities:

- business-level policy decisions
- MCP tool semantics

#### `ResultNormalizer`

Owns stable internal result shaping.

Responsibilities:

- normalize stdout, stderr, exit code, timeout, and partial-output states
- produce result envelopes that higher layers can depend on
- remove ad hoc result interpretation from handlers

#### `ExecutionEffects`

Owns tool-visible side effects that happen after execution but are still part of observable behavior.

Responsibilities:

- output indexing decisions
- session stats accounting
- sandboxed-bytes and cache accounting
- warning decoration and response metadata that are currently coupled to tool responses

This keeps the system from preserving raw execution behavior while accidentally regressing searchability, analytics, or user-visible warning behavior.

#### `ProcessLifecycleManager`

Owns process and shutdown semantics.

Responsibilities:

- manage background process bookkeeping
- coordinate cleanup during shutdown
- standardize behavior for lifecycle-triggered termination
- own the shutdown ordering between lifecycle guard callbacks, executor cleanup, and transport close

This ownership must be explicit so background processes are neither leaked nor double-killed during migration.

#### `ExecutionService`

Acts as a thin orchestrator, not a new god object.

Responsibilities:

- accept normalized execution requests
- call `PolicyEngine`
- call `ExecutionEngine`
- call `ResultNormalizer`
- call `ExecutionEffects` when a tool flow requires post-execution indexing, accounting, or warning decoration
- return a stable internal result contract

This is the internal boundary the MCP server should depend on.

#### `ToolHandlers`

MCP-facing adapters that should stay thin.

Responsibilities:

- validate tool input
- translate tool requests into internal service calls
- format service results into MCP tool responses

They must not reimplement security checks or low-level process logic.

### Composition Root

After migration, `src/server.ts` should primarily:

- create the MCP server
- register tools and handlers
- wire dependencies together
- bootstrap diagnostics, session, and lifecycle services

It should no longer own business logic for execution and policy enforcement.

### Non-Negotiable Compatibility Invariants

The composition refactor must preserve a small set of behavior that is easy to accidentally drop even though clients and tests depend on it.

- empty prompts/resources/resource-template handlers must remain registered so MCP clients do not hit `-32601` transport issues
- `ctx_doctor` must keep running diagnostics in-process rather than shelling out through a CLI path
- `ctx_upgrade` must preserve the current bundle-first fallback behavior
- tool responses that currently index output or update runtime/session stats must keep doing so unless explicitly redesigned and documented
- cross-platform execution invariants must stay intact, especially Windows shell resolution, safe env shaping, temp-dir handling, and process-tree cleanup

## Target Flow

The desired core flow is:

`ToolHandler -> request validation -> ExecutionService -> PolicyEngine -> ExecutionEngine -> ResultNormalizer -> tool response formatter`

This creates one trusted path for dangerous operations and removes the current pattern where multiple concerns are partially coordinated inside `server.ts`.

## Migration Plan

The migration should be phased so `charm` stays operational throughout the rewrite.

### Phase 0: Freeze critical invariants before extraction

Before moving logic, explicitly inventory and preserve the contracts that the refactor is not allowed to casually break.

Minimum frozen invariants:

- MCP capability/handler registration that keeps clients stable
- deny-only server policy behavior versus interactive ask-capable hook behavior
- execution side effects such as indexing, stats, cache accounting, and warning decoration
- cross-platform runtime and env behavior
- timeout, output-cap, and process-tree cleanup semantics

Success criteria:

- the plan starts from a known behavior baseline
- extraction work can be measured against explicit compatibility targets rather than memory

### Phase 1: Define internal contracts

Create stable request and response contracts for execution and policy outcomes.

Expected outputs:

- normalized execution request type
- normalized policy decision type
- normalized execution result type
- normalized execution-effects contract for indexing, stats, and response decoration where applicable

Success criteria:

- internal callers can target a stable interface before behavior moves
- current logic can be wrapped instead of rewritten immediately

### Phase 2: Extract execution and policy internals

Move policy and execution logic behind the new service boundary without changing public tool names.

Success criteria:

- policy checks no longer live in tool handlers
- execution paths use the new service internally
- current external commands still run through compatibility wrappers where needed

### Phase 3: Migrate highest-risk tool flows first

Start with the most security-sensitive execution paths before lower-risk flows.

Selection heuristic:

- tools that execute commands or scripts
- tools that read files or apply deny patterns
- flows with timeout, lifecycle, or background-process complexity

Success criteria:

- risky flows are routed through one service path
- regressions can be isolated to a single migrated flow

### Phase 4: Reduce `server.ts` to composition

After migrated flows are stable, move remaining operational concerns into dedicated modules.

Likely extractions:

- tool registration helpers
- diagnostics/version-warning logic
- session/store bootstrapping helpers
- lifecycle bootstrap wiring

Success criteria:

- `server.ts` is visibly smaller and easier to navigate
- responsibilities are grouped by role, not by historical accumulation

## Security Hardening Strategy

The hardening strategy is structural, not just defensive patching.

### Main security outcomes

- a single policy decision path for shell, file, and tool access
- fewer chances for policy bypass through handler-local behavior
- clearer trust boundaries between validation, authorization, execution, and formatting
- stronger lifecycle cleanup for processes that outlive requests

### Specific hardening goals

- eliminate policy duplication across the server layer
- make policy decisions explicit and typed
- ensure execution cannot bypass the central policy boundary
- keep server-side policy semantics honest: deny-enforcing until an actual approval interaction exists
- normalize timeout and shutdown behavior so failure states are predictable
- isolate environment shaping and temp-file behavior to one execution owner

## Testing Strategy

Testing should follow the new architecture rather than only snapshotting old behavior.

### Unit Tests

Add or expand focused unit tests for:

- policy parsing and matching
- allow, deny, and ask decision behavior
- normalized execution result mapping
- lifecycle and cleanup helpers

### Integration Tests

Add or expand integration tests for:

- `ExecutionService` under allow, deny, timeout, and failure scenarios
- background process cleanup and shutdown behavior
- compatibility behavior for migrated tool flows
- execution-effects behavior for indexing, stats, warnings, and cache accounting

### Regression Tests

Retain and expand regression tests for:

- core MCP tool contracts that must remain intact
- failure-path behavior that historically caused instability
- cross-platform runtime selection and process handling
- capability-registration behavior that keeps MCP clients from failing early
- output-cap, temp-dir, safe-env, and process-tree cleanup invariants

### Test Success Criteria

- new modules have direct tests for their owned behavior
- risky flows are covered by integration tests through the new boundary
- the refactor reduces ambiguity instead of shifting it into mocks or implicit coupling

## Compatibility Policy

This refactor may introduce targeted external contract changes where they materially improve safety or structure, but it should not break the app wholesale.

Rules for change:

- preserve tool names unless there is a strong reason to change them
- prefer internal rewiring before public behavior changes
- if public behavior changes, keep it small, documented, and backed by regression coverage
- avoid big-bang migrations with no rollback point

## Success Metrics

This first hardening pass is successful when:

- `src/server.ts` has substantially fewer responsibilities
- policy enforcement is centralized
- execution runs through one internal service path
- lifecycle/process cleanup semantics are easier to reason about
- core runtime tests better capture failure and security-sensitive behavior
- the codebase is easier to extend without copying logic into new handlers

## Risks And Mitigations

### Risk: superficial modularization

The code could be moved into more files without improving trust boundaries.

Mitigation:

- require explicit ownership for each extracted module
- reject modules that merely proxy unclear behavior

### Risk: migration regressions

A changed execution path could break existing tools.

Mitigation:

- migrate one risky flow at a time
- add compatibility wrappers
- expand integration coverage before removing old paths
- treat execution side effects as part of behavior, not as optional cleanup

### Risk: creating a new god object

`ExecutionService` could become another overloaded center.

Mitigation:

- keep orchestration thin
- push owned logic into `PolicyEngine`, `ExecutionEngine`, and `ResultNormalizer`

### Risk: scope expansion

This could drift into adapter, packaging, or feature redesign.

Mitigation:

- keep the first plan constrained to core runtime hardening
- defer broader ecosystem work to later specs

## Non-Goals For This Spec

- redesigning every adapter in this pass
- rewriting the content store architecture
- changing product positioning
- introducing unrelated cleanup across the entire repo

## Implementation Planning Readiness

This spec is intended to be narrow enough for a dedicated implementation plan.

The implementation plan should break work into small, reviewable steps that:

- define the internal contracts first
- extract the policy and execution boundary next
- migrate high-risk flows incrementally
- finish by shrinking `server.ts` into a composition root
