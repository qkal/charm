/**
 * Platform-aware MCP tool naming.
 * Each platform has its own convention for how MCP tool names appear to the LLM.
 *
 * Evidence-based naming conventions (from official docs):
 * | Platform           | Pattern                                                    |
 * |--------------------|------------------------------------------------------------|
 * | Claude Code        | mcp__plugin_charm_charm__<tool>               |
 * | Gemini CLI         | mcp__charm__<tool>                                  |
 * | Antigravity        | mcp__charm__<tool>                                  |
 * | OpenCode           | charm_<tool>                                        |
 * | VS Code Copilot    | charm_<tool>                                        |
 * | Kiro               | @charm/<tool>                                       |
 * | Zed                | mcp:charm:<tool>                                    |
 * | Cursor / Codex / OpenClaw / Pi | bare <tool>                                    |
 */

const TOOL_PREFIXES = {
  "claude-code":    (tool) => `mcp__plugin_charm_charm__${tool}`,
  "gemini-cli":     (tool) => `mcp__charm__${tool}`,
  "antigravity":    (tool) => `mcp__charm__${tool}`,
  "opencode":       (tool) => `charm_${tool}`,
  "kilo":           (tool) => `charm_${tool}`,
  "vscode-copilot": (tool) => `charm_${tool}`,
  "kiro":           (tool) => `@charm/${tool}`,
  "zed":            (tool) => `mcp:charm:${tool}`,
  "cursor":         (tool) => tool,
  "codex":          (tool) => tool,
  "openclaw":       (tool) => tool,
  "pi":             (tool) => tool,
};

/**
 * Get the platform-specific MCP tool name for a bare tool name.
 * Falls back to claude-code convention if platform is unknown.
 */
export function getToolName(platform, bareTool) {
  const fn = TOOL_PREFIXES[platform] || TOOL_PREFIXES["claude-code"];
  return fn(bareTool);
}

/**
 * Create a namer function bound to a specific platform.
 * Returns (bareTool) => platformSpecificToolName.
 */
export function createToolNamer(platform) {
  return (bareTool) => getToolName(platform, bareTool);
}

/** List of all known platform IDs. */
export const KNOWN_PLATFORMS = Object.keys(TOOL_PREFIXES);
