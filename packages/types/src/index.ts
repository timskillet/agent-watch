// ---------------------------------------------------------------------------
// EventType & EventLevel
// ---------------------------------------------------------------------------

export type EventType =
  | "user_prompt"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "llm_call"
  | "llm_response"
  | "agent_start"
  | "agent_end"
  | "agent_handoff"
  | "session_start"
  | "session_end"
  | "error"
  | "trace"
  | "custom"
  | (string & {}); // extensible — custom event types without modifying this package

export type EventLevel = "debug" | "info" | "warn" | "error";

export type IngestionSource = "claude_code_hook" | "otlp";

export type TimeRangePreset =
  | "15m"
  | "1h"
  | "4h"
  | "24h"
  | "7d"
  | "30d"
  | "all";

export type TimeRange =
  | { kind: "preset"; value: TimeRangePreset }
  | { kind: "custom"; since: number; until: number };

// ---------------------------------------------------------------------------
// Payload interfaces — OTel GenAI Semantic Convention naming
// ---------------------------------------------------------------------------

export interface LLMCallPayload {
  "gen_ai.system"?: string;
  "gen_ai.request.model": string;
  "gen_ai.request.max_tokens"?: number;
  "gen_ai.request.temperature"?: number;
  "gen_ai.operation.name"?: string;
  "gen_ai.input.messages"?: Array<{ role: string; content: unknown }>;
}

export interface LLMResponsePayload {
  "gen_ai.response.model": string;
  "gen_ai.response.id"?: string;
  "gen_ai.response.finish_reasons"?: string[];
  "gen_ai.usage.input_tokens": number;
  "gen_ai.usage.output_tokens": number;
  "gen_ai.usage.cache_read_input_tokens"?: number;
  "gen_ai.usage.cache_creation_input_tokens"?: number;
  "gen_ai.output.messages"?: Array<{ role: string; content: unknown }>;
}

export interface ToolCallPayload {
  "gen_ai.tool.name": string;
  "gen_ai.tool.call.id"?: string;
  "gen_ai.tool.type"?: string;
  "gen_ai.operation.name"?: string;
  input?: unknown;
}

export interface ToolResultPayload {
  "gen_ai.tool.name": string;
  "gen_ai.tool.call.id"?: string;
  output?: unknown;
  error?: string;
}

export interface AgentStartPayload {
  "gen_ai.agent.name": string;
  "gen_ai.agent.id": string;
  "gen_ai.agent.description"?: string;
  "gen_ai.conversation.id"?: string;
  "gen_ai.operation.name"?: string;
}

export interface AgentEndPayload extends AgentStartPayload {
  status?: "success" | "error" | "cancelled";
}

export interface AgentHandoffPayload extends AgentStartPayload {
  // AgentWatch-specific fields — no OTel equivalent for handoff targets
  targetAgentId: string;
  targetAgentName?: string;
}

export interface SessionStartPayload {
  cwd: string;
  project?: string;
}

export interface SessionEndPayload {
  durationMs?: number;
  totalCost?: number;
  totalTokens?: number;
}

export interface UserPromptPayload {
  promptLength: number;
  /**
   * Present only when the project opts in via `capturePromptContent: true` in
   * `agentwatch.config.json`. Server-capped to 8192 chars at ingestion.
   */
  promptText?: string;
}

export interface ToolErrorPayload {
  "gen_ai.tool.name": string;
  "gen_ai.tool.call.id"?: string;
  error: string;
  stack?: string;
}

export interface ErrorPayload {
  message: string;
  name?: string;
  stack?: string;
  code?: string;
}

export interface TracePayload {
  message: string;
  data?: Record<string, unknown>;
}

export interface CustomPayload {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// AgentWatchEvent
// ---------------------------------------------------------------------------

export interface AgentWatchEventBase {
  id: string;
  agentId: string;
  sessionId: string;

  // Multi-agent correlation (all optional — single-agent use works without them)
  pipelineId?: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  parentAgentId?: string;
  rootAgentId?: string;

