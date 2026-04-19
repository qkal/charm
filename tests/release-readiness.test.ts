import { afterEach, describe, expect, test } from "vitest";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "..");
const SCRIPT_PATH = resolve(ROOT, "scripts", "release-readiness.mjs");

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("release readiness automation", () => {
  test("package.json exposes release-check scripts and ships runner", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts["release:check"]).toBe("node scripts/release-readiness.mjs");
    expect(pkg.scripts["release:check:ci"]).toBe("node scripts/release-readiness.mjs --ci");
    expect(pkg.files).toContain("scripts/release-readiness.mjs");
  });

  test("cli.ts routes charm release-check to release-readiness script", () => {
    const cliSource = readFileSync(resolve(ROOT, "src", "cli.ts"), "utf-8");
    expect(cliSource).toContain('args[0] === "release-check"');
    expect(cliSource).toContain('"scripts", "release-readiness.mjs"');
  });

  test("script writes JSON and markdown artifacts on success", () => {
    const outDir = makeTempDir("release-check-pass-");
    const proc = spawnSync(
      "node",
      [SCRIPT_PATH, "--artifacts-dir", outDir],
      {
        cwd: ROOT,
        env: { ...process.env, CHARM_RELEASE_CHECK_MOCK: "pass" },
        encoding: "utf-8",
      },
    );

    expect(proc.status).toBe(0);

    const jsonPath = resolve(outDir, "release-readiness.json");
    const markdownPath = resolve(outDir, "release-readiness.md");
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(markdownPath)).toBe(true);

    const report = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(report.status).toBe("pass");
    expect(report.steps.length).toBe(4);
    expect(report.steps.every((step: { status: string }) => step.status === "pass")).toBe(true);
  });

  test("script exits non-zero when any gate fails", () => {
    const outDir = makeTempDir("release-check-fail-");
    const proc = spawnSync(
      "node",
      [SCRIPT_PATH, "--artifacts-dir", outDir],
      {
        cwd: ROOT,
        env: { ...process.env, CHARM_RELEASE_CHECK_MOCK: "fail:typecheck" },
        encoding: "utf-8",
      },
    );

    expect(proc.status).not.toBe(0);

    const jsonPath = resolve(outDir, "release-readiness.json");
    const report = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(report.status).toBe("fail");
    const failing = report.steps.find((step: { id: string; status: string }) => step.id === "typecheck");
    expect(failing?.status).toBe("fail");
  });
});

