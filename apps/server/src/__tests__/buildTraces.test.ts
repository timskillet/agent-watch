import { describe, it, expect } from "vitest";
import type { AgentWatchEvent } from "@agentwatch/types";
import { buildTraces } from "../trace/buildTraces.js";

type EventOverride = Partial<AgentWatchEvent> & {
  type: AgentWatchEvent["type"];
  payload?: unknown;
};

function cc(
  i: number,
  type: EventOverride["type"],
  extra: EventOverride = { type },
): AgentWatchEvent {
  return {
    id: `evt-${i}`,
    agentId: "sess-cc",
    sessionId: "sess-cc",
    pipelineId: "sess-cc",
    sequence: i,
    level: "info",
    timestamp: 1_700_000_000_000 + i * 1000,
    meta: { ingestion_source: "claude_code_hook" },
    ...extra,
    type,
    payload: extra.payload ?? {},
  } as AgentWatchEvent;
}

function otel(
  i: number,
  type: EventOverride["type"],
  traceId: string | undefined,
  extra: EventOverride = { type },
): AgentWatchEvent {
  return {
    id: `evt-${i}`,
    agentId: "sess-otel",
    sessionId: "sess-otel",
    sequence: i,
    level: "info",
    timestamp: 1_700_000_000_000 + i * 1000,
    meta: {
      ingestion_source: "otlp",
      ...(traceId !== undefined ? { otel_trace_id: traceId } : {}),
    },
    ...extra,
    type,
    payload: extra.payload ?? {},
  } as AgentWatchEvent;
}

function toolCall(
  i: number,
  toolName: string,
  input: unknown,
): AgentWatchEvent {
  return cc(i, "tool_call", {
    type: "tool_call",
    payload: {
      "gen_ai.tool.name": toolName,
      "gen_ai.tool.call.id": `call-${i}`,
      input,
    },
  });
}

function userPrompt(
  i: number,
  promptLength: number,
  promptText?: string,
): AgentWatchEvent {
  return cc(i, "user_prompt", {
    type: "user_prompt",
    payload:
      promptText !== undefined
        ? { promptLength, promptText }
        : { promptLength },
  });
}

function llmResponse(
  i: number,
  inputTokens: number,
  outputTokens: number,
): AgentWatchEvent {
  return cc(i, "llm_response", {
    type: "llm_response",
    payload: {
      "gen_ai.usage.input_tokens": inputTokens,
      "gen_ai.usage.output_tokens": outputTokens,
    },
  });
}

describe("buildTraces — empty", () => {
  it("returns [] for empty events array", () => {
    expect(buildTraces([])).toEqual([]);
  });
});

describe("buildTraces — CC", () => {
  it("CC session with 0 prompts and 3 tool_calls: 1 trace at index 0", () => {
    const events = [
      toolCall(1, "Bash", { command: "ls" }),
      toolCall(2, "Read", { file_path: "/a.ts" }),
      toolCall(3, "Bash", { command: "pwd" }),
    ];
    const traces = buildTraces(events);
    expect(traces).toHaveLength(1);
    expect(traces[0].index).toBe(0);
    expect(traces[0].traceId).toBe("sess-cc:0");
    expect(traces[0].tools).toEqual(["Bash", "Read"]);
    expect(traces[0].toolCounts).toEqual({ Bash: 2, Read: 1 });
    expect(traces[0].promptLength).toBe(0);
  });

  it("CC session with only session_start before the first prompt drops the preamble", () => {
    const events = [
      cc(1, "session_start", { type: "session_start", payload: { cwd: "/w" } }),
      userPrompt(2, 10),
      toolCall(3, "Bash", { command: "ls" }),
    ];
    const traces = buildTraces(events);
    expect(traces).toHaveLength(1);
    expect(traces[0].index).toBe(1);
    expect(traces[0].promptLength).toBe(10);
  });

  it("CC session with 3 prompts back-to-back: 3 traces indexed 1..3", () => {
    const events = [
      userPrompt(1, 5),
      toolCall(2, "Bash", { command: "a" }),
      userPrompt(3, 6),
      toolCall(4, "Bash", { command: "b" }),
      userPrompt(5, 7),
      toolCall(6, "Bash", { command: "c" }),
    ];
    const traces = buildTraces(events);
    expect(traces.map((t) => t.index)).toEqual([1, 2, 3]);
    expect(traces.map((t) => t.traceId)).toEqual([
      "sess-cc:1",
      "sess-cc:2",
      "sess-cc:3",
    ]);
  });

  it("CC tool_error inside trace counts in errorCount", () => {
    const events = [
      userPrompt(1, 4),
      toolCall(2, "Bash", { command: "fail" }),
      cc(3, "tool_error", {
        type: "tool_error",
        level: "error",
        payload: { "gen_ai.tool.name": "Bash", error: "boom" },
      }),
      userPrompt(4, 5),
      toolCall(5, "Bash", { command: "ok" }),
    ];
    const traces = buildTraces(events);
    expect(traces).toHaveLength(2);
    expect(traces[0].errorCount).toBe(1);
    expect(traces[1].errorCount).toBe(0);
  });

  it("retryCount: same tool_call twice with identical input counts once", () => {
    const events = [
      userPrompt(1, 4),
      toolCall(2, "Bash", { command: "ls" }),
      toolCall(3, "Bash", { command: "ls" }),
      toolCall(4, "Bash", { command: "ls" }),
    ];
    const traces = buildTraces(events);
    expect(traces[0].retryCount).toBe(2);
  });

  it("retryCount: same tool_call twice with different input does NOT count", () => {
    const events = [
      userPrompt(1, 4),
      toolCall(2, "Bash", { command: "ls" }),
      toolCall(3, "Bash", { command: "pwd" }),
    ];
    const traces = buildTraces(events);
    expect(traces[0].retryCount).toBe(0);
  });

  it("session_end.totalCost is allocated by event-count share across traces", () => {
    const events = [
      userPrompt(1, 4),
      toolCall(2, "Bash", { command: "a" }),
      toolCall(3, "Read", { file_path: "/x" }),
      userPrompt(4, 5),
      toolCall(5, "Bash", { command: "b" }),
      cc(6, "session_end", {
        type: "session_end",
        payload: { totalCost: 0.5 },
      }),
    ];
    const traces = buildTraces(events);
    expect(traces).toHaveLength(2);
    const costSum = (traces[0].cost ?? 0) + (traces[1].cost ?? 0);
    expect(costSum).toBeCloseTo(0.5, 6);
    expect(traces[0].events.length).toBe(3);
    expect(traces[1].events.length).toBe(3);
    expect(traces[0].cost).toBeCloseTo(0.25, 6);
    expect(traces[1].cost).toBeCloseTo(0.25, 6);
  });

  it("promptText present is truncated to 240 chars in promptPreview", () => {
    const longText = "x".repeat(500);
    const events = [userPrompt(1, 500, longText), toolCall(2, "Bash", {})];
    const traces = buildTraces(events);
    expect(traces[0].promptPreview).toHaveLength(240);
    expect(traces[0].promptPreview).toBe("x".repeat(240));
  });

  it("promptText absent → promptPreview undefined, promptLength correct", () => {
    const events = [userPrompt(1, 42), toolCall(2, "Bash", {})];
    const traces = buildTraces(events);
    expect(traces[0].promptPreview).toBeUndefined();
    expect(traces[0].promptLength).toBe(42);
  });

  it("llm_response token usage is summed into trace rollup", () => {
    const events = [
      userPrompt(1, 4),
      cc(2, "llm_call", { type: "llm_call", payload: {} }),
      llmResponse(3, 100, 200),
      cc(4, "llm_call", { type: "llm_call", payload: {} }),
      llmResponse(5, 50, 75),
    ];
    const traces = buildTraces(events);
    expect(traces[0].llmCalls).toBe(2);
    expect(traces[0].inputTokens).toBe(150);
    expect(traces[0].outputTokens).toBe(275);
  });

  it("trace durationMs is derived from first and last event (+last.durationMs)", () => {
    const events = [userPrompt(1, 4), toolCall(2, "Bash", { command: "x" })];
    // toolCall at seq 2 has timestamp 1_700_000_002_000, user_prompt at 1_700_000_001_000
    const traces = buildTraces(events);
    expect(traces[0].startTime).toBe(1_700_000_001_000);
    expect(traces[0].endTime).toBe(1_700_000_002_000);
    expect(traces[0].durationMs).toBe(1000);
  });
});

