import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";

export type Language =
  | "javascript"
  | "typescript"
  | "python"
  | "shell"
  | "ruby"
  | "go"
  | "rust"
  | "php"
  | "perl"
  | "r"
  | "elixir";

export interface RuntimeInfo {
  command: string;
  available: boolean;
  version: string;
  preferred: boolean;
}

export interface RuntimeMap {
  javascript: string;
  typescript: string | null;
  python: string | null;
  shell: string;
  ruby: string | null;
  go: string | null;
  rust: string | null;
  php: string | null;
  perl: string | null;
  r: string | null;
  elixir: string | null;
}

const isWindows = process.platform === "win32";

function listCommandCandidates(cmd: string): string[] {
  const candidates = new Set<string>([cmd]);

  if (isWindows) {
    try {
      const result = execFileSync("where.exe", [cmd], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
      for (const line of result.split(/\r?\n/).map((p) => p.trim()).filter(Boolean)) {
        candidates.add(line);
      }
    } catch {
      // Best effort — raw command name stays as fallback.
    }
  } else {
    try {
      const result = execFileSync("which", [cmd], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
      if (result) candidates.add(result);
    } catch {
      // Best effort — raw command name stays as fallback.
    }
  }

  return [...candidates];
}

function canExecute(command: string, args: string[] = ["--version"]): boolean {
  try {
    execFileSync(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function resolveUsableCommand(
  commands: string[],
  probeArgs: string[] = ["--version"],
): string | null {
  for (const command of commands) {
    for (const candidate of listCommandCandidates(command)) {
      if (canExecute(candidate, probeArgs)) return candidate;
    }
  }
  return null;
}

function bunExists(): boolean {
  if (resolveUsableCommand(["bun"])) return true;
  // Bun installs to ~/.bun/bin which may not be in PATH in MCP server environments
  if (!isWindows) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    if (home && existsSync(`${home}/.bun/bin/bun`)) return true;
  }
  return false;
}

function bunCommand(): string {
  const resolved = resolveUsableCommand(["bun"]);
  if (resolved) return resolved;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return `${home}/.bun/bin/bun`;
}

/**
 * On Windows, resolve the first non-WSL bash in PATH.
 * WSL bash (C:\Windows\System32\bash.exe) cannot handle Windows paths,
 * so we skip it and prefer Git Bash or MSYS2 bash instead.
 */
function resolveWindowsBash(): string | null {
  // First, try well-known Git Bash locations directly (works even when
  // Git\usr\bin is not on PATH, which is common in MCP server environments
  // that only inherit Git\cmd from the system PATH).
  const knownPaths = [
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
  ];
  for (const p of knownPaths) {
    if (existsSync(p) && canExecute(p, ["--version"])) return p;
  }

  // Fallback: scan PATH via `where bash`, skipping WSL and WindowsApps entries.
  try {
    const result = execFileSync("where.exe", ["bash"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    const candidates = result.trim().split(/\r?\n/).map(p => p.trim()).filter(Boolean);
    for (const p of candidates) {
      const lower = p.toLowerCase();
      if (lower.includes("system32") || lower.includes("windowsapps")) continue;
      if (canExecute(p, ["--version"])) return p;
    }
    return null;
  } catch {
    return null;
  }
}

function getVersion(cmd: string): string {
  const lower = basename(cmd).toLowerCase();
  const args = lower === "py" || lower === "py.exe"
    ? ["-3", "--version"]
    : ["--version"];
  try {
    return execFileSync(cmd, args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    })
      .trim()
      .split(/\r?\n/)[0];
  } catch {
    return "unknown";
  }
}

export function detectRuntimes(): RuntimeMap {
  const hasBun = bunExists();
  const bun = hasBun ? bunCommand() : null;
  const typescript = bun
    ?? resolveUsableCommand(["tsx"], ["--version"])
    ?? resolveUsableCommand(["ts-node"], ["--version"]);
  const python = isWindows
    ? resolveUsableCommand(["py"], ["-3", "--version"])
      ?? resolveUsableCommand(["python"], ["--version"])
      ?? resolveUsableCommand(["python3"], ["--version"])
    : resolveUsableCommand(["python3"], ["--version"])
      ?? resolveUsableCommand(["python"], ["--version"]);

  return {
    javascript: bun ?? process.execPath,
    typescript,
    python,
    shell: isWindows
      ? (resolveWindowsBash() ?? resolveUsableCommand(["sh"], ["--version"]) ?? "cmd.exe")
      : resolveUsableCommand(["bash"], ["--version"]) ?? "sh",
    ruby: resolveUsableCommand(["ruby"], ["--version"]),
    go: resolveUsableCommand(["go"], ["version"]),
    rust: resolveUsableCommand(["rustc"], ["--version"]),
    php: resolveUsableCommand(["php"], ["--version"]),
    perl: resolveUsableCommand(["perl"], ["--version"]),
    r: resolveUsableCommand(["Rscript"], ["--version"])
      ?? resolveUsableCommand(["r"], ["--version"]),
    elixir: resolveUsableCommand(["elixir"], ["--version"]),
  };
}

function isPyLauncher(command: string): boolean {
  const lower = basename(command).toLowerCase();
  return lower === "py" || lower === "py.exe";
}

export function getPythonCommand(runtimes: RuntimeMap, filePath: string): string[] {
  if (!runtimes.python) {
    throw new Error(
      "No Python runtime available. Install python3 or python.",
    );
  }
  return isPyLauncher(runtimes.python)
    ? [runtimes.python, "-3", filePath]
    : [runtimes.python, filePath];
}

export function hasBunRuntime(): boolean {
  return bunExists();
}

export function getRuntimeSummary(runtimes: RuntimeMap): string {
  const lines: string[] = [];
  const bunPreferred = runtimes.javascript?.endsWith("bun") ?? false;

  lines.push(
    `  JavaScript: ${runtimes.javascript} (${getVersion(runtimes.javascript)})${bunPreferred ? " ⚡" : ""}`,
  );

  if (runtimes.typescript) {
    lines.push(
      `  TypeScript: ${runtimes.typescript} (${getVersion(runtimes.typescript)})`,
    );
  } else {
    lines.push(
      `  TypeScript: not available (install bun, tsx, or ts-node)`,
    );
  }

  if (runtimes.python) {
    lines.push(
      `  Python:     ${runtimes.python} (${getVersion(runtimes.python)})`,
    );
  } else {
    lines.push(`  Python:     not available`);
  }

  lines.push(
    `  Shell:      ${runtimes.shell} (${getVersion(runtimes.shell)})`,
  );

  // Optional runtimes — only show if available
  if (runtimes.ruby)
    lines.push(
      `  Ruby:       ${runtimes.ruby} (${getVersion(runtimes.ruby)})`,
    );
  if (runtimes.go)
    lines.push(`  Go:         ${runtimes.go} (${getVersion(runtimes.go)})`);
  if (runtimes.rust)
    lines.push(
      `  Rust:       ${runtimes.rust} (${getVersion(runtimes.rust)})`,
    );
  if (runtimes.php)
    lines.push(
      `  PHP:        ${runtimes.php} (${getVersion(runtimes.php)})`,
    );
  if (runtimes.perl)
    lines.push(
      `  Perl:       ${runtimes.perl} (${getVersion(runtimes.perl)})`,
    );
  if (runtimes.r)
    lines.push(`  R:          ${runtimes.r} (${getVersion(runtimes.r)})`);
  if (runtimes.elixir)
    lines.push(
      `  Elixir:     ${runtimes.elixir} (${getVersion(runtimes.elixir)})`,
    );

  if (!bunPreferred) {
    lines.push("");
    lines.push(
      "  Tip: Install Bun for 3-5x faster JS/TS execution → https://bun.sh",
    );
  }

  return lines.join("\n");
}

export function getAvailableLanguages(runtimes: RuntimeMap): Language[] {
  const langs: Language[] = ["javascript", "shell"];
  if (runtimes.typescript) langs.push("typescript");
  if (runtimes.python) langs.push("python");
  if (runtimes.ruby) langs.push("ruby");
  if (runtimes.go) langs.push("go");
  if (runtimes.rust) langs.push("rust");
  if (runtimes.php) langs.push("php");
  if (runtimes.perl) langs.push("perl");
  if (runtimes.r) langs.push("r");
  if (runtimes.elixir) langs.push("elixir");
  return langs;
}

export function buildCommand(
  runtimes: RuntimeMap,
  language: Language,
  filePath: string,
): string[] {
  switch (language) {
    case "javascript":
      return runtimes.javascript.endsWith("bun")
        ? [runtimes.javascript, "run", filePath]
        : [runtimes.javascript, filePath];

    case "typescript":
      if (!runtimes.typescript) {
        throw new Error(
          "No TypeScript runtime available. Install one of: bun (recommended), tsx (npm i -g tsx), or ts-node.",
        );
      }
      if (runtimes.typescript?.endsWith("bun")) return [runtimes.typescript, "run", filePath];
      if (runtimes.typescript === "tsx") return ["tsx", filePath];
      return ["ts-node", filePath];

    case "python":
      return getPythonCommand(runtimes, filePath);

    case "shell":
      return [runtimes.shell, filePath];

    case "ruby":
      if (!runtimes.ruby) {
        throw new Error("Ruby not available. Install ruby.");
      }
      return [runtimes.ruby, filePath];

    case "go":
      if (!runtimes.go) {
        throw new Error("Go not available. Install go.");
      }
      return ["go", "run", filePath];

    case "rust": {
      if (!runtimes.rust) {
        throw new Error(
          "Rust not available. Install rustc via https://rustup.rs",
        );
      }
      // Rust needs compile + run — handled specially in executor
      return ["__rust_compile_run__", filePath];
    }

    case "php":
      if (!runtimes.php) {
        throw new Error("PHP not available. Install php.");
      }
      return ["php", filePath];

    case "perl":
      if (!runtimes.perl) {
        throw new Error("Perl not available. Install perl.");
      }
      return ["perl", filePath];

    case "r":
      if (!runtimes.r) {
        throw new Error("R not available. Install R / Rscript.");
      }
      return [runtimes.r, filePath];

    case "elixir":
      if (!runtimes.elixir) {
        throw new Error( "Elixir not available. Install elixir.");
      }
      return ["elixir", filePath];
  }
}