  // Event structure
  parentId?: string;
  sequence: number;
  level: EventLevel;
  timestamp: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

export type AgentWatchEvent = AgentWatchEventBase &
  (
    | { type: "user_prompt"; payload: UserPromptPayload }
    | { type: "tool_call"; payload: ToolCallPayload }
    | { type: "tool_result"; payload: ToolResultPayload }
    | { type: "tool_error"; payload: ToolErrorPayload }
    | { type: "llm_call"; payload: LLMCallPayload }
    | { type: "llm_response"; payload: LLMResponsePayload }
    | { type: "agent_start"; payload: AgentStartPayload }
    | { type: "agent_end"; payload: AgentEndPayload }
    | { type: "agent_handoff"; payload: AgentHandoffPayload }
    | { type: "session_start"; payload: SessionStartPayload }
    | { type: "session_end"; payload: SessionEndPayload }
    | { type: "error"; payload: ErrorPayload }
    | { type: "trace"; payload: TracePayload }
    | { type: "custom"; payload: CustomPayload }
    | { type: string & {}; payload: Record<string, unknown> }
  );

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface Transport {
  send(events: AgentWatchEvent[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface EventFilter {
  sessionId?: string;
  agentId?: string;
  pipelineId?: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  ingestionSource?: IngestionSource;
  type?: EventType | EventType[];
  level?: EventLevel | EventLevel[];
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface SessionFilter {
  agentId?: string;
  pipelineId?: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  ingestionSource?: IngestionSource;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export type RunStatus = "running" | "completed" | "failed";

export type RunSortKey =
  | "startTime"
  | "durationMs"
  | "eventCount"
  | "cost"
  | "pipelineDefinitionId"
  | "status";

export type RunSortDir = "asc" | "desc";

export interface RunFilter {
  pipelineDefinitionId?: string;
  projectId?: string;
  ingestionSource?: IngestionSource | IngestionSource[];
  status?: RunStatus | RunStatus[];
  search?: string;
  sortBy?: RunSortKey;
  sortDir?: RunSortDir;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Summary types
// ---------------------------------------------------------------------------

export interface SessionSummary {
  sessionId: string;
  agentId: string;
  pipelineId?: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  eventCount: number;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  ingestionSource?: IngestionSource;
}

export interface PipelineRunSummary {
  pipelineId: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  agents: string[];
  eventCount: number;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: RunStatus;
  ingestionSource?: IngestionSource;
  cost?: number;
}

export interface RunListResult {
  rows: PipelineRunSummary[];
  total: number;
}

export interface RunDurationPoint {
  startTime: number;
  durationMs: number;
}

export type RunDurationTrends = Record<string, RunDurationPoint[]>;

export interface PipelineDefinitionSummary {
  pipelineDefinitionId: string;
  projectId?: string;
  runCount: number;
  lastRunTime?: number;
}

export interface ProjectSummary {
  projectId: string;
  pipelineDefinitionCount: number;
  runCount: number;
}

// ---------------------------------------------------------------------------
// EventStore query/result types
// ---------------------------------------------------------------------------

/**
 * One user prompt and everything it caused. For CC: walk events by sequence,
 * each `user_prompt` opens a new trace; events before the first prompt form
 * a synthetic preamble (index 0). For OTel: one trace per `otel_trace_id`,
 * falling back to one-trace-per-session when absent.
 */
export interface Trace {
  /** `{sessionId}:{index}` for CC; `otel_trace_id` for OTel. */
  traceId: string;
  sessionId: string;
  /** 0 for preamble / OTel single-trace fallback; 1..N for CC prompt traces. */
  index: number;
  startTime: number;
  endTime: number;
  durationMs: number;

  promptLength: number;
  /** Truncated to 240 chars. Only populated when `capturePromptContent` is on. */
  promptPreview?: string;

  toolCounts: Record<string, number>;
  /** Distinct tool names in first-use order. */
  tools: string[];

  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  /**
   * CC: allocated from `session_end.totalCost` by event-count share (heuristic).
   * OTel: undefined for v1.
   */
  cost?: number;

  errorCount: number;
  /** Flat count: consecutive same-tool calls with strictly-equal JSON inputs. */
  retryCount: number;

  /** Slice of `RunDetail.events` for this trace (same object references). */
  events: AgentWatchEvent[];
}

export interface RunDetail {
  pipelineId: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  status: RunStatus;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  agents: string[];
  /** Eagerly loaded — suitable for short-lived runs. Use EventStore.getEvents() with a filter for large pipelines. */
  events: AgentWatchEvent[];
  /** Prompt-bounded traces derived from `events`. Empty array if no events. */
  traces: Trace[];
}

/** @deprecated Use {@link RunComparisonResult}. Kept only for source compatibility until downstream callers migrate. */
export interface RunComparison {
  a: RunDetail;
  b: RunDetail;
}

/**
 * Roll-up of a single run for the compare payload. Excludes `events` and
 * `traces` to keep the wire shape O(trace count + agent count) rather than
 * O(event count). Drill-down uses the existing `GET /api/runs/:pipelineId`.
 */
export interface RunSummaryForCompare {
  pipelineId: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  status: RunStatus;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  agents: string[];
  eventCount: number;
  toolCallCount: number;
  llmCallCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  cost?: number;
  ingestionSource?: IngestionSource;
}

/** Per-`agentId` counts/tokens within a single run. */
export interface AgentRollup {
  agentId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  eventCount: number;
  toolCallCount: number;
  llmCallCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
}

/** `Trace` without the per-event slice — re-fetched on drill-down. */
export type TraceRollup = Omit<Trace, "events">;

export interface RunComparisonResult {
  a: RunSummaryForCompare;
  b: RunSummaryForCompare;
  agentsA: AgentRollup[];
  agentsB: AgentRollup[];
  tracesA: TraceRollup[];
  tracesB: TraceRollup[];
}

export interface PanelQuery {
  tool?: string;
  metric?:
    | "session.cost"
    | "session.duration"
    | "tool.count"
    | "tool.duration"
    | "tool.failure_rate"
    | "token.usage";
  groupBy?:
    | "day"
    | "tool_name"
    | "command_prefix"
    | "session_tag"
    | "bash_command"
    | "file_extension"
    | "mcp_server";
  range?: "7d" | "30d" | "90d";
  since?: number;
  until?: number;
  limit?: number;
}

export interface PanelResult {
  rows: Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// EventStore
// ---------------------------------------------------------------------------

// Synchronous — assumes a synchronous store (e.g. better-sqlite3)
export interface EventStore {
  insert(events: AgentWatchEvent[]): void;
  getEvents(filter: EventFilter): AgentWatchEvent[];
  getSessions(filter: SessionFilter): SessionSummary[];
  getRuns(filter: RunFilter): PipelineRunSummary[];
  getRunsCount(filter: RunFilter): number;
  getRunDurationTrends(
    pipelineDefinitionIds: string[],
    perPipelineLimit: number,
  ): RunDurationTrends;
  getRunDetail(pipelineId: string): RunDetail | null;
  compareRuns(a: string, b: string): RunComparisonResult | null;
  getProjectSummaries(): ProjectSummary[];
  getSessionTags(sessionId: string): string[];
  setSessionTags(sessionId: string, tags: string[]): void;
  getPanelData(query: PanelQuery): PanelResult;
}
