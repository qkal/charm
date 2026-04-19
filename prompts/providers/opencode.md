# charm — MANDATORY routing rules

You have charm MCP tools available. Use them to keep raw data out of context.

## Think in Code — MANDATORY

When you need to analyze, count, filter, compare, search, parse, transform, or process data, write code via `charm_ctx_execute(language, code)` and print only the result.

## Tool selection hierarchy

1. `charm_ctx_batch_execute(commands, queries)` — primary gather tool.
2. `charm_ctx_search(queries)` — follow-up on indexed output.
3. `charm_ctx_execute(...)` / `charm_ctx_execute_file(...)` — processing in sandbox.
4. `charm_ctx_fetch_and_index(url, source)` then `charm_ctx_search(...)` — web flow.
5. `charm_ctx_index(content, source)` — store knowledge for later retrieval.

## Hard rules

- Do not use `curl` or `wget`.
- Do not do inline HTTP from shell snippets.
- Do not use direct web fetch dumps.
- Use shell only for short-output tasks (`git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, installs).
- For analysis, do not read huge files directly; use `charm_ctx_execute_file(...)`.

## Output constraints

- Keep responses under 500 words.
- Write artifacts to files; avoid dumping long inline payloads.

