import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import Fastify from "fastify";
import type { AgentWatchEvent } from "@agentwatch/types";
import { SQLiteEventStore } from "../store.js";
import { registerPanelsRoute } from "../routes/panels.js";

// ---------------------------------------------------------------------------
// Fixture factory — produces events relative to "now" so range filters work
// ---------------------------------------------------------------------------

const NOW = Date.now();
const DAY = 86_400_000;

function makeEvent(overrides: Partial<AgentWatchEvent>): AgentWatchEvent {
  return {
    id: "evt",
    agentId: "a",
    sessionId: "s",
    pipelineId: "r",
    sequence: 1,
    type: "tool_call",
    level: "info",
    timestamp: NOW,
    payload: { "gen_ai.tool.name": "Read" },
    meta: { ingestion_source: "claude_code_hook" },
    ...overrides,
  } as AgentWatchEvent;
}

function seed(store: SQLiteEventStore): void {
  store.insert([
    // --- session_end events spread across 3 recent days ---
    makeEvent({
      id: "se-1",
      sessionId: "sess-1",
      type: "session_end",
      timestamp: NOW - 2 * DAY,
      payload: { totalCost: 1.5, totalTokens: 1000, durationMs: 60_000 },
    }),
    makeEvent({
      id: "se-2",
      sessionId: "sess-2",
      type: "session_end",
      timestamp: NOW - 1 * DAY,
      payload: { totalCost: 2.25, totalTokens: 2500, durationMs: 90_000 },
    }),
    makeEvent({
      id: "se-3",
      sessionId: "sess-3",
      type: "session_end",
      timestamp: NOW - 60_000,
      payload: { totalCost: 0.75, totalTokens: 500, durationMs: 30_000 },
    }),
    // --- old session_end (10 days ago — outside 7d range) ---
    makeEvent({
      id: "se-old",
      sessionId: "sess-old",
      type: "session_end",
      timestamp: NOW - 10 * DAY,
      payload: { totalCost: 99.99, totalTokens: 99999, durationMs: 999_999 },
    }),

    // --- tool calls: Read x3, Edit x2, Bash x1 ---
    makeEvent({
      id: "tc-1",
      type: "tool_call",
      timestamp: NOW - DAY,
      durationMs: 100,
      payload: { "gen_ai.tool.name": "Read" },
    }),
    makeEvent({
      id: "tc-2",
      type: "tool_call",
      timestamp: NOW - DAY + 1000,
      durationMs: 150,
      payload: { "gen_ai.tool.name": "Read" },
    }),
    makeEvent({
      id: "tc-3",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 200,
      payload: { "gen_ai.tool.name": "Read" },
    }),
    makeEvent({
      id: "tc-4",
      type: "tool_call",
      timestamp: NOW - 2 * DAY,
      durationMs: 500,
      payload: { "gen_ai.tool.name": "Edit" },
    }),
    makeEvent({
      id: "tc-5",
      type: "tool_call",
      timestamp: NOW - DAY,
      durationMs: 300,
      payload: { "gen_ai.tool.name": "Edit" },
    }),
    makeEvent({
      id: "tc-6",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 5000,
      payload: { "gen_ai.tool.name": "Bash" },
    }),

    // --- tool errors: one Read error, one Edit error ---
    makeEvent({
      id: "te-1",
      type: "tool_error",
      level: "error",
      timestamp: NOW - DAY + 2000,
      payload: { "gen_ai.tool.name": "Read", error: "boom" },
    }),
    makeEvent({
      id: "te-2",
      type: "tool_error",
      level: "error",
      timestamp: NOW - DAY + 3000,
      payload: { "gen_ai.tool.name": "Edit", error: "boom" },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Store method tests
// ---------------------------------------------------------------------------

describe("EventStore.getPanelData", () => {
  let store: SQLiteEventStore;

  beforeEach(() => {
    store = new SQLiteEventStore(":memory:");
    seed(store);
  });

  afterEach(() => {
    store.close();
  });

  it("session.cost by day returns { day, value } rows sorted ascending", () => {
    const { rows } = store.getPanelData({
      metric: "session.cost",
      groupBy: "day",
      range: "7d",
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]).toHaveProperty("day");
    expect(rows[0]).toHaveProperty("value");
    // Ascending day order
    for (let i = 1; i < rows.length; i++) {
      expect(String(rows[i].day) >= String(rows[i - 1].day)).toBe(true);
    }
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    // Sum of the 3 in-range session_ends (excluding the 10-day-old one)
    expect(total).toBeCloseTo(1.5 + 2.25 + 0.75, 2);
  });

  it("session.duration by day uses AVG", () => {
    const { rows } = store.getPanelData({
      metric: "session.duration",
      groupBy: "day",
      range: "7d",
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(typeof r.value).toBe("number");
      expect(r.value as number).toBeGreaterThan(0);
    }
  });

  it("token.usage by day returns totalTokens sums", () => {
    const { rows } = store.getPanelData({
      metric: "token.usage",
      groupBy: "day",
      range: "7d",
    });
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    expect(total).toBe(1000 + 2500 + 500);
  });

  it("tool.count by tool_name returns { tool, value } sorted desc", () => {
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "tool_name",
      range: "7d",
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ tool: "Read", value: 3 });
    expect(rows[1]).toEqual({ tool: "Edit", value: 2 });
    expect(rows[2]).toEqual({ tool: "Bash", value: 1 });
  });

  it("tool.duration by tool_name sums duration_ms", () => {
    const { rows } = store.getPanelData({
      metric: "tool.duration",
      groupBy: "tool_name",
      range: "7d",
    });
    const byTool = Object.fromEntries(rows.map((r) => [r.tool, r.value]));
    expect(byTool.Read).toBe(100 + 150 + 200);
    expect(byTool.Edit).toBe(500 + 300);
    expect(byTool.Bash).toBe(5000);
  });

  it("tool.failure_rate by tool_name returns calls/errors/value", () => {
    const { rows } = store.getPanelData({
      metric: "tool.failure_rate",
      groupBy: "tool_name",
      range: "7d",
    });
    const byTool = Object.fromEntries(rows.map((r) => [r.tool, r]));
    // Read: 1 error / 3 calls
    expect(byTool.Read.calls).toBe(3);
    expect(byTool.Read.errors).toBe(1);
    expect(byTool.Read.value).toBeCloseTo(1 / 3, 3);
    // Edit: 1 error / 2 calls
    expect(byTool.Edit.calls).toBe(2);
    expect(byTool.Edit.errors).toBe(1);
    expect(byTool.Edit.value).toBe(0.5);
    // Bash: 0 errors / 1 call
    expect(byTool.Bash.errors).toBe(0);
    expect(byTool.Bash.value).toBe(0);
  });

  it("range=7d excludes events older than 7 days", () => {
    const { rows } = store.getPanelData({
      metric: "session.cost",
      groupBy: "day",
      range: "7d",
    });
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    // The 10-day-old 99.99 entry must not contribute
    expect(total).toBeLessThan(10);
  });

  it("range=30d includes the older event", () => {
    const { rows } = store.getPanelData({
      metric: "session.cost",
      groupBy: "day",
      range: "30d",
    });
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    expect(total).toBeCloseTo(1.5 + 2.25 + 0.75 + 99.99, 2);
  });

  it("limit caps the number of rows", () => {
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "tool_name",
      range: "7d",
      limit: 2,
    });
    expect(rows).toHaveLength(2);
  });

  it("returns empty rows for unsupported metric/groupBy combo", () => {
    // session.cost with tool_name grouping doesn't make sense
    const { rows } = store.getPanelData({
      metric: "session.cost",
      groupBy: "tool_name",
      range: "7d",
    });
    expect(rows).toEqual([]);
  });

  it("defaults groupBy based on metric family when not provided", () => {
    const cost = store.getPanelData({ metric: "session.cost", range: "7d" });
    expect(cost.rows.length).toBeGreaterThan(0);
    expect(cost.rows[0]).toHaveProperty("day");

    const count = store.getPanelData({ metric: "tool.count", range: "7d" });
    expect(count.rows.length).toBeGreaterThan(0);
    expect(count.rows[0]).toHaveProperty("tool");
  });
});

// ---------------------------------------------------------------------------
// HTTP route tests
// ---------------------------------------------------------------------------

describe("GET /api/panels", () => {
  let app: ReturnType<typeof Fastify>;
  let store: SQLiteEventStore;

  beforeAll(async () => {
    store = new SQLiteEventStore(":memory:");
    app = Fastify();
    registerPanelsRoute(app, store);
    await app.ready();
    seed(store);
  });

  afterAll(async () => {
    await app.close();
    store.close();
  });

  it("returns 200 with rows for a valid query", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/panels?metric=tool.count&groupBy=tool_name&range=7d",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("rows");
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBe(3);
  });

  it("returns 400 for invalid metric", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/panels?metric=bogus",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Invalid metric/);
  });

  it("returns 400 for invalid groupBy", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/panels?metric=tool.count&groupBy=bogus",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Invalid groupBy/);
  });

  it("returns 400 for invalid range", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/panels?metric=session.cost&range=5d",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Invalid range/);
  });

  it("returns 200 with empty rows when no query params", async () => {
    const res = await app.inject({ method: "GET", url: "/api/panels" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rows: [] });
  });

  it("respects limit query param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/panels?metric=tool.count&groupBy=tool_name&limit=1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toHaveLength(1);
  });
});
