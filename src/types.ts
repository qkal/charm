/**
 * types — Shared type definitions for charm packages.
 *
 * Contains interfaces that are genuinely shared between the core (ContentStore,
 * PolyglotExecutor) and the session domain (SessionDB, event extraction).
 * Import from "./types.js".
 */

// ─────────────────────────────────────────────────────────
// Session event types
// ─────────────────────────────────────────────────────────

/** Tool call representation used during event extraction from Claude messages. */
export interface ToolCall {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResponse?: string;
  isError?: boolean;
}

/** User message representation used during event extraction. */
export interface UserMessage {
  content: string;
  timestamp?: string;
}

/**
 * Session event as stored in SessionDB.
 * Each event captures a discrete unit of session activity (tool use, user
 * message, assistant response summary, etc.) for later resume-snapshot
 * reconstruction.
 */
export interface SessionEvent {
  type: string;
  category: string;
  data: string;
  priority: number;
  data_hash: string;
}

// ─────────────────────────────────────────────────────────
// Execution result
// ─────────────────────────────────────────────────────────

/**
 * Result returned by PolyglotExecutor after running a code snippet.
 * Shared here so SessionDB can record execution outcomes without importing
 * the full executor module.
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  /** Process was detached and continues running in the background. */
  backgrounded?: boolean;
}

// ─────────────────────────────────────────────────────────
// Security mode
// ─────────────────────────────────────────────────────────

/**
 * Runtime policy behavior for server-side permission checks.
 * - compat: preserve fail-open behavior on policy-evaluation errors.
 * - strict: fail closed on policy-evaluation errors.
 */
export type SecurityMode = "compat" | "strict";

export interface SecurityModeResolution {
  mode: SecurityMode;
  /** Raw env value after trim/lowercase, when provided. */
  normalizedInput?: string;
  /** Optional warning when env input is invalid and fallback was applied. */
  warning?: string;
  /** Directly consumed by PolicyEngine. */
  failOpen: boolean;
}

// ─────────────────────────────────────────────────────────
// Release readiness
// ─────────────────────────────────────────────────────────

export interface ReleaseReadinessStepResult {
  id: string;
  label: string;
  command: string;
  durationMs: number;
  exitCode: number;
  status: "pass" | "fail";
  stdoutPreview: string;
  stderrPreview: string;
}

export interface ReleaseReadinessReport {
  status: "pass" | "fail";
  generatedAt: string;
  metadata: {
    ci: boolean;
    cwd: string;
    nodeVersion: string;
    platform: string;
    mode: "local" | "ci";
    mockMode?: string;
  };
  artifacts: {
    jsonPath: string;
    markdownPath: string;
  };
  steps: ReleaseReadinessStepResult[];
}

// ─────────────────────────────────────────────────────────
// Content store shared types
// ─────────────────────────────────────────────────────────

/**
 * Result returned after indexing content into the knowledge base.
 * Shared so session tooling can record what was indexed without importing
 * ContentStore.
 */
export interface IndexResult {
  sourceId: number;
  label: string;
  totalChunks: number;
  codeChunks: number;
}

/**
 * A single search result returned from FTS5 BM25-ranked lookup.
 * Shared for consumers that display or log results outside of ContentStore.
 */
export interface SearchResult {
  title: string;
  content: string;
  source: string;
  rank: number;
  contentType: "code" | "prose";
  matchLayer?: "porter" | "trigram" | "fuzzy" | "rrf" | "rrf-fuzzy";
  highlighted?: string;
}

/**
 * Aggregate statistics for a ContentStore instance.
 */
export interface StoreStats {
  sources: number;
  chunks: number;
  codeChunks: number;
}

// ─────────────────────────────────────────────────────────
// Resume snapshot
// ─────────────────────────────────────────────────────────

/**
 * Structured representation of a session resume snapshot, suitable for
 * injecting into a new conversation as context. Generated from stored
 * SessionEvents by the snapshot builder.
 */
export interface ResumeSnapshot {
  /** ISO-8601 timestamp of when the snapshot was generated. */
  generatedAt: string;
  /** Human-readable summary of the session to this point. */
  summary: string;
  /** Ordered list of events selected for the snapshot (priority-filtered). */
  events: SessionEvent[];
}

// ─────────────────────────────────────────────────────────
// Priority constants
// ─────────────────────────────────────────────────────────

/**
 * Priority levels for SessionEvent records. Higher numbers are more important
 * and are retained when the snapshot budget is tight.
 */
export const EventPriority = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4,
} as const;

export type EventPriorityLevel = (typeof EventPriority)[keyof typeof EventPriority];
