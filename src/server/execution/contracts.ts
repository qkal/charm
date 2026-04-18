export type PolicyDecision = "allow" | "deny" | "ask";

export interface ToolTextContent {
  type: "text";
  text: string;
  [x: string]: unknown;
}

export interface ToolResult {
  [x: string]: unknown;
  content: ToolTextContent[];
  isError?: boolean;
}

export interface PolicyCheckResult {
  decision: PolicyDecision;
  matchedPattern?: string;
  /**
   * The command or path that triggered a denial.
   * Useful for non-shell scanners that detect embedded commands.
   */
  subject?: string;
  /**
   * Optional machine-readable reason for diagnostics.
   */
  reason?: string;
}

export interface ExecutionRequest {
  language: string;
  code: string;
  timeout: number;
  path?: string;
  background?: boolean;
  intent?: string;
}

export interface ExecutionOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  backgrounded?: boolean;
}
