import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PolicyEngine } from "../../src/server/execution/policy-engine.js";

function writeProjectSettings(
  projectDir: string,
  payload: unknown,
): void {
  const claudeDir = join(projectDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, "settings.json"),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
}

describe("PolicyEngine", () => {
  let rootDir: string;
  let globalSettingsPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "policy-engine-"));
    globalSettingsPath = join(rootDir, "global-settings.json");
    writeFileSync(
      globalSettingsPath,
      JSON.stringify({ permissions: { deny: [] } }),
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test("denies shell command matching Bash deny pattern", () => {
    writeProjectSettings(rootDir, {
      permissions: {
        deny: ["Bash(rm -rf *)"],
      },
    });
    const engine = new PolicyEngine({ projectDir: rootDir, globalSettingsPath });
    const result = engine.checkShellCommand("rm -rf /tmp/somewhere");
    expect(result.decision).toBe("deny");
    expect(result.matchedPattern).toBe("Bash(rm -rf *)");
    expect(result.subject).toBe("rm -rf /tmp/somewhere");
  });

  test("denies embedded shell command extracted from non-shell code", () => {
    writeProjectSettings(rootDir, {
      permissions: {
        deny: ["Bash(curl *)"],
      },
    });
    const engine = new PolicyEngine({ projectDir: rootDir, globalSettingsPath });
    const result = engine.checkEmbeddedShellCommands(
      `const { execSync } = require("node:child_process"); execSync("curl https://example.com");`,
      "javascript",
    );
    expect(result.decision).toBe("deny");
    expect(result.matchedPattern).toBe("Bash(curl *)");
    expect(result.subject).toContain("curl https://example.com");
  });

  test("denies file path matching Read deny pattern", () => {
    writeProjectSettings(rootDir, {
      permissions: {
        deny: ["Read(**/.env)"],
      },
    });
    const engine = new PolicyEngine({ projectDir: rootDir, globalSettingsPath });
    const result = engine.checkFilePath("C:\\repo\\.env");
    expect(result.decision).toBe("deny");
    expect(result.matchedPattern).toBe("**/.env");
    expect(result.subject).toBe("C:\\repo\\.env");
  });

  test("allows command when project settings are malformed", () => {
    const claudeDir = join(rootDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "settings.json"), "{bad json", "utf-8");

    const engine = new PolicyEngine({ projectDir: rootDir, globalSettingsPath });
    const result = engine.checkShellCommand("rm -rf /tmp/somewhere");
    expect(result.decision).toBe("allow");
  });
});
