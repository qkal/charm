# Server Refactor + Commercial Readiness Design

- Date: 2026-04-20
- Status: Approved for specification
- Decision owner: Product + Engineering
- Scope order: (1) Reduce core complexity with performance-led modularization, then (2) improve cross-platform reliability

## 1. Problem Statement

`src/server.ts` has become a central monolith for tool registration, request handling, validation, orchestration, and response shaping. This increases change risk, slows onboarding, and makes performance tuning harder.

At the same time, reliability confidence across OSes must improve after the core refactor. The selected business direction is:

1. Refactor first where it improves hot-path performance and architecture together.
2. Allow targeted behavior changes only when they materially simplify architecture or improve latency.
3. Enforce a strict performance bar: at least 25% p95 improvement on `ctx_search` and `ctx_batch_execute`.

## 2. Goals

1. Reduce server complexity through clear module boundaries and single-purpose components.
2. Achieve `>=25%` p95 latency improvement for `ctx_search` and `ctx_batch_execute` versus baseline.
3. Preserve operational safety with explicit commercial-grade release gates.
4. Follow with cross-platform reliability hardening (Windows/Linux/macOS required matrix).

## 3. Non-Goals

1. No broad product re-scope or unrelated feature expansion.
2. No adapter-wide rewrite in this phase (except touchpoints needed by server refactor).
3. No unbounded API redesign; external behavior changes must be minimal and documented.

## 4. Selected Strategy

Chosen strategy: **Performance-led modularization**.

Why this strategy:

1. Refactor-only sequencing may miss the aggressive latency target.
2. Deep rewrite has higher regression and schedule risk.
3. Performance-led modularization aligns directly to the KPI while still reducing complexity.

## 5. Target Architecture

## 5.1 Entry-point shell

`src/server.ts` becomes a thin orchestrator responsible only for:

1. Tool registration wiring
2. Dependency wiring
3. Delegation to dedicated tool handlers

## 5.2 Tool modules

Create focused modules:

1. `src/server/tools/search.ts` for `ctx_search`
2. `src/server/tools/batch-execute.ts` for `ctx_batch_execute`

Optional adjacent extraction for consistency after hot paths stabilize:

1. `src/server/tools/fetch-and-index.ts`
2. `src/server/tools/stats.ts`

## 5.3 Shared pipeline modules

1. `src/server/context.ts` for request-scoped state (`traceId`, timers, policy state, runtime flags)
2. `src/server/contracts.ts` for strict input/output contracts and tool result shapes
3. `src/server/perf.ts` for timing capture, benchmark adapters, and gate hooks
4. Shared validation + coercion utilities with one-pass normalization
5. Shared response shaping utilities to eliminate duplicate formatting logic

## 5.4 Boundary rules

1. Hot path cannot perform duplicate parse/normalize/format passes.
2. Store lookups must avoid repeated scans for identical query tokens in a request.
3. Side effects (metrics/logging) are non-blocking and isolated from core result generation.

## 6. Data Flow Design

## 6.1 `ctx_search`

1. Validate and normalize input once.
2. Build `RequestContext` once.
3. Build query plan (dedupe, normalize terms, precompute ranking hints).
4. Execute store lookup + ranking pipeline.
5. Shape final response once.
6. Emit latency + outcome metrics with `traceId`.

## 6.2 `ctx_batch_execute`

1. Validate commands/queries once.
2. Build deterministic execution plan (controlled concurrency).
3. Execute commands and collect outputs in stable order.
4. Index command outputs in a single pass.
5. Run follow-up search over in-memory/indexed state without rebuilding context.
6. Shape final response and emit per-command + end-to-end timings.

## 7. Commercial Acceptance Gates

## 7.1 Must-have (blocking)

1. Performance gate:
   - `ctx_search` p95 `<= 0.75 * baseline`
   - `ctx_batch_execute` p95 `<= 0.75 * baseline`
   - Absolute SLO caps on benchmark profile:
     - `ctx_search` p95 `<= 250ms`, p99 `<= 500ms`
     - `ctx_batch_execute` p95 `<= 1200ms`, p99 `<= 2500ms`
   - `p99` non-regression threshold enforced
   - Repeat-run variance threshold enforced (`CV <= 10%` across measured runs)
2. Reliability gate:
   - Error rate non-regression under identical benchmark profile
   - Automatic rollback trigger during staged rollout:
     - Trigger if any condition fails for 2 consecutive 5-minute windows:
       - p95 exceeds cap by `>10%`
       - p99 regresses by `>20%` vs baseline
       - Error rate `> baseline + 0.5pp` or `>2x baseline` (whichever is stricter)
   - Rollback decision and execution must complete within 15 minutes of confirmed trigger
