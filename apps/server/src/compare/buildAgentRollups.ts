import type {
  AgentRollup,
  AgentWatchEvent,
  RunDetail,
} from "@agentwatch/types";
import { numOr0 } from "./utils.js";

/**
 * Pure: group events by `agentId` and compute per-agent counts/tokens. Agents
 * are ordered by first-event timestamp to keep the UI stable across refetches.
 */
export function buildAgentRollups(detail: RunDetail): AgentRollup[] {
  const order: string[] = [];
  const byAgent = new Map<string, AgentWatchEvent[]>();
  for (const e of detail.events) {
    const existing = byAgent.get(e.agentId);
    if (existing === undefined) {
      order.push(e.agentId);
      byAgent.set(e.agentId, [e]);
    } else {
      existing.push(e);
    }
  }

  return order.map((agentId) => summarise(agentId, byAgent.get(agentId)!));
}

function summarise(agentId: string, events: AgentWatchEvent[]): AgentRollup {
  let toolCallCount = 0;
  let llmCallCount = 0;
  let errorCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const e of events) {
    if (e.type === "tool_call") toolCallCount += 1;
    else if (e.type === "llm_call") llmCallCount += 1;
    else if (e.type === "llm_response") {
      const p = e.payload as Record<string, unknown>;
      inputTokens += numOr0(p["gen_ai.usage.input_tokens"]);
      outputTokens += numOr0(p["gen_ai.usage.output_tokens"]);
    }
    if (e.type === "tool_error" || e.type === "error") errorCount += 1;
  }

  const startTime = events[0].timestamp;
  const last = events[events.length - 1];
  const endTime = last.timestamp + (last.durationMs ?? 0);

  return {
    agentId,
    startTime,
    endTime,
    durationMs: endTime - startTime,
    eventCount: events.length,
    toolCallCount,
    llmCallCount,
    errorCount,
    inputTokens,
    outputTokens,
  };
}
