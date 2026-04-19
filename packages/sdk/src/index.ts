// ---------------------------------------------------------------------------
// Config types (SDK-specific)
// ---------------------------------------------------------------------------

export type {
  AgentWatchConfig,
  AlertRule,
  AnnotationRule,
  PanelDefinition,
  PanelQuery,
} from "./config.js";

// ---------------------------------------------------------------------------
// defineConfig — identity function for TypeScript inference
// ---------------------------------------------------------------------------

import type { AgentWatchConfig } from "./config.js";

export function defineConfig(config: AgentWatchConfig): AgentWatchConfig {
  return config;
}

// ---------------------------------------------------------------------------
// Re-export all types from @agentwatch/types for convenience
// (PanelQuery intentionally omitted — the SDK exports its own from ./config)
// ---------------------------------------------------------------------------

export type {
  EventType,
  EventLevel,
  IngestionSource,
  AgentWatchEvent,
  AgentWatchEventBase,
  LLMCallPayload,
  LLMResponsePayload,
  ToolCallPayload,
  ToolResultPayload,
  ToolErrorPayload,
  AgentStartPayload,
  AgentEndPayload,
  AgentHandoffPayload,
  SessionStartPayload,
  SessionEndPayload,
  UserPromptPayload,
  ErrorPayload,
  TracePayload,
  CustomPayload,
  EventFilter,
  SessionFilter,
  RunFilter,
  SessionSummary,
  PipelineRunSummary,
  PipelineDefinitionSummary,
  ProjectSummary,
  EventStore,
  Transport,
  RunDetail,
  RunComparison,
  RunComparisonResult,
  RunSummaryForCompare,
  AgentRollup,
  TraceRollup,
  PanelResult,
} from "@agentwatch/types";
