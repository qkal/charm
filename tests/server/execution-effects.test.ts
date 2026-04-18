import { describe, expect, test, vi } from "vitest";
import { ExecutionEffects } from "../../src/server/execution/execution-effects.js";

describe("ExecutionEffects", () => {
  test("execute timeout with partial output returns success note", () => {
    const trackResponse = vi.fn((_: string, response: any) => response);
    const effects = new ExecutionEffects({
      classifyNonZeroExit: vi.fn() as any,
      trackResponse,
      trackIndexed: vi.fn(),
      intentSearch: vi.fn() as any,
      indexStdout: vi.fn() as any,
    });

    const result = effects.handleExecuteResult({
      toolName: "ctx_execute",
      language: "shell",
      timeout: 1000,
      result: {
        stdout: "partial\n",
        stderr: "",
        exitCode: 1,
        timedOut: true,
      },
    });

    expect(trackResponse).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("partial");
    expect(result.content[0].text).toContain("timed out after 1000ms");
  });

  test("executeFile timeout returns error response", () => {
    const trackResponse = vi.fn((_: string, response: any) => response);
    const effects = new ExecutionEffects({
      classifyNonZeroExit: vi.fn() as any,
      trackResponse,
      trackIndexed: vi.fn(),
      intentSearch: vi.fn() as any,
      indexStdout: vi.fn() as any,
    });

    const result = effects.handleExecuteFileResult({
      toolName: "ctx_execute_file",
      path: "logs/app.log",
      language: "javascript",
      timeout: 2000,
      result: {
        stdout: "",
        stderr: "",
        exitCode: 1,
        timedOut: true,
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Timed out processing logs/app.log after 2000ms");
  });
});
