import { describe, it, expect } from "vitest";
import type { Trace } from "@agentwatch/types";
import { buildTraceBars } from "./buildTraceBars";

function mkTrace(over: Partial<Trace> = {}): Trace {
  return {
    traceId: "s:1",
    sessionId: "s",
    index: 1,
    startTime: 1_000,
    endTime: 2_000,
    durationMs: 1_000,
    promptLength: 10,
    toolCounts: {},
    tools: [],
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    errorCount: 0,
    retryCount: 0,
    events: [],
    ...over,
  };
}

describe("buildTraceBars", () => {
  it("returns empty when no traces", () => {
    expect(buildTraceBars([])).toEqual([]);
  });

  it("produces one bar per trace preserving id, start, duration, error flag", () => {
    const bars = buildTraceBars([
      mkTrace({ traceId: "s:1", startTime: 100, durationMs: 500 }),
      mkTrace({
        traceId: "s:2",
        startTime: 600,
        durationMs: 200,
        errorCount: 2,
      }),
    ]);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({
      id: "s:1",
      start: 100,
      duration: 500,
      isError: false,
    });
    expect(bars[1]).toMatchObject({
      id: "s:2",
      start: 600,
      duration: 200,
      isError: true,
    });
  });

  it("uses promptPreview as name when present (truncated past 60 chars)", () => {
    const bars = buildTraceBars([
      mkTrace({ promptPreview: "short prompt" }),
      mkTrace({ promptPreview: "x".repeat(120) }),
    ]);
    expect(bars[0].name).toBe("short prompt");
    expect(bars[1].name).toHaveLength(61); // 60 + ellipsis
    expect(bars[1].name.endsWith("…")).toBe(true);
  });

  it("falls back to `Prompt #N · K chars` when no preview but promptLength > 0", () => {
    const bars = buildTraceBars([
      mkTrace({ index: 3, promptLength: 47, promptPreview: undefined }),
    ]);
    expect(bars[0].name).toBe("Prompt #3 · 47 chars");
  });

  it("falls back to `Trace N` for synthetic preamble (no prompt at all)", () => {
    const bars = buildTraceBars([
      mkTrace({ index: 0, promptLength: 0, promptPreview: undefined }),
    ]);
    expect(bars[0].name).toBe("Trace 0");
  });

  it("zero-duration traces still produce a 1ms-wide bar (visibility floor)", () => {
    const bars = buildTraceBars([mkTrace({ durationMs: 0 })]);
    expect(bars[0].duration).toBe(1);
  });
});
