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

    // --- Bash calls with commands (for bash_command groupBy) ---
    makeEvent({
      id: "bash-1",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 200,
      payload: {
        "gen_ai.tool.name": "Bash",
        input: { command: "git push origin main" },
      },
    }),
    makeEvent({
      id: "bash-2",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 800,
      payload: {
        "gen_ai.tool.name": "Bash",
        input: { command: "pytest tests/" },
      },
    }),
    makeEvent({
      id: "bash-3",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 1500,
      payload: {
        "gen_ai.tool.name": "Bash",
        input: { command: "npm run build" },
      },
    }),

    // --- Read/Edit calls with file_path (for file_extension groupBy) ---
    makeEvent({
      id: "file-1",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 50,
      payload: {
        "gen_ai.tool.name": "Read",
        input: { file_path: "/src/foo.ts" },
      },
    }),
    makeEvent({
      id: "file-2",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 60,
      payload: {
        "gen_ai.tool.name": "Read",
        input: { file_path: "/README.md" },
      },
    }),
    makeEvent({
      id: "file-3",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 70,
      payload: {
        "gen_ai.tool.name": "Edit",
        input: { file_path: "/src/bar.ts" },
      },
    }),

    // --- MCP tool calls (for mcp_server groupBy) ---
    makeEvent({
      id: "mcp-1",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 300,
      payload: { "gen_ai.tool.name": "mcp__playwright__browser_click" },
    }),
    makeEvent({
      id: "mcp-2",
      type: "tool_call",
      timestamp: NOW - 3600_000,
      durationMs: 150,
      payload: { "gen_ai.tool.name": "mcp__fetch__get" },
    }),

    // --- event outside the window used for absolute range tests ---
    makeEvent({
      id: "outside-1",
      type: "tool_call",
      timestamp: NOW - 20 * DAY,
      durationMs: 999,
      payload: {
        "gen_ai.tool.name": "Bash",
        input: { command: "outside command" },
      },
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
    const byTool = Object.fromEntries(rows.map((r) => [r.tool, r.value]));
    // tc-1/2/3 + file-1/2 = 5 Read calls
    expect(byTool.Read).toBe(5);
    // tc-4/5 + file-3 = 3 Edit calls
    expect(byTool.Edit).toBe(3);
    // tc-6 + bash-1/2/3 = 4 Bash calls
    expect(byTool.Bash).toBe(4);
    // Sorted descending
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].value).toBeLessThanOrEqual(rows[i - 1].value as number);
    }
  });

  it("tool.duration by tool_name sums duration_ms", () => {
    const { rows } = store.getPanelData({
      metric: "tool.duration",
      groupBy: "tool_name",
      range: "7d",
    });
    const byTool = Object.fromEntries(rows.map((r) => [r.tool, r.value]));
    // tc-1(100) + tc-2(150) + tc-3(200) + file-1(50) + file-2(60)
    expect(byTool.Read).toBe(100 + 150 + 200 + 50 + 60);
    // tc-4(500) + tc-5(300) + file-3(70)
    expect(byTool.Edit).toBe(500 + 300 + 70);
    // tc-6(5000) + bash-1(200) + bash-2(800) + bash-3(1500)
    expect(byTool.Bash).toBe(5000 + 200 + 800 + 1500);
  });

  it("tool.failure_rate by tool_name returns { tool, value, calls, errors }", () => {
    const { rows } = store.getPanelData({
      metric: "tool.failure_rate",
      groupBy: "tool_name",
      range: "7d",
    });
    const byTool = Object.fromEntries(rows.map((r) => [r.tool, r]));
    // Read: 1 error / 5 calls (tc-1/2/3 + file-1/2)
    expect(byTool.Read.calls).toBe(5);
    expect(byTool.Read.errors).toBe(1);
    expect(byTool.Read.value).toBeCloseTo(1 / 5, 3);
    // Edit: 1 error / 3 calls (tc-4/5 + file-3)
    expect(byTool.Edit.calls).toBe(3);
    expect(byTool.Edit.errors).toBe(1);
    expect(byTool.Edit.value).toBeCloseTo(1 / 3, 3);
    // Bash: 0 errors / 4 calls
    expect(byTool.Bash.calls).toBe(4);
    expect(byTool.Bash.errors).toBe(0);
    expect(byTool.Bash.value).toBe(0);
    // All rows have calls, errors, and value fields
    for (const r of rows) {
      expect(r).toHaveProperty("calls");
      expect(r).toHaveProperty("errors");
      expect(r).toHaveProperty("value");
    }
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

  it("negative limit is clamped to at least 1 (does not bypass the 500 cap)", () => {
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "tool_name",
      range: "7d",
      limit: -1,
    });
    expect(rows).toHaveLength(1);
  });

  it("zero limit is clamped up (returns at least 1 row)", () => {
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "tool_name",
      range: "7d",
      limit: 0,
    });
    expect(rows).toHaveLength(1);
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
// bash_command groupBy tests
// ---------------------------------------------------------------------------

