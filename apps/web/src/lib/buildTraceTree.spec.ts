import { describe, it, expect } from "vitest";
import type { AgentWatchEvent } from "@agentwatch/types";
import { buildTraceTree } from "./buildTraceTree";

type EventLike = {
  id: string;
  type: string;
  payload?: unknown;
  [key: string]: unknown;
};

function evt(overrides: EventLike): AgentWatchEvent {
  return {
    agentId: "a",
    sessionId: "s",
    sequence: 0,
    level: "info",
    timestamp: 1_700_000_000_000,
    payload: {},
    ...overrides,
  } as unknown as AgentWatchEvent;
}

function toolCall(
  id: string,
  callId: string,
  toolName: string,
  input: unknown,
  overrides: Partial<EventLike> = {},
): AgentWatchEvent {
  return evt({
    id,
    type: "tool_call",
    payload: {
      "gen_ai.tool.call.id": callId,
      "gen_ai.tool.name": toolName,
      input,
    },
    ...overrides,
  });
}

function toolResult(
  id: string,
  callId: string,
  overrides: Partial<EventLike> = {},
): AgentWatchEvent {
  return evt({
    id,
    type: "tool_result",
    payload: {
      "gen_ai.tool.call.id": callId,
      "gen_ai.tool.name": "Bash",
      output: "ok",
    },
    ...overrides,
  });
}

describe("buildTraceTree — basics", () => {
  it("returns [] for empty events", () => {
    expect(buildTraceTree([])).toEqual([]);
  });

  it("flat events with no parentId all become roots", () => {
    const events = [
      toolCall("a", "c-a", "Bash", { command: "x" }),
      toolCall("b", "c-b", "Read", { file_path: "/y" }),
    ];
    const roots = buildTraceTree(events);
    expect(roots).toHaveLength(2);
    expect(roots.map((r) => r.event.id)).toEqual(["a", "b"]);
    expect(roots.every((r) => r.depth === 0)).toBe(true);
  });

  it("parent chain 3 deep assigns correct depth to each node", () => {
    const root = toolCall("root", "c-root", "Task", {});
    const mid = toolCall(
      "mid",
      "c-mid",
      "Bash",
      { command: "a" },
      {
        parentId: "root",
      },
    );
    const leaf = toolCall(
      "leaf",
      "c-leaf",
      "Bash",
      { command: "b" },
      {
        parentId: "mid",
      },
    );
    const [r] = buildTraceTree([root, mid, leaf]);
    expect(r.depth).toBe(0);
    expect(r.children).toHaveLength(1);
    expect(r.children[0].depth).toBe(1);
    expect(r.children[0].children).toHaveLength(1);
    expect(r.children[0].children[0].depth).toBe(2);
  });

  it("parentId pointing outside event set treats node as root", () => {
    const orphan = toolCall("o", "c-o", "Bash", {}, { parentId: "missing" });
    const roots = buildTraceTree([orphan]);
    expect(roots).toHaveLength(1);
    expect(roots[0].event.id).toBe("o");
  });
});

describe("buildTraceTree — pairing", () => {
  it("tool_call + tool_result paired by call.id: pairedResult set, durationMs computed", () => {
    const call = toolCall(
      "call",
      "c1",
      "Bash",
      { command: "x" },
      {
        timestamp: 1_000,
      },
    );
    const result = toolResult("res", "c1", {
      timestamp: 2_500,
      durationMs: 300,
    });
    const [root] = buildTraceTree([call, result]);
    expect(root.pairedResult?.id).toBe("res");
    // endOfPaired - callStart = (2500 + 300) - 1000 = 1800
    expect(root.durationMs).toBe(1800);
  });

  it("tool_call without matching result: durationMs falls back to call.durationMs", () => {
    const call = toolCall(
      "call",
      "c1",
      "Bash",
      {},
      {
        durationMs: 750,
      },
    );
    const [root] = buildTraceTree([call]);
    expect(root.pairedResult).toBeUndefined();
    expect(root.durationMs).toBe(750);
  });

  it("tool_result / tool_error do NOT become nodes themselves", () => {
    const call = toolCall("call", "c1", "Bash", {});
    const result = toolResult("res", "c1");
    const roots = buildTraceTree([call, result]);
    expect(roots).toHaveLength(1);
    expect(roots[0].event.id).toBe("call");
  });
});

describe("buildTraceTree — retry markers", () => {
  it("2 consecutive siblings, same tool + identical input: second flagged isRetry", () => {
    const a = toolCall("a", "c-a", "Bash", { command: "ls" });
    const b = toolCall("b", "c-b", "Bash", { command: "ls" });
    const [first, second] = buildTraceTree([a, b]);
    expect(first.isRetry).toBe(false);
    expect(second.isRetry).toBe(true);
  });

  it("same tool + different input: neither isRetry", () => {
    const a = toolCall("a", "c-a", "Bash", { command: "ls" });
    const b = toolCall("b", "c-b", "Bash", { command: "pwd" });
    const roots = buildTraceTree([a, b]);
    expect(roots.every((r) => !r.isRetry)).toBe(true);
  });

  it("different tool: never isRetry even with same input", () => {
    const a = toolCall("a", "c-a", "Bash", { command: "ls" });
    const b = toolCall("b", "c-b", "Read", { command: "ls" });
    const roots = buildTraceTree([a, b]);
    expect(roots.every((r) => !r.isRetry)).toBe(true);
  });
});

describe("buildTraceTree — slow-step markers", () => {
  it("4 siblings, one >2× mean duration: that one isSlowStep", () => {
    const mk = (id: string, ms: number) =>
      toolCall(id, `c-${id}`, "Bash", { command: id }, { durationMs: ms });
    const roots = buildTraceTree([
      mk("a", 100),
      mk("b", 120),
      mk("c", 80),
      mk("d", 1000),
    ]);
    const d = roots.find((r) => r.event.id === "d")!;
    expect(d.isSlowStep).toBe(true);
    const others = roots.filter((r) => r.event.id !== "d");
    expect(others.every((r) => !r.isSlowStep)).toBe(true);
  });

  it("only 2 siblings: never flags slow-step (threshold requires 3+)", () => {
    const mk = (id: string, ms: number) =>
      toolCall(id, `c-${id}`, "Bash", { command: id }, { durationMs: ms });
    const roots = buildTraceTree([mk("a", 10), mk("b", 1000)]);
    expect(roots.every((r) => !r.isSlowStep)).toBe(true);
  });

  it("siblings with missing durations don't break the calculation", () => {
    const mk = (id: string, ms?: number) =>
      toolCall(id, `c-${id}`, "Bash", { command: id }, { durationMs: ms });
    const roots = buildTraceTree([
      mk("a", 100),
      mk("b"),
      mk("c", 150),
      mk("d", 800),
    ]);
    expect(roots.find((r) => r.event.id === "d")?.isSlowStep).toBe(true);
  });
});
