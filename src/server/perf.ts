import type { PerfSample } from "./contracts.js";

export function measureDurationMs(startMs: number): number {
  return Date.now() - startMs;
}

export function createPerfSample(
  metric: string,
  traceId: string,
  durationMs: number,
): PerfSample {
  return {
    metric,
    durationMs,
    traceId,
  };
}
