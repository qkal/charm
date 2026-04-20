import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadDatabase } from "../db-base.js";
import { PolyglotExecutor } from "../executor.js";
import { hasBunRuntime, type RuntimeMap } from "../runtime.js";
import type { SecurityModeResolution } from "../types.js";

export function resolvePluginRoot(pkgDir: string): string {
  return existsSync(resolve(pkgDir, "package.json")) ? pkgDir : dirname(pkgDir);
}

export async function buildDoctorReport(opts: {
  available: string[];
  pkgDir: string;
  runtimes: RuntimeMap;
  version: string;
  securityMode: SecurityModeResolution;
}): Promise<string> {
  const lines: string[] = ["## charm doctor", ""];
  const pluginRoot = resolvePluginRoot(opts.pkgDir);

  const total = 11;
  const pct = ((opts.available.length / total) * 100).toFixed(0);
  lines.push(`- [x] Runtimes: ${opts.available.length}/${total} (${pct}%) — ${opts.available.join(", ")}`);

  if (hasBunRuntime()) {
    lines.push("- [x] Performance: FAST (Bun)");
  } else {
    lines.push("- [-] Performance: NORMAL — install Bun for 3-5x speed boost");
  }

  lines.push(
    `- [x] Security mode: ${opts.securityMode.mode.toUpperCase()} ` +
      `(CHARM_SECURITY_MODE, beta default: COMPAT)`,
  );
  if (opts.securityMode.warning) {
    lines.push(`- [-] Security mode warning: ${opts.securityMode.warning}`);
  }

  {
    const testExecutor = new PolyglotExecutor({ runtimes: opts.runtimes });
    try {
      const result = await testExecutor.execute({
        language: "javascript",
        code: 'console.log("ok");',
        timeout: 5000,
      });
      if (result.exitCode === 0 && result.stdout.trim() === "ok") {
        lines.push("- [x] Server test: PASS");
      } else {
        const detail = result.stderr?.trim()
          ? ` (${result.stderr.trim().slice(0, 200)})`
          : "";
        lines.push(`- [ ] Server test: FAIL — exit ${result.exitCode}${detail}`);
      }
    } catch (err: unknown) {
      lines.push(`- [ ] Server test: FAIL — ${err instanceof Error ? err.message : err}`);
    } finally {
      testExecutor.cleanupBackgrounded();
    }
  }

  {
    let testDb:
      | {
          exec: (sql: string) => unknown;
          prepare: (sql: string) => { get: () => unknown };
          close?: () => void;
        }
      | undefined;
    try {
      const Database = loadDatabase();
      testDb = new Database(":memory:");
      testDb.exec("CREATE VIRTUAL TABLE fts_test USING fts5(content)");
      testDb.exec("INSERT INTO fts_test(content) VALUES ('hello world')");
      const row = testDb.prepare("SELECT * FROM fts_test WHERE fts_test MATCH 'hello'").get() as { content: string } | undefined;
      if (row && row.content === "hello world") {
        lines.push("- [x] FTS5 / SQLite: PASS — native module works");
      } else {
        lines.push("- [ ] FTS5 / SQLite: FAIL — unexpected result");
      }
    } catch (err: unknown) {
      lines.push(`- [ ] FTS5 / SQLite: FAIL — ${err instanceof Error ? err.message : err}`);
    } finally {
      try { testDb?.close?.(); } catch { /* best effort */ }
    }
  }

  const hookPath = resolve(pluginRoot, "hooks", "pretooluse.mjs");
  if (existsSync(hookPath)) {
    lines.push(`- [x] Hook script: PASS — ${hookPath}`);
  } else {
    lines.push(`- [ ] Hook script: FAIL — not found at ${hookPath}`);
  }

  lines.push(`- [x] Version: v${opts.version}`);
  return lines.join("\n");
}

export async function buildUpgradeMessage(opts: {
  pkgDir: string;
}): Promise<string> {
  const pluginRoot = resolvePluginRoot(opts.pkgDir);
  const bootstrapUrl = "https://raw.githubusercontent.com/qkal/charm/refs/heads/main/charm";
  const providerPattern = "https://raw.githubusercontent.com/qkal/charm/refs/heads/main/prompts/providers/<provider>.md";

  return [
    "## ctx-upgrade",
    "",
    "NPM-based upgrade/install is currently disabled in this beta.",
    "",
    "Use prompt-based bootstrap instead:",
    "",
    `- Bootstrap prompt: ${bootstrapUrl}`,
    `- Provider prompts: ${providerPattern}`,
    "",
    "Example instruction:",
    "",
    "```text",
    `Fetch and follow instructions from ${bootstrapUrl}`,
    "```",
    "",
    "After bootstrap, restart your agent/IDE session.",
    "",
    `Detected plugin root: ${pluginRoot}`,
  ].join("\n");
}
