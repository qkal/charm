import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type RoutingPromptProvider =
  | "antigravity"
  | "claude-code"
  | "codex"
  | "cursor"
  | "gemini-cli"
  | "kiro"
  | "kilo"
  | "openclaw"
  | "opencode"
  | "pi"
  | "vscode-copilot"
  | "zed";

const LEGACY_PROMPT_PATHS: Record<RoutingPromptProvider, string> = {
  "antigravity": "configs/antigravity/GEMINI.md",
  "claude-code": "configs/claude-code/CLAUDE.md",
  "codex": "configs/codex/AGENTS.md",
  "cursor": "configs/cursor/charm.mdc",
  "gemini-cli": "configs/gemini-cli/GEMINI.md",
  "kiro": "configs/kiro/KIRO.md",
  "kilo": "configs/kilo/AGENTS.md",
  "openclaw": "configs/openclaw/AGENTS.md",
  "opencode": "configs/opencode/AGENTS.md",
  "pi": "configs/pi/AGENTS.md",
  "vscode-copilot": "configs/vscode-copilot/copilot-instructions.md",
  "zed": "configs/zed/AGENTS.md",
};

const CHARM_PROMPT_SIGNATURE = "charm — MANDATORY routing rules";

export function resolveStandalonePromptPath(
  pluginRoot: string,
  provider: RoutingPromptProvider,
): string {
  return resolve(pluginRoot, "prompts", "providers", `${provider}.md`);
}

export function readRoutingPrompt(
  provider: RoutingPromptProvider,
  pluginRoot: string,
): string | null {
  const standalonePath = resolveStandalonePromptPath(pluginRoot, provider);
  const legacyPath = resolve(pluginRoot, LEGACY_PROMPT_PATHS[provider]);

  for (const candidate of [standalonePath, legacyPath]) {
    try {
      const content = readFileSync(candidate, "utf-8");
      if (content.trim()) return content;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export function upsertRoutingInstructionsFile(
  targetPath: string,
  routingContent: string,
): "created" | "updated" | "unchanged" {
  const normalized = routingContent.trimEnd() + "\n";

  try {
    const existing = readFileSync(targetPath, "utf-8");
    if (existing.includes(CHARM_PROMPT_SIGNATURE)) {
      return "unchanged";
    }
    const merged = existing.trimEnd() + "\n\n---\n\n" + normalized;
    writeFileSync(targetPath, merged, "utf-8");
    return "updated";
  } catch {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, normalized, "utf-8");
    return "created";
  }
}
