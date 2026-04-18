import type { ExecResult } from "../../types.js";
import type { Language } from "../../runtime.js";
import type { ToolResult } from "./contracts.js";
import type { ExecutionEffects } from "./execution-effects.js";

export interface ExecutionServiceOptions {
  runExecute: (args: {
    language: Language;
    code: string;
    timeout: number;
    background: boolean;
  }) => Promise<ExecResult>;
  runExecuteFile: (args: {
    path: string;
    language: Language;
    code: string;
    timeout: number;
  }) => Promise<ExecResult>;
  checkDenyPolicy: (command: string, toolName: string) => ToolResult | null;
  checkNonShellDenyPolicy: (
    code: string,
    language: string,
    toolName: string,
  ) => ToolResult | null;
  checkFilePathDenyPolicy: (filePath: string, toolName: string) => ToolResult | null;
  effects: ExecutionEffects;
}

export class ExecutionService {
  #runExecute: ExecutionServiceOptions["runExecute"];
  #runExecuteFile: ExecutionServiceOptions["runExecuteFile"];
  #checkDenyPolicy: ExecutionServiceOptions["checkDenyPolicy"];
  #checkNonShellDenyPolicy: ExecutionServiceOptions["checkNonShellDenyPolicy"];
  #checkFilePathDenyPolicy: ExecutionServiceOptions["checkFilePathDenyPolicy"];
  #effects: ExecutionEffects;

  constructor(options: ExecutionServiceOptions) {
    this.#runExecute = options.runExecute;
    this.#runExecuteFile = options.runExecuteFile;
    this.#checkDenyPolicy = options.checkDenyPolicy;
    this.#checkNonShellDenyPolicy = options.checkNonShellDenyPolicy;
    this.#checkFilePathDenyPolicy = options.checkFilePathDenyPolicy;
    this.#effects = options.effects;
  }

  async execute(args: {
    language: Language;
    code: string;
    timeout: number;
    background: boolean;
    intent?: string;
  }): Promise<ToolResult> {
    const { language, code, timeout, background, intent } = args;

    if (language === "shell") {
      const denied = this.#checkDenyPolicy(code, "ctx_execute");
      if (denied) return denied;
    } else {
      const denied = this.#checkNonShellDenyPolicy(code, language, "ctx_execute");
      if (denied) return denied;
    }

    try {
      const result = await this.#runExecute({ language, code, timeout, background });
      return this.#effects.handleExecuteResult({
        toolName: "ctx_execute",
        language,
        timeout,
        intent,
        result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return this.#effects.runtimeError("ctx_execute", message);
    }
  }

  async executeFile(args: {
    path: string;
    language: Language;
    code: string;
    timeout: number;
    intent?: string;
  }): Promise<ToolResult> {
    const { path, language, code, timeout, intent } = args;

    const pathDenied = this.#checkFilePathDenyPolicy(path, "ctx_execute_file");
    if (pathDenied) return pathDenied;

    if (language === "shell") {
      const denied = this.#checkDenyPolicy(code, "ctx_execute_file");
      if (denied) return denied;
    } else {
      const denied = this.#checkNonShellDenyPolicy(code, language, "ctx_execute_file");
      if (denied) return denied;
    }

    try {
      const result = await this.#runExecuteFile({ path, language, code, timeout });
      return this.#effects.handleExecuteFileResult({
        toolName: "ctx_execute_file",
        path,
        language,
        timeout,
        intent,
        result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return this.#effects.runtimeError("ctx_execute_file", message);
    }
  }
}
