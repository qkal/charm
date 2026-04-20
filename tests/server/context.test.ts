import { describe, expect, test } from "vitest";
import {
  createRequestContext,
  getEffectiveSearchLimit,
  recordSearchCall,
  resetSearchWindowIfExpired,
} from "../../src/server/context.js";
import { createPerfSample, measureDurationMs } from "../../src/server/perf.js";

describe("createRequestContext", () => {
  test("returns traceId/toolName/securityMode/startedAtMs", () => {
    const before = Date.now();
    const context = createRequestContext("ctx_search", "strict");
    const after = Date.now();

    expect(typeof context.traceId).toBe("string");
    expect(context.traceId.length).toBeGreaterThan(0);
    expect(context.toolName).toBe("ctx_search");
    expect(context.securityMode).toBe("strict");
    expect(context.startedAtMs).toBeGreaterThanOrEqual(before);
    expect(context.startedAtMs).toBeLessThanOrEqual(after);
  });
});

describe("search throttle", () => {
  test("resets window state when expired", () => {
    const state = {
      windowStartMs: 1_000,
      callCount: 5,
    };

    resetSearchWindowIfExpired(state, 1_600, 500);

    expect(state.windowStartMs).toBe(1_600);
    expect(state.callCount).toBe(0);
  });

  test("does not reset when window is not expired", () => {
    const state = {
      windowStartMs: 1_000,
      callCount: 5,
    };

    resetSearchWindowIfExpired(state, 1_499, 500);

    expect(state.windowStartMs).toBe(1_000);
    expect(state.callCount).toBe(5);
  });

  test("does not reset at exact threshold", () => {
    const state = {
      windowStartMs: 1_000,
      callCount: 5,
    };

    resetSearchWindowIfExpired(state, 1_500, 500);

    expect(state.windowStartMs).toBe(1_000);
    expect(state.callCount).toBe(5);
  });

  test("drops effective limit after threshold", () => {
    const state = {
      windowStartMs: 10_000,
      callCount: 0,
    };

    recordSearchCall(state);
    recordSearchCall(state);
    recordSearchCall(state);

    expect(getEffectiveSearchLimit(5, state.callCount, 3)).toBe(2);

    recordSearchCall(state);

    expect(getEffectiveSearchLimit(5, state.callCount, 3)).toBe(1);
  });

  test("keeps requested limit when already 1", () => {
    expect(getEffectiveSearchLimit(1, 0, 3)).toBe(1);
  });
});

describe("perf helpers", () => {
  test("measureDurationMs returns non-negative value", () => {
    const startMs = Date.now() - 10;
    const durationMs = measureDurationMs(startMs);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  test("createPerfSample returns expected shape", () => {
    const sample = createPerfSample("search", "trace-123", 42);
    expect(sample).toEqual({
      metric: "search",
      traceId: "trace-123",
      durationMs: 42,
    });
  });
});
