# Charm Beta Quickstart

This guide gets Charm from prompt bootstrap to a validated first run in a few minutes.

## 1) Bootstrap via prompt only

Use the bootstrap instruction:

```text
Fetch and follow instructions from https://raw.githubusercontent.com/qkal/charm/refs/heads/main/charm
```

Provider-specific prompts are also available at:

`https://raw.githubusercontent.com/qkal/charm/refs/heads/main/prompts/providers/<provider>.md`

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
2. Re-run the bootstrap prompt instruction
3. Restart the agent/IDE session

## Next docs

- [Security Modes](security-modes.md)
- [Release Readiness Guide](release-readiness.md)
