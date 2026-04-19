# Charm Beta Quickstart

This guide gets Charm from install to a validated first run in a few minutes.

## 1) Install

### Global

```bash
npm install -g charm
```

### Local repo

```bash
npm install
npm run build
```

## 2) Verify the environment

Run:

```bash
charm doctor
```

Expected outcome:

- Runtime detection completes
- Hook/config checks return pass or actionable warnings
- FTS5 / SQLite check passes
- Security mode is displayed (`COMPAT` by default)

## 3) Run release-candidate readiness checks

Run:

```bash
charm release-check
```

Expected artifacts:

- `artifacts/release-readiness.json`
- `artifacts/release-readiness.md`

## 4) Optional hardening switch

To opt into stricter policy behavior:

```bash
CHARM_SECURITY_MODE=strict charm doctor
```

## 5) Troubleshooting checklist

1. `charm doctor`
2. `charm upgrade`
3. `npm rebuild better-sqlite3` (if SQLite native module issues appear)

## Next docs

- [Security Modes](security-modes.md)
- [Release Readiness Guide](release-readiness.md)
