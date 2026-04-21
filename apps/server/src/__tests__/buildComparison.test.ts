import { describe, it, expect } from "vitest";
import type { AgentWatchEvent, RunDetail, Trace } from "@agentwatch/types";
import { buildRunSummary } from "../compare/buildRunSummary.js";
import { buildAgentRollups } from "../compare/buildAgentRollups.js";
import { buildComparison } from "../compare/buildComparison.js";

type EventOverride = Partial<AgentWatchEvent> & {
  type: AgentWatchEvent["type"];
  payload?: unknown;
};

function evt(
  i: number,
  type: EventOverride["type"],
  extra: EventOverride = { type },
): AgentWatchEvent {
  return {
    id: `evt-${i}`,
    agentId: extra.agentId ?? "agent-main",
    sessionId: "sess-X",
    pipelineId: "run-X",
    sequence: i,
    level: extra.level ?? "info",
    timestamp: 1_700_000_000_000 + i * 1000,
    meta: extra.meta ?? { ingestion_source: "claude_code_hook" },
    ...extra,
    type,
    payload: (extra.payload ?? {}) as AgentWatchEvent["payload"],
  } as AgentWatchEvent;
}

function makeTrace(index: number, events: AgentWatchEvent[]): Trace {
  const start = events[0]?.timestamp ?? 0;
  const last = events[events.length - 1];
  const end = last ? last.timestamp + (last.durationMs ?? 0) : start;
  return {
    traceId: `sess-X:${index}`,
    sessionId: "sess-X",
    index,
    startTime: start,
    endTime: end,
    durationMs: end - start,
    promptLength: 0,
    toolCounts: {},
    tools: [],
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    errorCount: 0,
    retryCount: 0,
    events,
  };
}

function makeDetail(
  pipelineId: string,
  events: AgentWatchEvent[],
  overrides: Partial<RunDetail> = {},
): RunDetail {
  const stamped = events.map((e) => ({ ...e, pipelineId }));
  const agents = [...new Set(stamped.map((e) => e.agentId))];
  const start = stamped[0]?.timestamp ?? 0;
  const end = stamped[stamped.length - 1]?.timestamp ?? start;
  return {
    pipelineId,
    pipelineDefinitionId: "my-app",
    projectId: "proj-1",
    status: "completed",
    startTime: start,
    endTime: end,
    durationMs: end - start,
    agents,
    events: stamped,
    traces: [makeTrace(1, stamped)],
    ...overrides,
  };
}

describe("buildRunSummary", () => {
  it("counts tool_call / llm_call / error / tokens from events", () => {
    const events = [
      evt(1, "session_start"),
      evt(2, "tool_call"),
      evt(3, "tool_call"),
      evt(4, "llm_call"),
      evt(5, "llm_response", {
        type: "llm_response",
        payload: {
          "gen_ai.usage.input_tokens": 100,
          "gen_ai.usage.output_tokens": 50,
        },
      }),
      evt(6, "tool_error", { type: "tool_error", level: "error" }),
      evt(7, "session_end", {
        type: "session_end",
        payload: { totalCost: 0.13 },
      }),
    ];
    const summary = buildRunSummary(makeDetail("run-A", events));
    expect(summary.pipelineId).toBe("run-A");
    expect(summary.eventCount).toBe(7);
    expect(summary.toolCallCount).toBe(2);
    expect(summary.llmCallCount).toBe(1);
    expect(summary.errorCount).toBe(1);
    expect(summary.inputTokens).toBe(100);
    expect(summary.outputTokens).toBe(50);
    expect(summary.cost).toBeCloseTo(0.13);
    expect(summary.ingestionSource).toBe("claude_code_hook");
  });

  it("omits cost when session_end has no totalCost", () => {
    const events = [
      evt(1, "session_start"),
      evt(2, "session_end", { type: "session_end", payload: {} }),
    ];
    const summary = buildRunSummary(makeDetail("run-B", events));
    expect(summary.cost).toBeUndefined();
  });

  it("keeps cost undefined when session_end is missing", () => {
    const events = [evt(1, "session_start"), evt(2, "tool_call")];
    const summary = buildRunSummary(makeDetail("run-C", events));
    expect(summary.cost).toBeUndefined();
  });

  it("empty run yields zero counts and no source", () => {
    const summary = buildRunSummary({
      pipelineId: "run-empty",
      status: "running",
      startTime: 0,
      agents: [],
      events: [],
      traces: [],
    });
    expect(summary.toolCallCount).toBe(0);
    expect(summary.eventCount).toBe(0);
    expect(summary.ingestionSource).toBeUndefined();
  });

  it("reads ingestion_source from the first event for OTel runs", () => {
    const events = [
      evt(1, "llm_call", {
        type: "llm_call",
        meta: { ingestion_source: "otlp" },
      }),
    ];
    const summary = buildRunSummary(makeDetail("run-otel", events));
    expect(summary.ingestionSource).toBe("otlp");
  });
});

