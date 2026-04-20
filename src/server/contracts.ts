export interface RequestContext {
  traceId: string;
  toolName: string;
  securityMode: "compat" | "strict";
  startedAtMs: number;
}

export interface SearchThrottleState {
  windowStartMs: number;
  callCount: number;
}

export interface PerfSample {
  metric: string;
  durationMs: number;
  traceId: string;
}
