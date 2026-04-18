import {
  evaluateCommandDenyOnly,
  evaluateFilePath,
  extractShellCommands,
  readBashPolicies,
  readToolDenyPatterns,
} from "../../security.js";
import type { PolicyCheckResult } from "./contracts.js";

export interface PolicyEngineOptions {
  projectDir?: string;
  globalSettingsPath?: string;
  /**
   * Tool name to use for file-path deny checks.
   * Server currently enforces Read deny patterns for execute_file paths.
   */
  readToolName?: string;
  /**
   * Preserve current server behavior: on policy evaluation failure,
   * allow the request and let hooks remain the primary enforcement layer.
   */
  failOpen?: boolean;
}

export class PolicyEngine {
  #projectDir?: string;
  #globalSettingsPath?: string;
  #readToolName: string;
  #failOpen: boolean;

  constructor(options: PolicyEngineOptions = {}) {
    this.#projectDir = options.projectDir;
    this.#globalSettingsPath = options.globalSettingsPath;
    this.#readToolName = options.readToolName ?? "Read";
    this.#failOpen = options.failOpen ?? true;
  }

  setProjectDir(projectDir?: string): void {
    this.#projectDir = projectDir;
  }

  checkShellCommand(command: string): PolicyCheckResult {
    try {
      const policies = readBashPolicies(this.#projectDir, this.#globalSettingsPath);
      const result = evaluateCommandDenyOnly(command, policies);
      if (result.decision === "deny") {
        return {
          decision: "deny",
          matchedPattern: result.matchedPattern,
          subject: command,
        };
      }
      return { decision: "allow" };
    } catch (error) {
      return this.#onError(error);
    }
  }

  checkEmbeddedShellCommands(code: string, language: string): PolicyCheckResult {
    try {
      const commands = extractShellCommands(code, language);
      if (commands.length === 0) return { decision: "allow" };

      const policies = readBashPolicies(this.#projectDir, this.#globalSettingsPath);
      for (const command of commands) {
        const result = evaluateCommandDenyOnly(command, policies);
        if (result.decision === "deny") {
          return {
            decision: "deny",
            matchedPattern: result.matchedPattern,
            subject: command,
          };
        }
      }

      return { decision: "allow" };
    } catch (error) {
      return this.#onError(error);
    }
  }

  checkFilePath(filePath: string): PolicyCheckResult {
    try {
      const denyGlobs = readToolDenyPatterns(
        this.#readToolName,
        this.#projectDir,
        this.#globalSettingsPath,
      );
      const result = evaluateFilePath(filePath, denyGlobs);
      if (result.denied) {
        return {
          decision: "deny",
          matchedPattern: result.matchedPattern,
          subject: filePath,
        };
      }
      return { decision: "allow" };
    } catch (error) {
      return this.#onError(error);
    }
  }

  #onError(error: unknown): PolicyCheckResult {
    if (this.#failOpen) {
      return { decision: "allow", reason: "policy-check-failed-open" };
    }

    const message = error instanceof Error ? error.message : String(error);
    return { decision: "deny", reason: `policy-check-failed-closed:${message}` };
  }
}
