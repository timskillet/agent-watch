import type { AgentWatchEvent } from "@agentwatch/types";

export interface PairedToolCall {
  call: AgentWatchEvent; // type: 'tool_call'
  paired?: AgentWatchEvent; // type: 'tool_result' | 'tool_error' (if found)
  durationMs?: number;
  isError: boolean;
}

/**
 * Filters `events` to `tool_call` entries and pairs each with its corresponding
 * `tool_result` or `tool_error` by matching `gen_ai.tool.call.id`.
 *
 * Duration is derived from call.timestamp → paired.timestamp + paired.durationMs
 * when a paired event is present, otherwise falls back to call.durationMs.
 */
export function pairToolEvents(events: AgentWatchEvent[]): PairedToolCall[] {
  type ToolPayload = {
    "gen_ai.tool.call.id"?: string;
  };

  const resultMap = new Map<string, AgentWatchEvent>();
  for (const e of events) {
    if (e.type !== "tool_result" && e.type !== "tool_error") continue;
    const callId = (e.payload as ToolPayload)["gen_ai.tool.call.id"];
    if (callId) resultMap.set(callId, e);
  }

  const pairs: PairedToolCall[] = [];
  for (const e of events) {
    if (e.type !== "tool_call") continue;
    const callId = (e.payload as ToolPayload)["gen_ai.tool.call.id"];
    const paired = callId ? resultMap.get(callId) : undefined;

    let durationMs: number | undefined;
    if (paired !== undefined) {
      durationMs = paired.timestamp + (paired.durationMs ?? 0) - e.timestamp;
    } else {
      durationMs = e.durationMs;
    }

    pairs.push({
      call: e,
      paired,
      durationMs,
      isError: paired?.type === "tool_error",
    });
  }

  return pairs;
}
