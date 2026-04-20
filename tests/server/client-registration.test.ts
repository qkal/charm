import { describe, expect, test, vi } from "vitest";
import { resolveClientAdapter } from "../../src/server/client-registration.js";

describe("resolveClientAdapter", () => {
  test("returns adapter and logs mapping when client info is available", async () => {
    const adapter = { name: "CursorAdapter" } as any;
    const detectPlatform = vi.fn(() => ({ platform: "cursor" }));
    const getAdapter = vi.fn(async () => adapter);
    const log = vi.fn();

    const result = await resolveClientAdapter({
      getClientVersion: () => ({ name: "cursor-mcp-client", version: "1.2.3" }),
      loadResolvers: async () => ({ detectPlatform, getAdapter }),
      log,
    });

    expect(result).toBe(adapter);
    expect(detectPlatform).toHaveBeenCalledWith({
      name: "cursor-mcp-client",
      version: "1.2.3",
    });
    expect(getAdapter).toHaveBeenCalledWith("cursor");
    expect(log).toHaveBeenCalledWith(
      "MCP client: cursor-mcp-client v1.2.3 → cursor",
    );
  });

  test("skips logging when client info is unavailable", async () => {
    const adapter = { name: "FallbackAdapter" } as any;
    const detectPlatform = vi.fn(() => ({ platform: "claude-code" }));
    const getAdapter = vi.fn(async () => adapter);
    const log = vi.fn();

    const result = await resolveClientAdapter({
      getClientVersion: () => null,
      loadResolvers: async () => ({ detectPlatform, getAdapter }),
      log,
    });

    expect(result).toBe(adapter);
    expect(detectPlatform).toHaveBeenCalledWith(undefined);
    expect(log).not.toHaveBeenCalled();
  });

  test("returns null when resolver loading fails", async () => {
    const result = await resolveClientAdapter({
      getClientVersion: () => ({ name: "codex-mcp-client", version: "0.9.0" }),
      loadResolvers: async () => {
        throw new Error("module import failed");
      },
      log: vi.fn(),
    });

    expect(result).toBeNull();
  });

  test("returns null when adapter resolution throws", async () => {
    const detectPlatform = vi.fn(() => ({ platform: "broken-platform" }));
    const getAdapter = vi.fn(async () => {
      throw new Error("adapter not found");
    });

    const result = await resolveClientAdapter({
      getClientVersion: () => ({ name: "unknown-client", version: "0.0.1" }),
      loadResolvers: async () => ({ detectPlatform, getAdapter }),
      log: vi.fn(),
    });

    expect(result).toBeNull();
  });
});
