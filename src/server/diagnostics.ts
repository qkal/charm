import { existsSync, writeFileSync } from "node:fs";
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
  const bundlePath = resolve(pluginRoot, "cli.bundle.mjs");
  const fallbackPath = resolve(pluginRoot, "build", "cli.js");

  let cmd: string;

  if (existsSync(bundlePath)) {
    cmd = `node "${bundlePath}" upgrade`;
  } else if (existsSync(fallbackPath)) {
    cmd = `node "${fallbackPath}" upgrade`;
  } else {
    const repoUrl = "https://github.com/lovablia/charm.git";
    const copyDirs = ["build", "hooks", "skills", "scripts", ".claude-plugin"];
    const copyFiles = ["start.mjs", "server.bundle.mjs", "cli.bundle.mjs", "package.json"];

    const scriptLines = [
      `import{execFileSync}from"node:child_process";`,
      `import{cpSync,rmSync,existsSync,mkdtempSync}from"node:fs";`,
      `import{join}from"node:path";`,
      `import{tmpdir}from"node:os";`,
      `const P=${JSON.stringify(pluginRoot)};`,
      `const T=mkdtempSync(join(tmpdir(),"ctx-upgrade-"));`,
      `try{`,
      `console.log("- [x] Starting inline upgrade (no CLI found)");`,
      `execFileSync("git",["clone","--depth","1","${repoUrl}",T],{stdio:"inherit"});`,
      `console.log("- [x] Cloned latest source");`,
      `execFileSync("npm",["install"],{cwd:T,stdio:"inherit"});`,
      `execFileSync("npm",["run","build"],{cwd:T,stdio:"inherit"});`,
      `console.log("- [x] Built from source");`,
      ...copyDirs.map(
        (dirName) =>
          `if(existsSync(join(T,${JSON.stringify(dirName)})))cpSync(join(T,${JSON.stringify(dirName)}),join(P,${JSON.stringify(dirName)}),{recursive:true,force:true});`,
      ),
      ...copyFiles.map(
        (fileName) =>
          `if(existsSync(join(T,${JSON.stringify(fileName)})))cpSync(join(T,${JSON.stringify(fileName)}),join(P,${JSON.stringify(fileName)}),{force:true});`,
      ),
      `console.log("- [x] Copied build artifacts");`,
      `execFileSync("npm",["install","--production"],{cwd:P,stdio:"inherit"});`,
      `console.log("- [x] Installed production dependencies");`,
      `console.log("## charm upgrade complete");`,
      `}catch(e){`,
      `console.error("- [ ] Upgrade failed:",e.message);`,
      `process.exit(1);`,
      `}finally{`,
      `try{rmSync(T,{recursive:true,force:true})}catch{}`,
      `}`,
    ].join("\n");

    const tmpScript = resolve(pluginRoot, ".ctx-upgrade-inline.mjs");
    writeFileSync(tmpScript, scriptLines);
    cmd = `node "${tmpScript}"`;
  }

  return [
    "## ctx-upgrade",
    "",
    "Run this command using your shell execution tool:",
    "",
    "```",
    cmd,
    "```",
    "",
    "After the command completes, display results as a markdown checklist:",
    "- `[x]` for success, `[ ]` for failure",
    "- Example format:",
    "  ```",
    "  ## charm upgrade",
    "  - [x] Pulled latest from GitHub",
    "  - [x] Built and installed v0.9.24",
    "  - [x] npm global updated",
    "  - [x] Hooks configured",
    "  - [x] Doctor: all checks PASS",
    "  ```",
    "- Tell the user to restart their session to pick up the new version.",
  ].join("\n");
}
