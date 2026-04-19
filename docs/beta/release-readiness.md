# Release Readiness Guide

Charm includes a single checklist runner for release-candidate validation.

## Commands

### Local

```bash
charm release-check
```

or

```bash
npm run release:check
```

### CI mode

```bash
npm run release:check:ci
```

## What is validated

`release-check` runs these gates in order:

1. `npm run typecheck`
2. `npm run test:release-blocking`
3. `npm run build`
4. `npm pack --dry-run`

## Output artifacts

The runner writes:

- `artifacts/release-readiness.json` (machine-readable)
- `artifacts/release-readiness.md` (human-readable)

Both include per-step status, exit code, duration, and command string.

## Pass / fail criteria

- **PASS**: all four steps exit with code `0`
- **FAIL**: one or more steps fail (runner exits non-zero)

## CI workflow

`.github/workflows/release-readiness.yml` runs this checklist on:

- `push` to `main`
- manual `workflow_dispatch`

It uploads both readiness artifacts for audit.

## Recommended RC workflow

1. Run `charm release-check` locally.
2. Review generated markdown report for warnings/failures.
3. Push branch and verify CI `release-readiness` job artifacts.
4. Only then proceed to version bump/release tasks.

## Related docs

- [Beta Quickstart](quickstart.md)
- [Security Modes](security-modes.md)
