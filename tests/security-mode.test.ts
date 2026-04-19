import { describe, expect, test } from "vitest";
import { resolveSecurityMode } from "../src/security-mode.js";

describe("resolveSecurityMode", () => {
  test("defaults to compat when env is missing", () => {
    const result = resolveSecurityMode(undefined);
    expect(result.mode).toBe("compat");
    expect(result.failOpen).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  test("strict mode disables fail-open behavior", () => {
    const result = resolveSecurityMode("strict");
    expect(result.mode).toBe("strict");
    expect(result.failOpen).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  test("invalid mode falls back to compat with warning", () => {
    const result = resolveSecurityMode("hardened");
    expect(result.mode).toBe("compat");
    expect(result.failOpen).toBe(true);
    expect(result.warning).toContain("Invalid CHARM_SECURITY_MODE");
    expect(result.warning).toContain("compat, strict");
  });
});

