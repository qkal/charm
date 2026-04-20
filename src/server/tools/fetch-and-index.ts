import { z } from "zod";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExecResult, IndexResult } from "../../types.js";
import type { ToolResult } from "../execution/contracts.js";

type SourceMeta = {
  label: string;
  chunkCount: number;
  indexedAt: string;
};

type FetchStore = {
  getSourceMeta(label: string): SourceMeta | null;
  indexJSON(content: string, source: string): IndexResult;
  indexPlainText(content: string, source: string): IndexResult;
  index(input: { content: string; source: string }): IndexResult;
};

type FetchAndIndexParams = z.infer<typeof fetchAndIndexInputSchema>;

type FetchAndIndexDeps = {
  getStore: () => FetchStore;
  trackResponse: (toolName: string, response: ToolResult) => ToolResult;
  trackIndexed: (bytes: number) => void;
  executorExecute: (request: {
    language: "javascript";
    code: string;
    timeout: number;
  }) => Promise<Pick<ExecResult, "stdout" | "stderr" | "exitCode">>;
  resolveTurndownPath: () => string;
  resolveGfmPluginPath: () => string;
  readTempOutput: (path: string) => string;
  removeTempOutput: (path: string) => void;
  onCacheHit?: (estimatedBytes: number) => void;
  now?: () => number;
  random?: () => number;
  createTempOutputPath?: () => string;
};

export const fetchAndIndexInputSchema = z.object({
  url: z.string().describe("The URL to fetch and index"),
  source: z
    .string()
    .optional()
    .describe(
      "Label for the indexed content (e.g., 'React useEffect docs', 'Supabase Auth API')",
    ),
  force: z
    .boolean()
    .optional()
    .describe("Skip cache and re-fetch even if content was recently indexed"),
});

function buildFetchCode(
  url: string,
  outputPath: string,
  turndownPath: string,
  gfmPluginPath: string,
): string {
  const escapedOutputPath = JSON.stringify(outputPath);
  return `
const TurndownService = require(${JSON.stringify(turndownPath)});
const { gfm } = require(${JSON.stringify(gfmPluginPath)});
const fs = require('fs');
const url = ${JSON.stringify(url)};
const outputPath = ${escapedOutputPath};

function emit(ct, content) {
  // Write content to file to bypass executor stdout truncation (100KB limit).
  // Only the content-type marker goes to stdout.
  fs.writeFileSync(outputPath, content);
  console.log('__CM_CT__:' + ct);
}

async function main() {
  const resp = await fetch(url);
  if (!resp.ok) { console.error("HTTP " + resp.status); process.exit(1); }
  const contentType = resp.headers.get('content-type') || '';

  // --- JSON responses ---
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    const text = await resp.text();
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      emit('json', pretty);
    } catch {
      emit('text', text);
    }
    return;
  }

  // --- HTML responses (default for text/html, application/xhtml+xml) ---
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    const html = await resp.text();
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    td.use(gfm);
    td.remove(['script', 'style', 'nav', 'header', 'footer', 'noscript']);
    emit('html', td.turndown(html));
    return;
  }

  // --- Everything else: plain text, CSV, XML, etc. ---
  const text = await resp.text();
  emit('text', text);
}
main();
`;
}

function createDefaultTempPath(now: () => number, random: () => number): string {
  return join(
    tmpdir(),
    `ctx-fetch-${now()}-${random().toString(36).slice(2)}.dat`,
  );
}

export function createFetchAndIndexToolHandler(deps: FetchAndIndexDeps) {
  return async ({ url, source, force }: FetchAndIndexParams): Promise<ToolResult> => {
    const now = deps.now ?? Date.now;
    const random = deps.random ?? Math.random;

    if (!force) {
      const store = deps.getStore();
      const label = source ?? url;
      const meta = store.getSourceMeta(label);
      if (meta) {
        const indexedAt = new Date(meta.indexedAt + "Z");
        const ageMs = now() - indexedAt.getTime();
        const ttlMs = 24 * 60 * 60 * 1000;
        if (ageMs < ttlMs) {
          const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
          const ageMin = Math.floor(ageMs / (60 * 1000));
          const ageStr = ageHours > 0
            ? `${ageHours}h ago`
            : ageMin > 0
              ? `${ageMin}m ago`
              : "just now";
          const estimatedBytes = meta.chunkCount * 1600;
          deps.onCacheHit?.(estimatedBytes);

          return deps.trackResponse("ctx_fetch_and_index", {
            content: [{
              type: "text" as const,
              text: `Cached: **${meta.label}** — ${meta.chunkCount} sections, indexed ${ageStr} (fresh, TTL: 24h).\nTo refresh: call ctx_fetch_and_index again with \`force: true\`.\n\nYou MUST call search() to answer questions about this content — this cached response contains no content.\nUse: search(queries: [...], source: "${meta.label}")`,
            }],
          });
        }
      }
    }

    const outputPath = deps.createTempOutputPath
      ? deps.createTempOutputPath()
      : createDefaultTempPath(now, random);

    try {
      const fetchCode = buildFetchCode(
        url,
        outputPath,
        deps.resolveTurndownPath(),
        deps.resolveGfmPluginPath(),
      );
      const result = await deps.executorExecute({
        language: "javascript",
        code: fetchCode,
        timeout: 30_000,
      });

      if (result.exitCode !== 0) {
        return deps.trackResponse("ctx_fetch_and_index", {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch ${url}: ${result.stderr || result.stdout}`,
            },
          ],
          isError: true,
        });
      }

      const store = deps.getStore();
      const header = (result.stdout || "").trim();

      let markdown: string;
      try {
        markdown = deps.readTempOutput(outputPath).trim();
      } catch {
        return deps.trackResponse("ctx_fetch_and_index", {
          content: [
            {
              type: "text" as const,
              text: `Fetched ${url} but could not read subprocess output`,
            },
          ],
          isError: true,
        });
      }

      if (markdown.length === 0) {
        return deps.trackResponse("ctx_fetch_and_index", {
          content: [
            {
              type: "text" as const,
              text: `Fetched ${url} but got empty content`,
            },
          ],
          isError: true,
        });
      }

      deps.trackIndexed(Buffer.byteLength(markdown));

      let indexed: IndexResult;
      if (header === "__CM_CT__:json") {
        indexed = store.indexJSON(markdown, source ?? url);
      } else if (header === "__CM_CT__:text") {
        indexed = store.indexPlainText(markdown, source ?? url);
      } else {
        indexed = store.index({ content: markdown, source: source ?? url });
      }

      const previewLimit = 3072;
      const preview = markdown.length > previewLimit
        ? markdown.slice(0, previewLimit) + "\n\n…[truncated — use search() for full content]"
        : markdown;
      const totalKB = (Buffer.byteLength(markdown) / 1024).toFixed(1);

      const text = [
        `Fetched and indexed **${indexed.totalChunks} sections** (${totalKB}KB) from: ${indexed.label}`,
        `Full content indexed in sandbox — use search(queries: [...], source: "${indexed.label}") for specific lookups.`,
        "",
        "---",
        "",
        preview,
      ].join("\n");

      return deps.trackResponse("ctx_fetch_and_index", {
        content: [{ type: "text" as const, text }],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return deps.trackResponse("ctx_fetch_and_index", {
        content: [
          { type: "text" as const, text: `Fetch error: ${message}` },
        ],
        isError: true,
      });
    } finally {
      try { deps.removeTempOutput(outputPath); } catch { /* already gone */ }
    }
  };
}
