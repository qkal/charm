import { describe, expect, test, vi } from "vitest";
import type { ToolResult } from "../../src/server/execution/contracts.js";
import {
  batchExecuteInputSchema,
  createBatchExecuteToolHandler,
} from "../../src/server/tools/batch-execute.js";

type BatchDeps = Parameters<typeof createBatchExecuteToolHandler>[0];

function textResult(text: string, isError = false): ToolResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

function makeDeps(overrides: Partial<BatchDeps> = {}): BatchDeps {
  const store = {
    index: vi.fn(() => ({ sourceId: 1, totalChunks: 2 })),
    getChunksBySource: vi.fn(() => [{ title: "cmd_1", content: "output" }]),
    getDistinctiveTerms: vi.fn(() => ["alpha", "beta"]),
  };

  return {
    checkDenyPolicy: vi.fn(() => null),
    executorExecute: vi.fn(async () => ({ stdout: "ok", timedOut: false })),
    trackResponse: vi.fn((_toolName: string, response: ToolResult) => response),
    trackIndexed: vi.fn(),
    getStore: vi.fn(() => store),
    formatBatchQueryResults: vi.fn(() => ["## query", "### cmd_1", "snippet"]),
    cmFsPreloadPath: "/tmp/cm-fs-preload.js",
    onSandboxedFsBytes: vi.fn(),
    now: vi.fn(() => 1_000),
    ...overrides,
  };
}

describe("batchExecuteInputSchema", () => {
  test("coerces JSON-string arrays and plain command strings", () => {
    const parsed = batchExecuteInputSchema.parse({
      commands: "[\"echo hi\",\"pwd\"]",
      queries: "[\"where is output\"]",
    });

    expect(parsed.commands).toEqual([
      { label: "cmd_1", command: "echo hi" },
      { label: "cmd_2", command: "pwd" },
    ]);
    expect(parsed.queries).toEqual(["where is output"]);
    expect(parsed.timeout).toBe(60000);
  });
});

describe("createBatchExecuteToolHandler", () => {
  test("returns deny result before execution when policy blocks a command", async () => {
    const denied = textResult("blocked", true);
    const checkDenyPolicy = vi.fn(() => denied);
    const executorExecute = vi.fn();
    const deps = makeDeps({ checkDenyPolicy, executorExecute });

    const handler = createBatchExecuteToolHandler(deps);
    const result = await handler({
      commands: [{ label: "blocked", command: "rm -rf /" }],
      queries: ["anything"],
      timeout: 1000,
    });

    expect(result).toEqual(denied);
    expect(checkDenyPolicy).toHaveBeenCalledWith("rm -rf /", "ctx_batch_execute");
    expect(executorExecute).not.toHaveBeenCalled();
  });

  test("strips FS markers, tracks sandboxed bytes, and includes indexed summary", async () => {
    const executorExecute = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "__CM_FS__:12\nfirst line\n__CM_FS__:8\nsecond line",
        timedOut: false,
      })
      .mockResolvedValueOnce({
        stdout: "final line",
        timedOut: false,
      });
    const index = vi.fn(() => ({ sourceId: 42, totalChunks: 5 }));
    const getChunksBySource = vi.fn(() => [{ title: "cmd_1", content: "captured output" }]);
    const onSandboxedFsBytes = vi.fn();
    const trackIndexed = vi.fn();

    const deps = makeDeps({
      executorExecute,
      trackIndexed,
      onSandboxedFsBytes,
      getStore: vi.fn(() => ({
        index,
        getChunksBySource,
        getDistinctiveTerms: () => ["tokenA", "tokenB"],
      })),
    });

    const handler = createBatchExecuteToolHandler(deps);
    const result = await handler({
      commands: [
        { label: "cmd_1", command: "echo first" },
        { label: "cmd_2", command: "echo second" },
      ],
      queries: ["query one"],
      timeout: 30_000,
    });

    expect(executorExecute).toHaveBeenNthCalledWith(1, {
      language: "shell",
      code: 'NODE_OPTIONS="--require /tmp/cm-fs-preload.js" echo first 2>&1',
      timeout: 30_000,
    });
    expect(onSandboxedFsBytes).toHaveBeenCalledWith(20);
    expect(index).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.not.stringContaining("__CM_FS__"),
      }),
    );
    expect(trackIndexed).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Executed 2 commands");
    expect(result.content[0].text).toContain("Searchable terms for follow-up: tokenA, tokenB");
  });

  test("marks remaining commands as skipped after a timed-out command", async () => {
    const index = vi.fn(() => ({ sourceId: 9, totalChunks: 1 }));
    const executorExecute = vi.fn().mockResolvedValue({
      stdout: "partial output",
      timedOut: true,
    });
    const deps = makeDeps({
      executorExecute,
      getStore: vi.fn(() => ({
        index,
        getChunksBySource: () => [{ title: "cmd_1", content: "partial output" }],
      })),
    });

    const handler = createBatchExecuteToolHandler(deps);
    await handler({
      commands: [
        { label: "cmd_1", command: "long-running" },
        { label: "cmd_2", command: "should skip" },
        { label: "cmd_3", command: "should skip too" },
      ],
      queries: ["timeout query"],
      timeout: 10_000,
    });

    expect(executorExecute).toHaveBeenCalledTimes(1);
    expect(index).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("(skipped — batch timeout exceeded)"),
      }),
    );
  });

  test("returns a tracked error when execution throws", async () => {
    const trackResponse = vi.fn((_toolName: string, response: ToolResult) => response);
    const deps = makeDeps({
      trackResponse,
      executorExecute: vi.fn(async () => {
        throw new Error("executor blew up");
      }),
    });

    const handler = createBatchExecuteToolHandler(deps);
    const result = await handler({
      commands: [{ label: "cmd_1", command: "echo hi" }],
      queries: ["x"],
      timeout: 1000,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Batch execution error: executor blew up");
    expect(trackResponse).toHaveBeenCalledWith("ctx_batch_execute", result);
  });
});
