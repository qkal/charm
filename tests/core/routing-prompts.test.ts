import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  readRoutingPrompt,
  resolveStandalonePromptPath,
  upsertRoutingInstructionsFile,
} from "../../src/routing-prompts.js";

describe("routing-prompts", () => {
  it("prefers standalone provider prompt over legacy config file", () => {
    const root = mkdtempSync(join(tmpdir(), "routing-prompts-"));
    try {
      const standalone = resolveStandalonePromptPath(root, "codex");
      mkdirSync(join(root, "prompts", "providers"), { recursive: true });
      writeFileSync(standalone, "standalone-codex", "utf-8");
      const legacy = join(root, "configs", "codex", "AGENTS.md");
      mkdirSync(join(root, "configs", "codex"), { recursive: true });
      writeFileSync(legacy, "legacy-codex", "utf-8");

      const loaded = readRoutingPrompt("codex", root);
      expect(loaded).toBe("standalone-codex");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to legacy config prompt when standalone prompt is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "routing-prompts-"));
    try {
      const legacy = join(root, "configs", "kiro", "KIRO.md");
      mkdirSync(join(root, "configs", "kiro"), { recursive: true });
      writeFileSync(legacy, "legacy-kiro", "utf-8");

      const loaded = readRoutingPrompt("kiro", root);
      expect(loaded).toBe("legacy-kiro");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("upsertRoutingInstructionsFile creates, appends once, then stays unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "routing-prompts-"));
    try {
      const target = join(root, "GEMINI.md");
      const content = [
        "# charm — MANDATORY routing rules",
        "",
        "Use charm MCP tools.",
      ].join("\n");

      const created = upsertRoutingInstructionsFile(target, content);
      expect(created).toBe("created");
      expect(readFileSync(target, "utf-8")).toContain("MANDATORY routing rules");

      writeFileSync(target, "Custom project rules\n", "utf-8");
      const updated = upsertRoutingInstructionsFile(target, content);
      expect(updated).toBe("updated");
      const merged = readFileSync(target, "utf-8");
      expect(merged).toContain("Custom project rules");
      expect(merged).toContain("MANDATORY routing rules");

      const unchanged = upsertRoutingInstructionsFile(target, content);
      expect(unchanged).toBe("unchanged");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