describe("buildTraces — OTel", () => {
  it("2 distinct otel_trace_ids → 2 traces keyed by otel_trace_id", () => {
    const events = [
      otel(1, "llm_call", "trace-A", { type: "llm_call", payload: {} }),
      otel(2, "llm_response", "trace-A", {
        type: "llm_response",
        payload: {
          "gen_ai.usage.input_tokens": 10,
          "gen_ai.usage.output_tokens": 20,
        },
      }),
      otel(3, "llm_call", "trace-B", { type: "llm_call", payload: {} }),
    ];
    const traces = buildTraces(events);
    expect(traces).toHaveLength(2);
    expect(traces.map((t) => t.traceId).sort()).toEqual(["trace-A", "trace-B"]);
    const a = traces.find((t) => t.traceId === "trace-A")!;
    expect(a.inputTokens).toBe(10);
    expect(a.outputTokens).toBe(20);
  });

  it("no otel_trace_id anywhere → single trace with id `{sessionId}:0`", () => {
    const events = [
      otel(1, "llm_call", undefined, { type: "llm_call", payload: {} }),
      otel(2, "llm_response", undefined, {
        type: "llm_response",
        payload: {
          "gen_ai.usage.input_tokens": 5,
          "gen_ai.usage.output_tokens": 7,
        },
      }),
    ];
    const traces = buildTraces(events);
    expect(traces).toHaveLength(1);
    expect(traces[0].traceId).toBe("sess-otel:0");
    expect(traces[0].inputTokens).toBe(5);
    expect(traces[0].outputTokens).toBe(7);
  });

  it("mixed missing/present otel_trace_id → missing events grouped into their own trace", () => {
    const events = [
      otel(1, "llm_call", "trace-X", { type: "llm_call", payload: {} }),
      otel(2, "llm_call", undefined, { type: "llm_call", payload: {} }),
      otel(3, "llm_call", "trace-X", { type: "llm_call", payload: {} }),
    ];
    const traces = buildTraces(events);
    expect(traces).toHaveLength(2);
    const known = traces.find((t) => t.traceId === "trace-X");
    expect(known).toBeDefined();
    expect(known!.llmCalls).toBe(2);
    const unknown = traces.find((t) => t.traceId !== "trace-X");
    expect(unknown).toBeDefined();
    expect(unknown!.llmCalls).toBe(1);
  });

  it("OTel cost is undefined for v1 even with multiple traces", () => {
    const events = [
      otel(1, "llm_call", "trace-A", { type: "llm_call", payload: {} }),
      otel(2, "llm_call", "trace-B", { type: "llm_call", payload: {} }),
    ];
    const traces = buildTraces(events);
    for (const t of traces) expect(t.cost).toBeUndefined();
  });
});