describe("buildAgentRollups", () => {
  it("groups events by agentId and preserves first-seen order", () => {
    const events = [
      evt(1, "session_start", { agentId: "a" }),
      evt(2, "tool_call", { agentId: "b" }),
      evt(3, "tool_call", { agentId: "a" }),
      evt(4, "llm_call", { agentId: "b" }),
    ];
    const rollups = buildAgentRollups(makeDetail("run-multi", events));
    expect(rollups.map((r) => r.agentId)).toEqual(["a", "b"]);
    const a = rollups.find((r) => r.agentId === "a")!;
    expect(a.eventCount).toBe(2);
    expect(a.toolCallCount).toBe(1);
    const b = rollups.find((r) => r.agentId === "b")!;
    expect(b.toolCallCount).toBe(1);
    expect(b.llmCallCount).toBe(1);
  });

  it("returns empty array when run has no events", () => {
    const rollups = buildAgentRollups({
      pipelineId: "r",
      status: "running",
      startTime: 0,
      agents: [],
      events: [],
      traces: [],
    });
    expect(rollups).toEqual([]);
  });

  it("uses last event timestamp + durationMs for endTime", () => {
    const events = [
      evt(1, "tool_call", { agentId: "a" }),
      evt(2, "tool_call", {
        agentId: "a",
        durationMs: 500,
      }),
    ];
    const rollups = buildAgentRollups(makeDetail("r", events));
    const expectedEnd = 1_700_000_000_000 + 2 * 1000 + 500;
    expect(rollups[0].endTime).toBe(expectedEnd);
    expect(rollups[0].durationMs).toBe(expectedEnd - 1_700_000_000_000 - 1000);
  });
});

describe("buildComparison", () => {
  it("strips events[] from both run summaries and traces", () => {
    const events = [evt(1, "user_prompt"), evt(2, "tool_call")];
    const a = makeDetail("run-A", events);
    const b = makeDetail("run-B", events);
    const result = buildComparison(a, b);
    expect((result.a as { events?: unknown }).events).toBeUndefined();
    expect((result.b as { events?: unknown }).events).toBeUndefined();
    for (const t of [...result.tracesA, ...result.tracesB]) {
      expect((t as { events?: unknown }).events).toBeUndefined();
    }
  });

  it("rolls up both sides independently", () => {
    const eventsA = [
      evt(1, "tool_call"),
      evt(2, "tool_call"),
      evt(3, "session_end", {
        type: "session_end",
        payload: { totalCost: 0.2 },
      }),
    ];
    const eventsB = [
      evt(1, "tool_call"),
      evt(2, "tool_error", { type: "tool_error", level: "error" }),
    ];
    const result = buildComparison(
      makeDetail("run-A", eventsA),
      makeDetail("run-B", eventsB),
    );
    expect(result.a.toolCallCount).toBe(2);
    expect(result.a.cost).toBeCloseTo(0.2);
    expect(result.b.toolCallCount).toBe(1);
    expect(result.b.errorCount).toBe(1);
  });

  it("passes through trace rollup fields (without events)", () => {
    const events = [
      evt(1, "tool_call", {
        payload: { "gen_ai.tool.name": "Bash", input: { command: "ls" } },
      }),
    ];
    const detail = makeDetail("run-A", events);
    detail.traces = [
      {
        ...makeTrace(1, detail.events),
        toolCounts: { Bash: 3 },
        tools: ["Bash"],
        inputTokens: 100,
      },
    ];
    const result = buildComparison(detail, detail);
    expect(result.tracesA[0].toolCounts).toEqual({ Bash: 3 });
    expect(result.tracesA[0].tools).toEqual(["Bash"]);
    expect(result.tracesA[0].inputTokens).toBe(100);
  });
});
