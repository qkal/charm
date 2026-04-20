import { describe, expect, test, vi } from "vitest";
import type { SearchResult } from "../../src/types.js";
import { createSearchToolHandler } from "../../src/server/tools/search.js";

function buildResult(content: string, isError = false) {
  return {
    content: [{ type: "text" as const, text: content }],
    isError,
  };
}

describe("createSearchToolHandler", () => {
  test("returns guidance when knowledge base is empty", async () => {
    const trackResponse = vi.fn((_: string, response: ReturnType<typeof buildResult>) => response);

    const handler = createSearchToolHandler({
      getStore: () => ({
        getStats: () => ({ chunks: 0 }),
      } as any),
      trackResponse,
      extractSnippet: () => "snippet",
      throttleState: { callCount: 0, windowStartMs: 0 },
      now: () => 10_000,
      searchWindowMs: 60_000,
      searchMaxResultsAfter: 3,
      searchBlockAfter: 8,
    });

    const result = await handler({ queries: ["react cache invalidation"] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Knowledge base is empty");
    expect(result.content[0].text).toContain("ctx_batch_execute");
    expect(trackResponse).toHaveBeenCalledWith("ctx_search", result);
  });

  test("normalizes fallback from query string into query-list search flow", async () => {
    const searchWithFallback = vi.fn(
      (_query: string, _limit: number, _source?: string, _contentType?: "code" | "prose"): SearchResult[] => [
        {
          title: "React docs",
          source: "react.dev",
          content: "Use cache invalidation keys and query staleness settings.",
          rank: 1,
          contentType: "prose",
        },
      ],
    );
    const trackResponse = vi.fn((_: string, response: ReturnType<typeof buildResult>) => response);

    const handler = createSearchToolHandler({
      getStore: () => ({
        getStats: () => ({ chunks: 1 }),
        searchWithFallback,
        listSources: () => [],
      } as any),
      trackResponse,
      extractSnippet: () => "formatted snippet",
      throttleState: { callCount: 0, windowStartMs: 0 },
      now: () => 10_000,
      searchWindowMs: 60_000,
      searchMaxResultsAfter: 3,
      searchBlockAfter: 8,
    });

    const result = await handler({ query: "cache invalidation strategy" });
    expect(searchWithFallback).toHaveBeenCalledWith(
      "cache invalidation strategy",
      2,
      undefined,
      undefined,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("## cache invalidation strategy");
    expect(result.content[0].text).toContain("formatted snippet");
  });

  test("blocks when search-call threshold is exceeded", async () => {
    const searchWithFallback = vi.fn((): SearchResult[] => []);
    const trackResponse = vi.fn((_: string, response: ReturnType<typeof buildResult>) => response);

    const handler = createSearchToolHandler({
      getStore: () => ({
        getStats: () => ({ chunks: 1 }),
        searchWithFallback,
        listSources: () => [],
      } as any),
      trackResponse,
      extractSnippet: () => "snippet",
      throttleState: { callCount: 8, windowStartMs: 0 },
      now: () => 10_000,
      searchWindowMs: 60_000,
      searchMaxResultsAfter: 3,
      searchBlockAfter: 8,
    });

    const result = await handler({ queries: ["rate limit me"] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("BLOCKED: 9 search calls in 10s.");
    expect(result.content[0].text).toContain("Use batch_execute(commands, queries)");
    expect(searchWithFallback).not.toHaveBeenCalled();
  });

  test("adds warning text when warning threshold is reached", async () => {
    const searchWithFallback = vi.fn(
      (_query: string, _limit: number): SearchResult[] => [
        {
          title: "Caching",
          source: "docs",
          content: "Cache entries expire quickly.",
          rank: 1,
          contentType: "prose",
        },
      ],
    );
    const trackResponse = vi.fn((_: string, response: ReturnType<typeof buildResult>) => response);

    const handler = createSearchToolHandler({
      getStore: () => ({
        getStats: () => ({ chunks: 1 }),
        searchWithFallback,
        listSources: () => [],
      } as any),
      trackResponse,
      extractSnippet: () => "warning snippet",
      throttleState: { callCount: 2, windowStartMs: 0 },
      now: () => 10_000,
      searchWindowMs: 60_000,
      searchMaxResultsAfter: 3,
      searchBlockAfter: 8,
    });

    const result = await handler({ queries: ["cache policy"], limit: 3 });
    expect(searchWithFallback).toHaveBeenCalledWith("cache policy", 2, undefined, undefined);
    expect(result.content[0].text).toContain("⚠ search call #3/8 in this window.");
    expect(result.content[0].text).toContain("Results limited to 2/query.");
  });

  test("marks subsequent queries as output capped after total-size threshold", async () => {
    const searchWithFallback = vi.fn(
      (_query: string, _limit: number): SearchResult[] => [
        {
          title: "Huge section",
          source: "large-doc",
          content: "Body",
          rank: 1,
          contentType: "prose",
        },
      ],
    );
    const trackResponse = vi.fn((_: string, response: ReturnType<typeof buildResult>) => response);

    const handler = createSearchToolHandler({
      getStore: () => ({
        getStats: () => ({ chunks: 1 }),
        searchWithFallback,
        listSources: () => [],
      } as any),
      trackResponse,
      extractSnippet: () => "x".repeat(41 * 1024),
      throttleState: { callCount: 0, windowStartMs: 0 },
      now: () => 10_000,
      searchWindowMs: 60_000,
      searchMaxResultsAfter: 3,
      searchBlockAfter: 8,
    });

    const result = await handler({
      queries: ["first query", "second query"],
      limit: 2,
    });

    expect(searchWithFallback).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain("## second query\n(output cap reached)");
  });

  test("falls back to source listing when output becomes empty", async () => {
    const searchWithFallback = vi.fn((): SearchResult[] => []);
    const trackResponse = vi.fn((_: string, response: ReturnType<typeof buildResult>) => response);
    const joinSpy = vi.spyOn(Array.prototype, "join").mockImplementationOnce(() => "");

    const handler = createSearchToolHandler({
      getStore: () => ({
        getStats: () => ({ chunks: 1 }),
        searchWithFallback,
        listSources: () => [
          { label: "react.dev", chunkCount: 12 },
          { label: "nextjs.org", chunkCount: 4 },
        ],
      } as any),
      trackResponse,
      extractSnippet: () => "snippet",
      throttleState: { callCount: 0, windowStartMs: 0 },
      now: () => 10_000,
      searchWindowMs: 60_000,
      searchMaxResultsAfter: 3,
      searchBlockAfter: 8,
    });

    const result = await handler({ queries: ["no hits expected"] });

    joinSpy.mockRestore();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No results found.");
    expect(result.content[0].text).toContain("Indexed sources:");
    expect(result.content[0].text).toContain("\"react.dev\" (12 sections)");
    expect(result.content[0].text).toContain("\"nextjs.org\" (4 sections)");
  });
});