describe("EventStore.getPanelData — bash_command groupBy", () => {
  let store: SQLiteEventStore;

  beforeEach(() => {
    store = new SQLiteEventStore(":memory:");
    seed(store);
  });

  afterEach(() => {
    store.close();
  });

  it("tool.count returns first token of command, lowercased, ordered by count desc", () => {
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "bash_command",
      range: "7d",
    });
    const commands = rows.map((r) => r.command);
    // Each of git, pytest, npm appear exactly once in the seed
    expect(commands).toContain("git");
    expect(commands).toContain("pytest");
    expect(commands).toContain("npm");
    // Values are all 1; the existing Bash tool_call (tc-6) has no input.command so is excluded
    for (const r of rows) {
      expect(r.value).toBeGreaterThanOrEqual(1);
    }
  });

  it("tool.duration sums duration_ms per command", () => {
    const { rows } = store.getPanelData({
      metric: "tool.duration",
      groupBy: "bash_command",
      range: "7d",
    });
    const byCmd = Object.fromEntries(rows.map((r) => [r.command, r.value]));
    expect(byCmd.git).toBe(200);
    expect(byCmd.pytest).toBe(800);
    expect(byCmd.npm).toBe(1500);
  });

  it("tool.failure_rate returns empty rows (not yet supported)", () => {
    const { rows } = store.getPanelData({
      metric: "tool.failure_rate",
      groupBy: "bash_command",
      range: "7d",
    });
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// file_extension groupBy tests
// ---------------------------------------------------------------------------

describe("EventStore.getPanelData — file_extension groupBy", () => {
  let store: SQLiteEventStore;

  beforeEach(() => {
    store = new SQLiteEventStore(":memory:");
    seed(store);
  });

  afterEach(() => {
    store.close();
  });

  it("tool.count returns extensions with dot, lowercased, ordered by count desc", () => {
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "file_extension",
      range: "7d",
    });
    const exts = rows.map((r) => r.extension);
    // Two .ts files (foo.ts + bar.ts), one .md file (README.md)
    expect(exts).toContain(".ts");
    expect(exts).toContain(".md");
    const byExt = Object.fromEntries(rows.map((r) => [r.extension, r.value]));
    expect(byExt[".ts"]).toBe(2);
    expect(byExt[".md"]).toBe(1);
    // Non-file tools (Bash without file_path, MCP) must not appear
    expect(exts).not.toContain("");
  });

  it("tool.failure_rate returns empty rows (not yet supported)", () => {
    const { rows } = store.getPanelData({
      metric: "tool.failure_rate",
      groupBy: "file_extension",
      range: "7d",
    });
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mcp_server groupBy tests
// ---------------------------------------------------------------------------

describe("EventStore.getPanelData — mcp_server groupBy", () => {
  let store: SQLiteEventStore;

  beforeEach(() => {
    store = new SQLiteEventStore(":memory:");
    seed(store);
  });

  afterEach(() => {
    store.close();
  });

  it("tool.count extracts server segment from mcp__{server}__{fn}", () => {
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "mcp_server",
      range: "7d",
    });
    const servers = rows.map((r) => r.server);
    expect(servers).toContain("playwright");
    expect(servers).toContain("fetch");
    for (const r of rows) {
      expect(r.value).toBe(1);
    }
  });

  it("tool.failure_rate returns empty rows (not yet supported)", () => {
    const { rows } = store.getPanelData({
      metric: "tool.failure_rate",
      groupBy: "mcp_server",
      range: "7d",
    });
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Absolute since/until range tests
// ---------------------------------------------------------------------------

describe("EventStore.getPanelData — absolute since/until range", () => {
  let store: SQLiteEventStore;

  beforeEach(() => {
    store = new SQLiteEventStore(":memory:");
    seed(store);
  });

  afterEach(() => {
    store.close();
  });

  it("since/until bounds exclude events outside the window", () => {
    // Window: last 2 hours only — the outside-1 event (20 days ago) must be excluded.
    const windowSince = NOW - 2 * 3600_000;
    const windowUntil = NOW;
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "tool_name",
      since: windowSince,
      until: windowUntil,
    });
    // The outside-1 event has no "gen_ai.tool.name" issue but its timestamp is 20d ago
    // Verify total count is less than what a 7d query would return
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    // Only events within the last 2h count; the 20-day-old event must not contribute
    const sevenDayRows = store.getPanelData({
      metric: "tool.count",
      groupBy: "tool_name",
      range: "7d",
    });
    const sevenDayTotal = sevenDayRows.rows.reduce(
      (s, r) => s + Number(r.value),
      0,
    );
    expect(total).toBeLessThan(sevenDayTotal);
  });

  it("since/until takes precedence over range param", () => {
    // Use a narrow window that excludes all seeded events older than 1 hour
    const windowSince = NOW - 3600_000 - 1000;
    const windowUntil = NOW;
    const { rows } = store.getPanelData({
      metric: "tool.count",
      groupBy: "tool_name",
      range: "90d", // would include everything if range were used
      since: windowSince,
      until: windowUntil,
    });
    // Events at NOW - 3600_000: tc-3 (Read), tc-6 (Bash), bash-1/2/3, file-1/2/3, mcp-1/2
    // All have timestamp = NOW - 3600_000 which is >= windowSince
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    expect(total).toBeGreaterThan(0);
    // The 10-day-old session_end and the 20-day-old outside-1 must not count
    // (they would contribute if range=90d were used instead of since/until)
    const ninetyDayRows = store.getPanelData({
      metric: "tool.count",
      groupBy: "tool_name",
      range: "90d",
    });
    const ninetyDayTotal = ninetyDayRows.rows.reduce(
      (s, r) => s + Number(r.value),
      0,
    );
    expect(total).toBeLessThan(ninetyDayTotal);
  });

  it("until excludes events timestamped after the upper bound", () => {
    // Set until to 2 days ago so recent events are excluded
    const windowUntil = NOW - 2 * DAY - 1;
    const { rows } = store.getPanelData({
      metric: "session.cost",
      groupBy: "day",
      since: 0,
      until: windowUntil,
    });
    // Only the 10-day-old session_end (se-old) and the 2-day-old (se-1) should be within bounds
    // se-1 is at NOW - 2 * DAY, windowUntil is NOW - 2 * DAY - 1, so se-1 is also excluded
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    expect(total).toBeCloseTo(99.99, 2);
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
    expect(body.rows.length).toBeGreaterThan(0);
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
