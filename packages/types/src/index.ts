// ---------------------------------------------------------------------------
// EventType & EventLevel
// ---------------------------------------------------------------------------

export type EventType =
  | "input"
  | "output"
  | "tool_call"
  | "tool_result"
  | "llm_call"
  | "llm_response"
  | "error"
  | "trace"
  | "memory_read"
  | "memory_write"
  | "agent_start"
  | "agent_end"
  | "agent_handoff"
  | "custom"
  | (string & {}); // extensible — custom event types without modifying this package

export type EventLevel = "debug" | "info" | "warn" | "error";

// ---------------------------------------------------------------------------
// Payload interfaces — OTel GenAI Semantic Convention naming
// ---------------------------------------------------------------------------

export interface LLMCallPayload {
  "gen_ai.system"?: string;
  "gen_ai.request.model": string;
  "gen_ai.request.max_tokens"?: number;
  "gen_ai.request.temperature"?: number;
  "gen_ai.operation.name"?: string;
  "gen_ai.input.messages"?: unknown[];
}

export interface LLMResponsePayload {
  "gen_ai.response.model": string;
  "gen_ai.response.id"?: string;
  "gen_ai.response.finish_reasons"?: string[];
  "gen_ai.usage.input_tokens": number;
  "gen_ai.usage.output_tokens": number;
  "gen_ai.usage.cache_read_input_tokens"?: number;
  "gen_ai.usage.cache_creation_input_tokens"?: number;
  "gen_ai.output.messages"?: unknown[];
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

export interface AgentEndPayload {
  "gen_ai.agent.name": string;
  "gen_ai.agent.id": string;
  "gen_ai.agent.description"?: string;
  "gen_ai.conversation.id"?: string;
  "gen_ai.operation.name"?: string;
  status?: string;
}

export interface AgentHandoffPayload {
  "gen_ai.agent.name": string;
  "gen_ai.agent.id": string;
  "gen_ai.agent.description"?: string;
  "gen_ai.conversation.id"?: string;
  "gen_ai.operation.name"?: string;
  targetAgentId: string;
  targetAgentName?: string;
}

export interface InputPayload {
  content: unknown;
  format?: string;
}

export interface OutputPayload {
  content: unknown;
  format?: string;
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

export interface MemoryReadPayload {
  key?: string;
  query?: string;
  result?: unknown;
}

export interface MemoryWritePayload {
  key?: string;
  content: unknown;
}

export interface CustomPayload {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// AgentWatchEvent
// ---------------------------------------------------------------------------

export interface AgentWatchEvent {
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
  type: EventType;
  level: EventLevel;
  timestamp: number;
  durationMs?: number;
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface Transport {
  send(events: AgentWatchEvent[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface EventFilters {
  sessionId?: string;
  agentId?: string;
  pipelineId?: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  type?: EventType | EventType[];
  level?: EventLevel | EventLevel[];
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface SessionFilters {
  agentId?: string;
  pipelineId?: string;
  pipelineDefinitionId?: string;
  projectId?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface RunFilters {
  pipelineDefinitionId?: string;
  projectId?: string;
  status?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Summary types
// ---------------------------------------------------------------------------

export interface AgentSummary {
  agentId: string;
  name?: string;
  eventCount: number;
  firstSeen: number;
  lastSeen: number;
}

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
  status: "running" | "completed" | "failed";
}

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
// EventStore
// ---------------------------------------------------------------------------

export interface EventStore {
  insert(events: AgentWatchEvent[]): void;
  getEvents(filters: EventFilters): AgentWatchEvent[];
  getSessions(filters: SessionFilters): SessionSummary[];
  getAgents(): AgentSummary[];
  getRuns(filters: RunFilters): PipelineRunSummary[];
}
