import { describe, it, expect } from "vitest";
import type { TraceRollup } from "@agentwatch/types";
import { matchTraces } from "./matchTraces";

function ccTrace(sessionId: string, index: number): TraceRollup {
  return {
    traceId: `${sessionId}:${index}`,
    sessionId,
    index,
    startTime: 1000 + index * 100,
    endTime: 1050 + index * 100,
    durationMs: 50,
    promptLength: 0,
    toolCounts: {},
    tools: [],
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    errorCount: 0,
    retryCount: 0,
  };
}

function otelTrace(traceId: string): TraceRollup {
  return {
    traceId,
    sessionId: "sess",
    index: 0,
    startTime: 1000,
    endTime: 1100,
    durationMs: 100,
    promptLength: 0,
    toolCounts: {},
    tools: [],
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    errorCount: 0,
    retryCount: 0,
  };
}

describe("matchTraces", () => {
  it("positional match when trace counts match", () => {
    const a = [ccTrace("A", 1), ccTrace("A", 2)];
    const b = [ccTrace("B", 1), ccTrace("B", 2)];
    const matches = matchTraces(a, b);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.matchedBy === "index")).toBe(true);
    expect(matches[0].a?.index).toBe(1);
    expect(matches[0].b?.index).toBe(1);
  });

  it("pads shorter run with undefined on the missing side", () => {
    const a = [ccTrace("A", 1), ccTrace("A", 2), ccTrace("A", 3)];
    const b = [ccTrace("B", 1)];
    const matches = matchTraces(a, b);
    expect(matches).toHaveLength(3);
    expect(matches[1].a?.index).toBe(2);
    expect(matches[1].b).toBeUndefined();
    expect(matches[2].b).toBeUndefined();
  });

  it("prefers OTel trace id when both sides carry the same hex id", () => {
    const shared = "abcdef0123456789abcdef0123456789";
    const a = [
      otelTrace(shared),
      otelTrace("11111111111111111111111111111111"),
    ];
    const b = [
      otelTrace("22222222222222222222222222222222"),
      otelTrace(shared),
    ];
    const matches = matchTraces(a, b);
    // 1 shared + 1 A-only + 1 B-only
    expect(matches).toHaveLength(3);
    expect(matches[0].matchedBy).toBe("otel_trace_id");
    expect(matches[0].a?.traceId).toBe(shared);
    expect(matches[0].b?.traceId).toBe(shared);
    // Unmatched one-sided rows were not paired via OTel id — `matchedBy`
    // describes the per-row pairing, not the batch strategy.
    expect(matches[1].a?.traceId).toBe("11111111111111111111111111111111");
    expect(matches[1].b).toBeUndefined();
    expect(matches[1].matchedBy).toBe("index");
    expect(matches[2].b?.traceId).toBe("22222222222222222222222222222222");
    expect(matches[2].a).toBeUndefined();
    expect(matches[2].matchedBy).toBe("index");
  });

  it("falls back to index match when OTel ids differ on both sides", () => {
    const a = [otelTrace("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")];
    const b = [otelTrace("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")];
    const matches = matchTraces(a, b);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedBy).toBe("index");
    expect(matches[0].a?.traceId).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(matches[0].b?.traceId).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("CC-style traceIds never trigger OTel matching", () => {
    // Identical sessionId:index strings in both runs — extremely unlikely
    // in practice but contractually must fall through to positional match.
    const a = [ccTrace("shared", 1)];
    const b = [ccTrace("shared", 1)];
    const matches = matchTraces(a, b);
    expect(matches[0].matchedBy).toBe("index");
  });

  it("both empty yields empty array", () => {
    expect(matchTraces([], [])).toEqual([]);
  });
});
