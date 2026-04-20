# Charm

Charm is an MCP server and operations toolkit focused on reducing context-window pressure while keeping workflows safe, observable, and repeatable.

## Beta Status

Charm is in public beta preparation mode. This branch targets release-candidate readiness:

- Stable core execution and indexing flows
- Explicit security mode behavior (`compat` vs `strict`)
- Automated release-readiness checklist artifacts

## Install (Prompt-Only)

Charm currently supports onboarding through standalone prompts only.

- Bootstrap prompt: `https://raw.githubusercontent.com/qkal/charm/refs/heads/main/charm`
- Provider prompts: `https://raw.githubusercontent.com/qkal/charm/refs/heads/main/prompts/providers/<provider>.md`

Example user instruction:

```text
Fetch and follow instructions from https://raw.githubusercontent.com/qkal/charm/refs/heads/main/charm
```

## Quick Start

1. Verify runtime health:

```bash
charm doctor
```

2. Run release-candidate readiness checks:

```bash
charm release-check
```

3. For MCP usage in this repo, `.mcp.json` already points to `start.mjs`.

## Supported Platforms

Charm includes adapter/config coverage for:

- Claude Code
- Codex CLI
- Cursor
- Gemini CLI
- Kiro
- OpenCode / OpenClaw
- VS Code Copilot
- Zed
- Antigravity
- Pi

## Core Commands

| Command | Purpose |
| --- | --- |
| `charm` | Start MCP server over stdio |
| `charm doctor` | Adapter-aware diagnostics (runtimes, hooks, FTS5, versions, security mode) |
| `charm release-check [--ci]` | Run RC checklist and emit artifacts |
| `charm insight [port]` | Open analytics dashboard |

## Security Mode

Charm supports explicit policy-failure behavior:

- `CHARM_SECURITY_MODE=compat` (default): fail-open on policy-evaluation failures for compatibility.
- `CHARM_SECURITY_MODE=strict`: fail-closed on policy-evaluation failures for hardened environments.

For migration guidance and examples, see [Security Modes](docs/beta/security-modes.md).

## Release Readiness Artifacts

`charm release-check` and `npm run release:check` produce:

- `artifacts/release-readiness.json`
- `artifacts/release-readiness.md`

These artifacts are also uploaded by the `release-readiness` GitHub Actions workflow.

## Troubleshooting

- Run `charm doctor` first for environment issues.
- Re-run the bootstrap prompt instruction to refresh adapter setup and hooks.

## Docs Index

- [Beta Quickstart](docs/beta/quickstart.md)
- [Security Modes](docs/beta/security-modes.md)
- [Release Readiness Guide](docs/beta/release-readiness.md)
