import { z } from "zod";
import type { SearchResult } from "../../types.js";
import type { ToolResult } from "../execution/contracts.js";
import type { SearchThrottleState } from "../contracts.js";
import {
  getEffectiveSearchLimit,
  recordSearchCall,
  resetSearchWindowIfExpired,
} from "../context.js";

function coerceJsonArray(val: unknown): unknown {
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Leave invalid JSON strings untouched and let zod report the type error.
    }
  }
  return val;
}

export const searchInputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Single search query. Prefer queries[] for batching."),
  queries: z.preprocess(
    coerceJsonArray,
    z
      .array(z.string())
      .optional()
      .describe("Array of search queries. Batch ALL questions in one call."),
  ),
  limit: z
    .number()
    .optional()
    .default(3)
    .describe("Results per query (default: 3)"),
  source: z
    .string()
    .optional()
    .describe("Filter to a specific indexed source (partial match)."),
  contentType: z
    .enum(["code", "prose"])
    .optional()
    .describe("Filter results by content type: 'code' or 'prose'."),
});

type SearchStore = {
  getStats(): { chunks: number };
  searchWithFallback(
    query: string,
    limit: number,
    source?: string,
    contentType?: "code" | "prose",
  ): SearchResult[];
  listSources(): Array<{ label: string; chunkCount: number }>;
};

type SearchToolParams = z.infer<typeof searchInputSchema>;

type SearchHandlerDeps = {
  getStore: () => SearchStore;
  trackResponse: (toolName: string, response: ToolResult) => ToolResult;
  extractSnippet: (
    content: string,
    query: string,
    maxLen?: number,
    highlighted?: string,
  ) => string;
  throttleState: SearchThrottleState;
  searchWindowMs: number;
  searchMaxResultsAfter: number;
  searchBlockAfter: number;
  now?: () => number;
};

export function createSearchToolHandler(deps: SearchHandlerDeps) {
  return async (params: SearchToolParams): Promise<ToolResult> => {
    try {
      const store = deps.getStore();

      if (store.getStats().chunks === 0) {
        return deps.trackResponse("ctx_search", {
          content: [{
            type: "text" as const,
            text: "Knowledge base is empty — no content has been indexed yet.\n\n" +
              "ctx_search is a follow-up tool that queries previously indexed content. " +
              "To gather and index content first, use:\n" +
              "  • ctx_batch_execute(commands, queries) — run commands, auto-index output, and search in one call\n" +
              "  • ctx_fetch_and_index(url) — fetch a URL, index it, then search with ctx_search\n" +
              "  • ctx_index(content, source) — manually index text content\n\n" +
              "After indexing, ctx_search becomes available for follow-up queries.",
          }],
          isError: true,
        });
      }

      const queryList: string[] = [];
      if (Array.isArray(params.queries) && params.queries.length > 0) {
        queryList.push(...params.queries);
      } else if (typeof params.query === "string" && params.query.length > 0) {
        queryList.push(params.query);
      }

      if (queryList.length === 0) {
        return deps.trackResponse("ctx_search", {
          content: [{ type: "text" as const, text: "Error: provide query or queries." }],
          isError: true,
        });
      }

      const { limit = 3, source, contentType } = params;

      const now = deps.now ? deps.now() : Date.now();
      resetSearchWindowIfExpired(deps.throttleState, now, deps.searchWindowMs);
      const searchCallCount = recordSearchCall(deps.throttleState);

      if (searchCallCount > deps.searchBlockAfter) {
        return deps.trackResponse("ctx_search", {
          content: [{
            type: "text" as const,
            text: `BLOCKED: ${searchCallCount} search calls in ${Math.round((now - deps.throttleState.windowStartMs) / 1000)}s. ` +
              "You're flooding context. STOP making individual search calls. " +
              "Use batch_execute(commands, queries) for your next research step.",
          }],
          isError: true,
        });
      }

      const effectiveLimit = getEffectiveSearchLimit(
        limit,
        searchCallCount,
        deps.searchMaxResultsAfter,
      );

      const MAX_TOTAL = 40 * 1024;
      let totalSize = 0;
      const sections: string[] = [];

      for (const q of queryList) {
        if (totalSize > MAX_TOTAL) {
          sections.push(`## ${q}\n(output cap reached)\n`);
          continue;
        }

        const results = store.searchWithFallback(q, effectiveLimit, source, contentType);

        if (results.length === 0) {
          sections.push(`## ${q}\nNo results found.`);
          continue;
        }

        const formatted = results
          .map((r) => {
            const header = `--- [${r.source}] ---`;
            const heading = `### ${r.title}`;
            const snippet = deps.extractSnippet(r.content, q, 1500, r.highlighted);
            return `${header}\n${heading}\n\n${snippet}`;
          })
          .join("\n\n");

        sections.push(`## ${q}\n\n${formatted}`);
        totalSize += formatted.length;
      }

      let output = sections.join("\n\n---\n\n");

      if (searchCallCount >= deps.searchMaxResultsAfter) {
        output += `\n\n⚠ search call #${searchCallCount}/${deps.searchBlockAfter} in this window. ` +
          `Results limited to ${effectiveLimit}/query. ` +
          `Batch queries: search(queries: ["q1","q2","q3"]) or use batch_execute.`;
      }

      if (output.trim().length === 0) {
        const sources = store.listSources();
        const sourceList = sources.length > 0
          ? `\nIndexed sources: ${sources.map((s) => `"${s.label}" (${s.chunkCount} sections)`).join(", ")}`
          : "";

        return deps.trackResponse("ctx_search", {
          content: [{ type: "text" as const, text: `No results found.${sourceList}` }],
        });
      }

      return deps.trackResponse("ctx_search", {
        content: [{ type: "text" as const, text: output }],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return deps.trackResponse("ctx_search", {
        content: [{ type: "text" as const, text: `Search error: ${message}` }],
        isError: true,
      });
    }
  };
}
