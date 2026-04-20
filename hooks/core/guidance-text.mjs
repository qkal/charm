/**
 * Pure message/template builders for hook routing responses.
 * Keeping these centralized avoids string drift across routing branches.
 */

function escapeForDoubleQuotedEcho(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function createCurlWgetBlockedCommand(t) {
  return `echo "charm: curl/wget blocked. Think in Code — use ${t("ctx_execute")}(language, code) to write code that fetches, processes, and prints only the answer. Or use ${t("ctx_fetch_and_index")}(url, source) to fetch and index. Write pure JS with try/catch, no npm deps. Do NOT retry with curl/wget."`;
}

export function createInlineHttpBlockedCommand(t) {
  return `echo "charm: Inline HTTP blocked. Think in Code — use ${t("ctx_execute")}(language, code) to write code that fetches, processes, and console.log() only the result. Write robust pure JS with try/catch, no npm deps. Do NOT retry with Bash."`;
}

export function createBuildToolRedirectCommand(t, command) {
  const safeCmd = escapeForDoubleQuotedEcho(command);
  return `echo "charm: Build tool redirected. Think in Code — use ${t("ctx_execute")}(language: \\"shell\\", code: \\"${safeCmd} 2>&1 | tail -30\\") to run and print only errors/summary. Do NOT retry with Bash."`;
}

export function createWebFetchBlockedReason(t, url) {
  return `charm: WebFetch blocked. Think in Code — use ${t("ctx_fetch_and_index")}(url: "${url}", source: "...") to fetch and index, then ${t("ctx_search")}(queries: [...]) to query. Or use ${t("ctx_execute")}(language, code) to fetch, process, and console.log() only what you need. Write pure JS, no npm deps. Do NOT use curl, wget, or WebFetch.`;
}
