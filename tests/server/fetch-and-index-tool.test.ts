import { describe, expect, test, vi } from "vitest";
import type { ToolResult } from "../../src/server/execution/contracts.js";
import { createFetchAndIndexToolHandler } from "../../src/server/tools/fetch-and-index.js";

type FetchDeps = Parameters<typeof createFetchAndIndexToolHandler>[0];

function makeDeps(overrides: Partial<FetchDeps> = {}): FetchDeps {
  const store = {
    getSourceMeta: vi.fn(() => null),
    indexJSON: vi.fn(() => ({
      sourceId: 1,
      label: "json-source",
      totalChunks: 4,
      codeChunks: 0,
    })),
    indexPlainText: vi.fn(() => ({
      sourceId: 1,
      label: "text-source",
      totalChunks: 3,
      codeChunks: 0,
    })),
    index: vi.fn(() => ({
      sourceId: 1,
      label: "html-source",
      totalChunks: 2,
      codeChunks: 0,
    })),
  };

  return {
    getStore: vi.fn(() => store),
    trackResponse: vi.fn((_toolName: string, response: ToolResult) => response),
    trackIndexed: vi.fn(),
    executorExecute: vi.fn(async () => ({
      stdout: "__CM_CT__:text",
      stderr: "",
      exitCode: 0,
    })),
    resolveTurndownPath: vi.fn(() => "/deps/turndown.js"),
    resolveGfmPluginPath: vi.fn(() => "/deps/turndown-plugin-gfm.js"),
    readTempOutput: vi.fn(() => "sample content"),
    removeTempOutput: vi.fn(),
    onCacheHit: vi.fn(),
    now: vi.fn(() => 1_000_000),
    random: vi.fn(() => 0.123),
    createTempOutputPath: vi.fn(() => "/tmp/fetch-output.dat"),
    ...overrides,
  };
}

describe("createFetchAndIndexToolHandler", () => {
  test("returns cached guidance when source is fresh and force is false", async () => {
    const nowMs = 10 * 60 * 60 * 1000;
    const indexedAt = new Date(nowMs - 5 * 60 * 1000).toISOString().replace("Z", "");
    const getSourceMeta = vi.fn(() => ({
      label: "cached-doc",
      chunkCount: 3,
      indexedAt,
    }));
    const onCacheHit = vi.fn();
    const executorExecute = vi.fn();
    const deps = makeDeps({
      now: () => nowMs,
      onCacheHit,
      executorExecute,
      getStore: vi.fn(() => ({
        getSourceMeta,
        indexJSON: vi.fn(),
        indexPlainText: vi.fn(),
        index: vi.fn(),
      })),
    });

    const handler = createFetchAndIndexToolHandler(deps);
    const result = await handler({ url: "https://example.com/docs" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Cached: **cached-doc**");
    expect(result.content[0].text).toContain("indexed 5m ago");
    expect(onCacheHit).toHaveBeenCalledWith(4800);
    expect(executorExecute).not.toHaveBeenCalled();
  });

  test("bypasses cache when forced and indexes JSON responses", async () => {
    const indexJSON = vi.fn(() => ({
      sourceId: 7,
      label: "api-docs",
      totalChunks: 6,
      codeChunks: 0,
    }));
    const executorExecute = vi.fn(async () => ({
      stdout: "__CM_CT__:json",
      stderr: "",
      exitCode: 0,
    }));
    const readTempOutput = vi.fn(() => "{\"ok\":true}");
    const removeTempOutput = vi.fn();
    const trackIndexed = vi.fn();
    const deps = makeDeps({
      executorExecute,
      readTempOutput,
      removeTempOutput,
      trackIndexed,
      getStore: vi.fn(() => ({
        getSourceMeta: vi.fn(() => ({
          label: "api-docs",
          chunkCount: 2,
          indexedAt: new Date().toISOString().replace("Z", ""),
        })),
        indexJSON,
        indexPlainText: vi.fn(),
        index: vi.fn(),
      })),
    });

    const handler = createFetchAndIndexToolHandler(deps);
    const result = await handler({
      url: "https://example.com/api",
      source: "api-docs",
      force: true,
    });

    expect(executorExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "javascript",
        timeout: 30000,
      }),
    );
    expect(executorExecute.mock.calls[0][0].code).toContain('/deps/turndown.js');
    expect(indexJSON).toHaveBeenCalledWith("{\"ok\":true}", "api-docs");
    expect(trackIndexed).toHaveBeenCalledWith(Buffer.byteLength("{\"ok\":true}"));
    expect(removeTempOutput).toHaveBeenCalledWith("/tmp/fetch-output.dat");
    expect(result.content[0].text).toContain("Fetched and indexed **6 sections**");
  });

  test("returns fetch failure when subprocess exits non-zero", async () => {
    const removeTempOutput = vi.fn();
    const deps = makeDeps({
      executorExecute: vi.fn(async () => ({
        stdout: "",
        stderr: "HTTP 500",
        exitCode: 1,
      })),
      removeTempOutput,
    });

    const handler = createFetchAndIndexToolHandler(deps);
    const result = await handler({ url: "https://example.com/fail" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to fetch https://example.com/fail: HTTP 500");
    expect(removeTempOutput).toHaveBeenCalled();
  });

  test("returns read error when temp output cannot be read", async () => {
    const deps = makeDeps({
      readTempOutput: vi.fn(() => {
        throw new Error("missing temp file");
      }),
    });

    const handler = createFetchAndIndexToolHandler(deps);
    const result = await handler({ url: "https://example.com/read-error" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("could not read subprocess output");
  });

  test("returns error on empty fetched content", async () => {
    const deps = makeDeps({
      readTempOutput: vi.fn(() => "   "),
    });

    const handler = createFetchAndIndexToolHandler(deps);
    const result = await handler({ url: "https://example.com/empty" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Fetched https://example.com/empty but got empty content");
  });
});
