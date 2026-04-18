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
  // Never store actual prompt content
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
}

export interface RunComparison {
  a: RunDetail;
  b: RunDetail;
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
  compareRuns(a: string, b: string): RunComparison | null;
  getProjectSummaries(): ProjectSummary[];
  getSessionTags(sessionId: string): string[];
  setSessionTags(sessionId: string, tags: string[]): void;
  getPanelData(query: PanelQuery): PanelResult;
}
