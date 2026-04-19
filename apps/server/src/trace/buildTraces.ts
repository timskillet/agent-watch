import type { AgentWatchEvent, Trace } from "@agentwatch/types";

const PROMPT_PREVIEW_CHARS = 240;

/**
 * Derive prompt-bounded traces from a run's events. Pure: no IO, no mutation
 * of the input array.
 *
 * - CC (`ingestion_source: "claude_code_hook"`): walk events in order, each
 *   `user_prompt` opens a new trace; events before the first prompt form a
 *   synthetic preamble (dropped when it contains only `session_start` /
 *   `session_end` and at least one real prompt-trace exists).
 * - OTLP (`ingestion_source: "otlp"`): one trace per distinct
 *   `meta.otel_trace_id`, falling back to a single trace per session when
 *   no trace id is present.
 * - Mixed-source sessions are rare; CC rules win (strictly more permissive).
 */
export function buildTraces(events: AgentWatchEvent[]): Trace[] {
  if (events.length === 0) return [];
  const allOtel = events.every((e) => e.meta?.ingestion_source === "otlp");
  return allOtel ? buildOtelTraces(events) : buildCCTraces(events);
}

function buildCCTraces(events: AgentWatchEvent[]): Trace[] {
  const sessionId = events[0].sessionId;

  const buckets: AgentWatchEvent[][] = [[]];
  for (const e of events) {
    if (e.type === "user_prompt") buckets.push([]);
    buckets[buckets.length - 1].push(e);
  }

  let startIndex = 0;
  if (buckets.length > 1 && isPreambleTrivial(buckets[0])) {
    buckets.shift();
    startIndex = 1;
  }

  const traces = buckets.map((bucket, i) =>
    summarise(bucket, sessionId, startIndex + i),
  );
  allocateCostCC(traces, events);
  return traces;
}

function buildOtelTraces(events: AgentWatchEvent[]): Trace[] {
  const sessionId = events[0].sessionId;
  const UNKNOWN = "__unknown__";

  const groupMap = new Map<string, AgentWatchEvent[]>();
  for (const e of events) {
    const key =
      typeof e.meta?.otel_trace_id === "string"
        ? e.meta.otel_trace_id
        : UNKNOWN;
    const bucket = groupMap.get(key);
    if (bucket) bucket.push(e);
    else groupMap.set(key, [e]);
  }

  const ordered = Array.from(groupMap.entries()).sort(
    ([, a], [, b]) => a[0].timestamp - b[0].timestamp,
  );

  if (ordered.length === 1 && ordered[0][0] === UNKNOWN) {
    return [summarise(events, sessionId, 0, `${sessionId}:0`)];
  }

  return ordered.map(([key, bucket], i) =>
    summarise(
      bucket,
      sessionId,
      i,
      key === UNKNOWN ? `${sessionId}:${i}` : key,
    ),
  );
}

function isPreambleTrivial(bucket: AgentWatchEvent[]): boolean {
  if (bucket.length === 0) return true;
  return bucket.every(
    (e) => e.type === "session_start" || e.type === "session_end",
  );
}

function summarise(
  bucket: AgentWatchEvent[],
  sessionId: string,
  index: number,
  overrideTraceId?: string,
): Trace {
  const firstPrompt = bucket.find(
    (e): e is AgentWatchEvent & { type: "user_prompt" } =>
      e.type === "user_prompt",
  );

  const toolCounts: Record<string, number> = {};
  const tools: string[] = [];
  let llmCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorCount = 0;

  for (const e of bucket) {
    if (e.type === "tool_call") {
      const name =
        typeof (e.payload as Record<string, unknown>)["gen_ai.tool.name"] ===
        "string"
          ? ((e.payload as Record<string, unknown>)[
              "gen_ai.tool.name"
            ] as string)
          : "";
      if (!name) continue;
      if (toolCounts[name] === undefined) tools.push(name);
      toolCounts[name] = (toolCounts[name] ?? 0) + 1;
    } else if (e.type === "llm_call") {
      llmCalls += 1;
    } else if (e.type === "llm_response") {
      const p = e.payload as Record<string, unknown>;
      inputTokens += numOr0(p["gen_ai.usage.input_tokens"]);
      outputTokens += numOr0(p["gen_ai.usage.output_tokens"]);
    } else if (e.type === "tool_error" || e.type === "error") {
      errorCount += 1;
    }
  }

  const retryCount = countFlatRetries(bucket);

  const startTime = bucket.length > 0 ? bucket[0].timestamp : 0;
  const last = bucket.length > 0 ? bucket[bucket.length - 1] : undefined;
  const endTime =
    last !== undefined ? last.timestamp + (last.durationMs ?? 0) : startTime;

  const promptPreviewRaw =
    firstPrompt !== undefined
      ? (firstPrompt.payload as { promptText?: string }).promptText
      : undefined;

  return {
    traceId: overrideTraceId ?? `${sessionId}:${index}`,
    sessionId,
    index,
    startTime,
    endTime,
    durationMs: endTime - startTime,
    promptLength:
      firstPrompt !== undefined
        ? ((firstPrompt.payload as { promptLength?: number }).promptLength ?? 0)
        : 0,
    promptPreview:
      typeof promptPreviewRaw === "string" && promptPreviewRaw.length > 0
        ? promptPreviewRaw.slice(0, PROMPT_PREVIEW_CHARS)
        : undefined,
    toolCounts,
    tools,
    llmCalls,
    inputTokens,
    outputTokens,
    cost: undefined,
    errorCount,
    retryCount,
    events: bucket,
  };
}

function countFlatRetries(bucket: AgentWatchEvent[]): number {
  let retries = 0;
  let prev: { tool: string; input: string } | null = null;
  for (const e of bucket) {
    if (e.type !== "tool_call") continue;
    const p = e.payload as Record<string, unknown>;
    const tool =
      typeof p["gen_ai.tool.name"] === "string"
        ? (p["gen_ai.tool.name"] as string)
        : "";
    const input = JSON.stringify(p.input ?? null);
    if (prev !== null && prev.tool === tool && prev.input === input) {
      retries += 1;
    }
    prev = { tool, input };
  }
  return retries;
}

function allocateCostCC(traces: Trace[], events: AgentWatchEvent[]): void {
  let sessionEnd: AgentWatchEvent | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "session_end") {
      sessionEnd = events[i];
      break;
    }
  }
  if (sessionEnd === undefined) return;
  const totalCostRaw = (sessionEnd.payload as { totalCost?: unknown })
    .totalCost;
  if (typeof totalCostRaw !== "number" || Number.isNaN(totalCostRaw)) return;

  const totalEvents = traces.reduce((acc, t) => acc + t.events.length, 0);
  if (totalEvents === 0) return;

  for (const t of traces) {
    t.cost = totalCostRaw * (t.events.length / totalEvents);
  }
}

function numOr0(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}
