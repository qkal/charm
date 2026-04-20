import { beforeAll, describe, expect, test } from "vitest";

let createRoutingBlock: (t: (tool: string) => string, options?: { includeCommands?: boolean }) => string;
let createCurlWgetBlockedCommand: (t: (tool: string) => string) => string;
let createInlineHttpBlockedCommand: (t: (tool: string) => string) => string;
let createBuildToolRedirectCommand: (t: (tool: string) => string, command: string) => string;
let createWebFetchBlockedReason: (t: (tool: string) => string, url: string) => string;

const t = (tool: string) => `mcp__plugin_charm_charm__${tool}`;

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

beforeAll(async () => {
  const routingBlock = await import("../../hooks/routing-block.mjs");
  const guidanceText = await import("../../hooks/core/guidance-text.mjs");

  createRoutingBlock = routingBlock.createRoutingBlock;
  createCurlWgetBlockedCommand = guidanceText.createCurlWgetBlockedCommand;
  createInlineHttpBlockedCommand = guidanceText.createInlineHttpBlockedCommand;
  createBuildToolRedirectCommand = guidanceText.createBuildToolRedirectCommand;
  createWebFetchBlockedReason = guidanceText.createWebFetchBlockedReason;
});

describe("guidance text generation snapshots", () => {
  test("routing block with ctx commands", () => {
    const output = normalize(createRoutingBlock(t));
    expect(output).toMatchSnapshot();
  });

  test("routing block without ctx commands", () => {
    const output = normalize(createRoutingBlock(t, { includeCommands: false }));
    expect(output).toMatchSnapshot();
  });

  test("routing action messages", () => {
    const messages = {
      curlWgetBlocked: normalize(createCurlWgetBlockedCommand(t)),
      inlineHttpBlocked: normalize(createInlineHttpBlockedCommand(t)),
      buildRedirect: normalize(
        createBuildToolRedirectCommand(
          t,
          "gradle test --stacktrace && echo \"done\"",
        ),
      ),
      webFetchBlocked: normalize(
        createWebFetchBlockedReason(t, "https://example.com/docs"),
      ),
    };
    expect(messages).toMatchSnapshot();
  });
});
