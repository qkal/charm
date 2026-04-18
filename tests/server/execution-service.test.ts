import { describe, expect, test, vi } from "vitest";
import { ExecutionService } from "../../src/server/execution/execution-service.js";
import type { ToolResult } from "../../src/server/execution/contracts.js";

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], isError };
}

describe("ExecutionService", () => {
  test("execute returns deny result without invoking runtime", async () => {
    const runExecute = vi.fn();
    const effects = {
      handleExecuteResult: vi.fn(),
      handleExecuteFileResult: vi.fn(),
      runtimeError: vi.fn(),
    };
    const denied = textResult("blocked", true);
    const service = new ExecutionService({
      runExecute: runExecute as any,
      runExecuteFile: vi.fn() as any,
      checkDenyPolicy: () => denied,
      checkNonShellDenyPolicy: () => null,
      checkFilePathDenyPolicy: () => null,
      effects: effects as any,
    });

    const result = await service.execute({
      language: "shell",
      code: "rm -rf /",
      timeout: 1000,
      background: false,
    });

    expect(result).toEqual(denied);
    expect(runExecute).not.toHaveBeenCalled();
    expect(effects.handleExecuteResult).not.toHaveBeenCalled();
  });

  test("execute delegates successful run to effects", async () => {
    const execResult = {
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    };
    const runExecute = vi.fn().mockResolvedValue(execResult);
    const expected = textResult("done");
    const effects = {
      handleExecuteResult: vi.fn().mockReturnValue(expected),
      handleExecuteFileResult: vi.fn(),
      runtimeError: vi.fn(),
    };
    const service = new ExecutionService({
      runExecute: runExecute as any,
      runExecuteFile: vi.fn() as any,
      checkDenyPolicy: () => null,
      checkNonShellDenyPolicy: () => null,
      checkFilePathDenyPolicy: () => null,
      effects: effects as any,
    });

    const result = await service.execute({
      language: "javascript",
      code: "console.log('ok')",
      timeout: 2000,
      background: false,
      intent: "health",
    });

    expect(runExecute).toHaveBeenCalledWith({
      language: "javascript",
      code: "console.log('ok')",
      timeout: 2000,
      background: false,
    });
    expect(effects.handleExecuteResult).toHaveBeenCalledWith({
      toolName: "ctx_execute",
      language: "javascript",
      timeout: 2000,
      intent: "health",
      result: execResult,
    });
    expect(result).toEqual(expected);
  });

  test("executeFile returns path deny result before runtime call", async () => {
    const runExecuteFile = vi.fn();
    const effects = {
      handleExecuteResult: vi.fn(),
      handleExecuteFileResult: vi.fn(),
      runtimeError: vi.fn(),
    };
    const denied = textResult("path blocked", true);
    const service = new ExecutionService({
      runExecute: vi.fn() as any,
      runExecuteFile: runExecuteFile as any,
      checkDenyPolicy: () => null,
      checkNonShellDenyPolicy: () => null,
      checkFilePathDenyPolicy: () => denied,
      effects: effects as any,
    });

    const result = await service.executeFile({
      path: ".env",
      language: "shell",
      code: "cat .env",
      timeout: 500,
    });

    expect(result).toEqual(denied);
    expect(runExecuteFile).not.toHaveBeenCalled();
    expect(effects.handleExecuteFileResult).not.toHaveBeenCalled();
  });
});
