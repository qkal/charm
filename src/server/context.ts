import { randomUUID } from "node:crypto";
import type { RequestContext, SearchThrottleState } from "./contracts.js";

export function createRequestContext(
  toolName: string,
  securityMode: RequestContext["securityMode"],
): RequestContext {
  return {
    traceId: randomUUID(),
    toolName,
    securityMode,
    startedAtMs: Date.now(),
  };
}

export function resetSearchWindowIfExpired(
  state: SearchThrottleState,
  now: number,
  windowMs: number,
): void {
  // Match current server semantics: reset only when strictly past the window.
  // At the exact threshold (elapsed === windowMs), keep the existing window.
  if (now - state.windowStartMs > windowMs) {
    state.callCount = 0;
    state.windowStartMs = now;
  }
}

export function recordSearchCall(state: SearchThrottleState): number {
  state.callCount += 1;
  return state.callCount;
}

export function getEffectiveSearchLimit(
  requestedLimit: number,
  callCount: number,
  maxResultsAfter: number,
): number {
  if (callCount > maxResultsAfter) {
    return 1;
  }
  return Math.min(requestedLimit, 2);
}