3. Cross-platform gate:
   - Required CI matrix pass on Windows, Linux, macOS for hot-path changes
4. Compatibility gate:
   - Contract tests for tool response shape are blocking
   - Behavior changes require semver classification and migration notes
5. Security gate:
   - Input-boundary negative tests + policy-mode tests (compat/strict)
   - Security regression checks required in release checklist
6. Observability gate:
   - Request correlation IDs (`traceId`) end-to-end
   - Tool-level latency/error metrics present and validated
7. Supply-chain compliance gate:
   - SBOM artifact generated
   - SBOM format is CycloneDX JSON and is attached to release artifact bundle
   - License-policy checks pass:
     - Allowed by default: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC
     - Denied by default: GPL-3.0, AGPL-3.0, SSPL (unless approved exception)
   - Dependency vulnerability policy enforced:
     - Block release on any open Critical vulnerability
     - Block release on any open High vulnerability without approved time-bound exception
   - All exceptions require Security + Product sign-off and expiration date (max 30 days)
8. Security operations gate:
   - Incident runbook attached to release
   - Named on-call and rollback authority
9. Data governance gate:
   - Telemetry data classification complete
   - Retention + redaction policy documented and tested
10. Business continuity gate:
   - Backup/restore verification for stateful components
   - DR drill cadence documented and executed at least quarterly
   - Recovery objectives defined and validated:
     - `RTO <= 60 minutes`
     - `RPO <= 15 minutes`
   - At least one successful restore drill in the last 90 days is required for release
11. Auditability gate:
   - Immutable release artifact bundle linked to version tag
12. Change-control gate:
   - Required sign-off from Engineering, Security, and Product owner

## 7.2 Should-have (quality multipliers)

1. Automated benchmark trend comments on PRs
2. Fault-injection suites for lock contention and partial command failures
3. Node runtime variant coverage in CI
4. Backward-compatibility shadow tests against last release artifacts
5. Lightweight fuzzing on normalization/coercion paths
6. SLO burn-rate alert validation before promotion

## 8. Benchmark Methodology

1. Baseline snapshot recorded before refactor.
2. Fixed benchmark datasets and command/query fixtures.
3. Fixed warmup and iteration count (`warmup=5`, `measured=30` per tool/profile).
4. Multiple repeated runs (`>=5 benchmark rounds`) with variance thresholds (`CV <= 10%`).
5. Report includes p50, p95, p99, error rate, and environment metadata.
6. Gate compares like-for-like runtime/OS conditions.

## 9. Rollout Plan

Progressive deployment stages:

1. 5% traffic / usage exposure
2. 20%
3. 50%
4. 100%

Promotion requires all gates green at each stage. Automatic rollback on breach of latency/error thresholds.
Each stage requires at least 24 hours of stable observation before promotion.

## 10. Cross-Platform Reliability Phase (After Complexity Refactor)

1. Remove/replace remaining Windows skip conditions where feasible.
2. Stabilize filesystem/path behavior across OSes.
3. Validate hook and lifecycle behavior parity in matrix tests.
4. Add platform-specific regressions to permanent CI suites.

Exit criteria for this phase:

1. Required CI matrix has 10 consecutive green runs (Windows/Linux/macOS).
2. Flake rate in release-blocking suites is `<2%` over the most recent 20 matrix runs.
3. No unresolved platform-blocking skips remain in release-blocking suites.

## 11. Risks and Mitigations

1. Risk: Aggressive p95 goal increases change scope.
   Mitigation: Slice refactor by hot path boundaries; benchmark after each slice.
2. Risk: Hidden behavior drift during module extraction.
   Mitigation: Contract tests + migration-note policy for visible changes.
3. Risk: Cross-platform regressions from performance optimizations.
   Mitigation: Required OS matrix and rollback triggers.

## 12. Definition of Done

Work is complete only when:

1. Architecture split is merged with thin `server.ts` orchestrator pattern.
2. `ctx_search` and `ctx_batch_execute` pass `>=25%` p95 improvement gates.
3. All must-have commercial gates pass with artifacts attached to release.
4. Cross-platform reliability phase completes with required matrix stability.

## 13. Traceability Artifacts

Required release artifact bundle:

1. Benchmark results and baseline comparison report
2. CI matrix report (Windows/Linux/macOS)
3. Contract-test report
4. Security scan + policy-mode test report
5. SBOM + license check report
6. Sign-off record (Engineering/Security/Product)

