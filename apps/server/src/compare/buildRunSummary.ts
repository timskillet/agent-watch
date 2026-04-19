import type {
  AgentWatchEvent,
  IngestionSource,
  RunDetail,
  RunSummaryForCompare,
} from "@agentwatch/types";
import { numOr0 } from "./utils.js";

/**
 * Pure: roll up a {@link RunDetail} into the compare-payload shape. Excludes
 * `events` / `traces` (O(N)) so the wire payload stays small.
 */
export function buildRunSummary(detail: RunDetail): RunSummaryForCompare {
  const counts = countEvents(detail.events);
  const cost = readSessionCost(detail.events);
  const firstEvent = detail.events[0];
  const source =
    typeof firstEvent?.meta?.ingestion_source === "string"
      ? (firstEvent.meta.ingestion_source as IngestionSource)
      : undefined;

  return {
    pipelineId: detail.pipelineId,
    pipelineDefinitionId: detail.pipelineDefinitionId,
    projectId: detail.projectId,
    status: detail.status,
    startTime: detail.startTime,
    endTime: detail.endTime,
    durationMs: detail.durationMs,
    agents: detail.agents,
    eventCount: detail.events.length,
    toolCallCount: counts.toolCalls,
    llmCallCount: counts.llmCalls,
    errorCount: counts.errors,
    inputTokens: counts.inputTokens,
    outputTokens: counts.outputTokens,
    cost,
    ingestionSource: source,
  };
}

interface Counts {
  toolCalls: number;
  llmCalls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
}

function countEvents(events: AgentWatchEvent[]): Counts {
  let toolCalls = 0;
  let llmCalls = 0;
  let errors = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const e of events) {
    if (e.type === "tool_call") toolCalls += 1;
    else if (e.type === "llm_call") llmCalls += 1;
    else if (e.type === "llm_response") {
      const p = e.payload as Record<string, unknown>;
      inputTokens += numOr0(p["gen_ai.usage.input_tokens"]);
      outputTokens += numOr0(p["gen_ai.usage.output_tokens"]);
    }
    if (e.type === "tool_error" || e.type === "error") errors += 1;
  }
  return { toolCalls, llmCalls, errors, inputTokens, outputTokens };
}

function readSessionCost(events: AgentWatchEvent[]): number | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "session_end") continue;
    const raw = (e.payload as { totalCost?: unknown }).totalCost;
    if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
    return undefined;
  }
  return undefined;
}
