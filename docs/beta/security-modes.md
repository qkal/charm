# Security Modes (`CHARM_SECURITY_MODE`)

Charm supports two explicit policy modes for how to behave when policy evaluation itself fails (for example malformed settings, read/parsing failures, unexpected runtime errors).

## Modes

## `compat` (default)

- Environment value: `CHARM_SECURITY_MODE=compat`
- Behavior: fail-open on policy-evaluation failure (`failOpen=true`)
- Use when: preserving current behavior and avoiding accidental workflow breakage during beta rollout

## `strict`

- Environment value: `CHARM_SECURITY_MODE=strict`
- Behavior: fail-closed on policy-evaluation failure (`failOpen=false`)
- Use when: hardened environments where policy-evaluation failure should block execution

## Invalid values

If `CHARM_SECURITY_MODE` is set to any value other than `compat` or `strict`:

- Charm falls back to `compat`
- A warning is emitted in diagnostics

Example invalid value:

```bash
CHARM_SECURITY_MODE=hardened charm doctor
```

## Rollout recommendation (beta)

1. Keep default `compat` globally to minimize disruption.
2. Enable `strict` in CI/staging first.
3. Expand `strict` to production/dev teams after validating policy files and deny patterns.
4. Monitor `doctor` output and release-readiness artifacts for warnings.

## Verification commands

```bash
charm doctor
CHARM_SECURITY_MODE=strict charm doctor
```

## Related docs

- [Beta Quickstart](quickstart.md)
- [Release Readiness Guide](release-readiness.md)
