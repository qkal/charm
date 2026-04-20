import { z } from "zod";
import type { ExecResult } from "../../types.js";
import type { ToolResult } from "../execution/contracts.js";

function coerceJsonArray(val: unknown): unknown {
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Keep invalid JSON strings untouched and let zod surface the error.
    }
  }
  return val;
}

function coerceCommandsArray(val: unknown): unknown {
  const arr = coerceJsonArray(val);
  if (Array.isArray(arr)) {
    return arr.map((item, i) =>
      typeof item === "string" ? { label: `cmd_${i + 1}`, command: item } : item,
    );
  }
  return arr;
}

export const batchExecuteInputSchema = z.object({
  commands: z.preprocess(
    coerceCommandsArray,
    z
      .array(
        z.object({
          label: z
            .string()
            .describe(
              "Section header for this command's output (e.g., 'README', 'Package.json', 'Source Tree')",
            ),
          command: z
            .string()
            .describe("Shell command to execute"),
        }),
      )
      .min(1)
      .describe(
        "Commands to execute as a batch. Each runs sequentially, output is labeled with the section header.",
      ),
  ),
  queries: z.preprocess(
    coerceJsonArray,
    z
      .array(z.string())
      .min(1)
      .describe(
        "Search queries to extract information from indexed output. Use 5-8 comprehensive queries. " +
          "Each returns top 5 matching sections with full content. " +
          "This is your ONLY chance — put ALL your questions here. No follow-up calls needed.",
      ),
  ),
  timeout: z
    .coerce.number()
    .optional()
    .default(60000)
    .describe("Max execution time in ms (default: 60s)"),
});

type BatchExecuteParams = z.infer<typeof batchExecuteInputSchema>;

type BatchStore = {
  index(input: { content: string; source: string }): { sourceId: number; totalChunks: number };
  getChunksBySource(sourceId: number): Array<{ title: string; content: string }>;
  getDistinctiveTerms?: (sourceId: number) => string[];
};

type BatchExecuteDeps = {
  checkDenyPolicy: (command: string, toolName: string) => ToolResult | null;
  executorExecute: (request: {
    language: "shell";
    code: string;
    timeout: number;
  }) => Promise<Pick<ExecResult, "stdout" | "timedOut">>;
  trackResponse: (toolName: string, response: ToolResult) => ToolResult;
  trackIndexed: (bytes: number) => void;
  getStore: () => BatchStore;
  formatBatchQueryResults: (
    store: any,
    queries: string[],
    source: string,
  ) => string[];
  cmFsPreloadPath: string;
  onSandboxedFsBytes?: (bytes: number) => void;
  now?: () => number;
};

export function createBatchExecuteToolHandler(deps: BatchExecuteDeps) {
  return async ({ commands, queries, timeout = 60000 }: BatchExecuteParams): Promise<ToolResult> => {
    for (const cmd of commands) {
      const denied = deps.checkDenyPolicy(cmd.command, "ctx_batch_execute");
      if (denied) return denied;
    }

    try {
      const perCommandOutputs: string[] = [];
      const now = deps.now ?? Date.now;
      const startTime = now();
      let timedOut = false;

      const nodeOptsPrefix = `NODE_OPTIONS="--require ${deps.cmFsPreloadPath}" `;

      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        const elapsed = now() - startTime;
        const remaining = timeout - elapsed;
        if (remaining <= 0) {
          perCommandOutputs.push(
            `# ${cmd.label}\n\n(skipped — batch timeout exceeded)\n`,
          );
          timedOut = true;
          continue;
        }

        const result = await deps.executorExecute({
          language: "shell",
          code: `${nodeOptsPrefix}${cmd.command} 2>&1`,
          timeout: remaining,
        });

        let output = result.stdout || "(no output)";

        const fsMatches = output.matchAll(/__CM_FS__:(\d+)/g);
        let cmdFsBytes = 0;
        for (const m of fsMatches) cmdFsBytes += parseInt(m[1], 10);
        if (cmdFsBytes > 0) {
          deps.onSandboxedFsBytes?.(cmdFsBytes);
          output = output.replace(/__CM_FS__:\d+\n?/g, "");
        }

        perCommandOutputs.push(`# ${cmd.label}\n\n${output}\n`);

        if (result.timedOut) {
          timedOut = true;
          for (let next = i + 1; next < commands.length; next++) {
            perCommandOutputs.push(
              `# ${commands[next].label}\n\n(skipped — batch timeout exceeded)\n`,
            );
          }
          break;
        }
      }

      const stdout = perCommandOutputs.join("\n");
      const totalBytes = Buffer.byteLength(stdout);
      const totalLines = stdout.split("\n").length;

      if (timedOut && perCommandOutputs.length === 0) {
        return deps.trackResponse("ctx_batch_execute", {
          content: [
            {
              type: "text" as const,
              text: `Batch timed out after ${timeout}ms. No output captured.`,
            },
          ],
          isError: true,
        });
      }

      deps.trackIndexed(totalBytes);

      const store = deps.getStore();
      const source = `batch:${commands
        .map((c) => c.label)
        .join(",")
        .slice(0, 80)}`;
      const indexed = store.index({ content: stdout, source });

      const allSections = store.getChunksBySource(indexed.sourceId);
      const inventory: string[] = ["## Indexed Sections", ""];
      for (const s of allSections) {
        const bytes = Buffer.byteLength(s.content);
        inventory.push(`- ${s.title} (${(bytes / 1024).toFixed(1)}KB)`);
      }

      const queryResults = deps.formatBatchQueryResults(store, queries, source);

      const distinctiveTerms = store.getDistinctiveTerms
        ? store.getDistinctiveTerms(indexed.sourceId)
        : [];

      const output = [
        `Executed ${commands.length} commands (${totalLines} lines, ${(totalBytes / 1024).toFixed(1)}KB). ` +
          `Indexed ${indexed.totalChunks} sections. Searched ${queries.length} queries.`,
        "",
        ...inventory,
        "",
        ...queryResults,
        distinctiveTerms.length > 0
          ? `\nSearchable terms for follow-up: ${distinctiveTerms.join(", ")}`
          : "",
      ].join("\n");

      return deps.trackResponse("ctx_batch_execute", {
        content: [{ type: "text" as const, text: output }],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return deps.trackResponse("ctx_batch_execute", {
        content: [
          {
            type: "text" as const,
            text: `Batch execution error: ${message}`,
          },
        ],
        isError: true,
      });
    }
  };
}
