#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);

/** @type {boolean} */
let ci = false;
/** @type {string} */
let artifactsDir = "artifacts";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--ci") {
    ci = true;
    continue;
  }
  if (arg === "--artifacts-dir") {
    const next = args[i + 1];
    if (!next) {
      console.error("Missing value for --artifacts-dir");
      process.exit(2);
    }
    artifactsDir = next;
    i++;
    continue;
  }
  console.error(`Unknown argument: ${arg}`);
  process.exit(2);
}

const mockMode = process.env.CHARM_RELEASE_CHECK_MOCK?.trim();
const steps = [
  { id: "typecheck", label: "Typecheck", command: "npm run typecheck" },
  { id: "release-blocking", label: "Release-Blocking Tests", command: "npm run test:release-blocking" },
  { id: "build", label: "Build", command: "npm run build" },
  { id: "pack-dry-run", label: "Pack Dry-Run", command: "npm pack --dry-run" },
];

/**
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function preview(text, max = 4000) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated]`;
}

/**
 * @param {string} stepId
 * @returns {number | null}
 */
function mockExitCode(stepId) {
  if (!mockMode) return null;
  if (mockMode === "pass") return 0;
  if (mockMode === "fail") return 1;
  if (mockMode.startsWith("fail:")) {
    const target = mockMode.slice("fail:".length);
    return target === stepId ? 1 : 0;
  }
  return 0;
}

/**
 * @param {{id: string; label: string; command: string}} step
 * @returns {{
 *   id: string;
 *   label: string;
 *   command: string;
 *   durationMs: number;
 *   exitCode: number;
 *   status: "pass" | "fail";
 *   stdoutPreview: string;
 *   stderrPreview: string;
 * }}
 */
function runStep(step) {
  const cmdString = step.command;
  const mocked = mockExitCode(step.id);
  if (mocked !== null) {
    return {
      id: step.id,
      label: step.label,
      command: cmdString,
      durationMs: 0,
      exitCode: mocked,
      status: mocked === 0 ? "pass" : "fail",
      stdoutPreview: mocked === 0 ? `[mock:${mockMode}] ${step.label} passed` : "",
      stderrPreview: mocked !== 0 ? `[mock:${mockMode}] ${step.label} failed` : "",
    };
  }

  const startedAt = Date.now();
  const proc = spawnSync(step.command, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf-8",
    stdio: "pipe",
    shell: true,
  });
  const durationMs = Date.now() - startedAt;
  const errorMessage = proc.error ? `${proc.error.name}: ${proc.error.message}` : "";
  const stderr = `${proc.stderr ?? ""}${errorMessage ? `\n${errorMessage}` : ""}`.trim();
  const exitCode = typeof proc.status === "number" ? proc.status : 1;

  return {
    id: step.id,
    label: step.label,
    command: cmdString,
    durationMs,
    exitCode,
    status: exitCode === 0 ? "pass" : "fail",
    stdoutPreview: preview(proc.stdout ?? ""),
    stderrPreview: preview(stderr),
  };
}

/** @type {ReturnType<typeof runStep>[]} */
const results = [];
for (const step of steps) {
  const result = runStep(step);
  results.push(result);
  const icon = result.status === "pass" ? "[x]" : "[ ]";
  console.log(`${icon} ${result.label} (${result.command})`);
}

const overallStatus = results.every((result) => result.status === "pass") ? "pass" : "fail";
const artifactsRoot = resolve(process.cwd(), artifactsDir);
mkdirSync(artifactsRoot, { recursive: true });

const jsonPath = resolve(artifactsRoot, "release-readiness.json");
const markdownPath = resolve(artifactsRoot, "release-readiness.md");

const report = {
  status: overallStatus,
  generatedAt: new Date().toISOString(),
  metadata: {
    ci,
    cwd: process.cwd(),
    nodeVersion: process.version,
    platform: process.platform,
    mode: ci ? "ci" : "local",
    mockMode,
  },
  artifacts: {
    jsonPath,
    markdownPath,
  },
  steps: results,
};

const markdownLines = [
  "# Release Readiness Report",
  "",
  `- Status: **${report.status.toUpperCase()}**`,
  `- Generated: ${report.generatedAt}`,
  `- Mode: ${report.metadata.mode}`,
  `- CI: ${report.metadata.ci ? "yes" : "no"}`,
  `- Platform: ${report.metadata.platform}`,
  `- Node: ${report.metadata.nodeVersion}`,
  "",
  "## Steps",
  "",
  "| Step | Status | Exit | Duration (ms) | Command |",
  "| --- | --- | ---: | ---: | --- |",
  ...results.map((result) =>
    `| ${result.label} | ${result.status.toUpperCase()} | ${result.exitCode} | ${result.durationMs} | \`${result.command}\` |`
  ),
  "",
];

for (const result of results) {
  if (result.stderrPreview) {
    markdownLines.push(`### ${result.label} stderr`);
    markdownLines.push("");
    markdownLines.push("```text");
    markdownLines.push(result.stderrPreview);
    markdownLines.push("```");
    markdownLines.push("");
  }
}

writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
writeFileSync(markdownPath, `${markdownLines.join("\n")}\n`, "utf-8");

console.log(`\nRelease readiness: ${overallStatus.toUpperCase()}`);
console.log(`JSON report: ${jsonPath}`);
console.log(`Markdown report: ${markdownPath}`);

if (overallStatus !== "pass") {
  process.exit(1);
}
