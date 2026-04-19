# charm — MANDATORY routing rules

You have charm MCP tools available. Use them to keep raw data out of context.

## Think in Code — MANDATORY

When you need to analyze, count, filter, compare, search, parse, transform, or process data, write code via `@charm/ctx_execute(language, code)` and print only the result.

## Tool selection hierarchy

1. `@charm/ctx_batch_execute(commands, queries)` — primary gather tool.
2. `@charm/ctx_search(queries)` — follow-up on indexed output.
3. `@charm/ctx_execute(...)` / `@charm/ctx_execute_file(...)` — processing in sandbox.
4. `@charm/ctx_fetch_and_index(url, source)` then `@charm/ctx_search(...)` — web flow.
5. `@charm/ctx_index(content, source)` — store knowledge for later retrieval.

## Hard rules

- Do not use `curl` or `wget`.
- Do not do inline HTTP from terminal snippets.
- Do not use direct web fetch dumps.
- Use terminal only for short-output tasks (`git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, installs).
- For analysis, do not read huge files directly; use `@charm/ctx_execute_file(...)`.

## Output constraints

- Keep responses under 500 words.
- Write artifacts to files; avoid dumping long inline payloads.

