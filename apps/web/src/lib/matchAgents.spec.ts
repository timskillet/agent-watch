import { describe, it, expect } from "vitest";
import type { AgentRollup } from "@agentwatch/types";
import { matchAgents } from "./matchAgents";

function agent(id: string, overrides: Partial<AgentRollup> = {}): AgentRollup {
  return {
    agentId: id,
    startTime: 0,
    endTime: 100,
    durationMs: 100,
    eventCount: 1,
    toolCallCount: 0,
    llmCallCount: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

describe("matchAgents", () => {
  it("pairs shared agents in A-first order", () => {
    const a = [agent("orch"), agent("researcher")];
    const b = [agent("orch", { eventCount: 5 }), agent("researcher")];
    const matches = matchAgents(a, b);
    expect(matches).toHaveLength(2);
    expect(matches[0].agentId).toBe("orch");
    expect(matches[0].a).toBeDefined();
    expect(matches[0].b?.eventCount).toBe(5);
  });

  it("A-only agent keeps its row with b undefined", () => {
    const a = [agent("orch"), agent("writer")];
    const b = [agent("orch")];
    const matches = matchAgents(a, b);
    expect(matches).toHaveLength(2);
    expect(matches[1].agentId).toBe("writer");
    expect(matches[1].b).toBeUndefined();
  });

  it("B-only agents append after A's rows with a undefined", () => {
    const a = [agent("orch")];
    const b = [agent("orch"), agent("retry-agent")];
    const matches = matchAgents(a, b);
    expect(matches).toHaveLength(2);
    expect(matches[1].agentId).toBe("retry-agent");
    expect(matches[1].a).toBeUndefined();
    expect(matches[1].b).toBeDefined();
  });

  it("empty inputs return empty array", () => {
    expect(matchAgents([], [])).toEqual([]);
  });

  it("preserves position indices", () => {
    const a = [agent("a"), agent("b")];
    const b = [agent("b"), agent("c")];
    const matches = matchAgents(a, b);
    expect(matches.map((m) => m.position)).toEqual([0, 1, 2]);
  });
});
