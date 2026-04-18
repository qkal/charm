import type { ExecResult } from "../../types.js";
import type { ToolResult } from "./contracts.js";

export interface ClassifiedExit {
  isError: boolean;
  output: string;
}

export interface ExecutionEffectsOptions {
  classifyNonZeroExit: (args: {
    language: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }) => ClassifiedExit;
  trackResponse: (toolName: string, response: ToolResult) => ToolResult;
  trackIndexed: (bytes: number) => void;
  intentSearch: (stdout: string, intent: string, source: string) => string;
  indexStdout: (stdout: string, source: string) => ToolResult;
  intentSearchThreshold?: number;
  largeOutputThreshold?: number;
}

export class ExecutionEffects {
  #classifyNonZeroExit: ExecutionEffectsOptions["classifyNonZeroExit"];
  #trackResponse: ExecutionEffectsOptions["trackResponse"];
  #trackIndexed: ExecutionEffectsOptions["trackIndexed"];
  #intentSearch: ExecutionEffectsOptions["intentSearch"];
  #indexStdout: ExecutionEffectsOptions["indexStdout"];
  #intentSearchThreshold: number;
  #largeOutputThreshold: number;

  constructor(options: ExecutionEffectsOptions) {
    this.#classifyNonZeroExit = options.classifyNonZeroExit;
    this.#trackResponse = options.trackResponse;
    this.#trackIndexed = options.trackIndexed;
    this.#intentSearch = options.intentSearch;
    this.#indexStdout = options.indexStdout;
    this.#intentSearchThreshold = options.intentSearchThreshold ?? 5_000;
    this.#largeOutputThreshold = options.largeOutputThreshold ?? 102_400;
  }

  runtimeError(toolName: string, message: string): ToolResult {
    return this.#trackResponse(toolName, {
      content: [{ type: "text", text: `Runtime error: ${message}` }],
      isError: true,
    });
  }

  handleExecuteResult(args: {
    toolName: string;
    language: string;
    timeout: number;
    intent?: string;
    result: ExecResult;
  }): ToolResult {
    const { toolName, language, timeout, intent, result } = args;

    if (result.timedOut) {
      const partialOutput = result.stdout?.trim();
      if (result.backgrounded && partialOutput) {
        return this.#trackResponse(toolName, {
          content: [
            {
              type: "text",
              text: `${partialOutput}\n\n_(process backgrounded after ${timeout}ms — still running)_`,
            },
          ],
        });
      }

      if (partialOutput) {
        return this.#trackResponse(toolName, {
          content: [
            {
              type: "text",
              text: `${partialOutput}\n\n_(timed out after ${timeout}ms — partial output shown above)_`,
            },
          ],
        });
      }

      return this.#trackResponse(toolName, {
        content: [
          {
            type: "text",
            text: `Execution timed out after ${timeout}ms\n\nstderr:\n${result.stderr}`,
          },
        ],
        isError: true,
      });
    }

    if (result.exitCode !== 0) {
      return this.#handleNonZeroExit({
        toolName,
        language,
        intent,
        result,
        sourceBase: `execute:${language}`,
      });
    }

    return this.#handleSuccessOutput({
      toolName,
      intent,
      stdout: result.stdout || "(no output)",
      source: `execute:${language}`,
    });
  }

  handleExecuteFileResult(args: {
    toolName: string;
    path: string;
    language: string;
    timeout: number;
    intent?: string;
    result: ExecResult;
  }): ToolResult {
    const { toolName, path, language, timeout, intent, result } = args;

    if (result.timedOut) {
      return this.#trackResponse(toolName, {
        content: [
          {
            type: "text",
            text: `Timed out processing ${path} after ${timeout}ms`,
          },
        ],
        isError: true,
      });
    }

    if (result.exitCode !== 0) {
      return this.#handleNonZeroExit({
        toolName,
        language,
        intent,
        result,
        sourceBase: `file:${path}`,
      });
    }

    return this.#handleSuccessOutput({
      toolName,
      intent,
      stdout: result.stdout || "(no output)",
      source: `file:${path}`,
    });
  }

  #handleNonZeroExit(args: {
    toolName: string;
    language: string;
    intent?: string;
    result: ExecResult;
    sourceBase: string;
  }): ToolResult {
    const { toolName, language, intent, result, sourceBase } = args;
    const { isError, output } = this.#classifyNonZeroExit({
      language,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    if (intent && intent.trim().length > 0 && Buffer.byteLength(output) > this.#intentSearchThreshold) {
      this.#trackIndexed(Buffer.byteLength(output));
      return this.#trackResponse(toolName, {
        content: [
          {
            type: "text",
            text: this.#intentSearch(
              output,
              intent,
              isError ? `${sourceBase}:error` : sourceBase,
            ),
          },
        ],
        isError,
      });
    }

    if (Buffer.byteLength(output) > this.#largeOutputThreshold) {
      this.#trackIndexed(Buffer.byteLength(output));
      return this.#trackResponse(toolName, {
        content: [
          {
            type: "text",
            text: this.#intentSearch(
              output,
              "errors failures exceptions",
              isError ? `${sourceBase}:error` : sourceBase,
            ),
          },
        ],
        isError,
      });
    }

    return this.#trackResponse(toolName, {
      content: [{ type: "text", text: output }],
      isError,
    });
  }

  #handleSuccessOutput(args: {
    toolName: string;
    intent?: string;
    stdout: string;
    source: string;
  }): ToolResult {
    const { toolName, intent, stdout, source } = args;

    if (intent && intent.trim().length > 0 && Buffer.byteLength(stdout) > this.#intentSearchThreshold) {
      this.#trackIndexed(Buffer.byteLength(stdout));
      return this.#trackResponse(toolName, {
        content: [{ type: "text", text: this.#intentSearch(stdout, intent, source) }],
      });
    }

    if (Buffer.byteLength(stdout) > this.#largeOutputThreshold) {
      return this.#trackResponse(toolName, this.#indexStdout(stdout, source));
    }

    return this.#trackResponse(toolName, {
      content: [{ type: "text", text: stdout }],
    });
  }
}
