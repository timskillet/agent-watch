import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import type { AgentWatchEvent } from "@agentwatch/types";
import { SQLiteEventStore } from "../store.js";
import { registerSessionsRoute } from "../routes/sessions.js";
import { registerEventsRoute } from "../routes/events.js";
import { registerRunsRoute } from "../routes/runs.js";
import { registerProjectsRoute } from "../routes/projects.js";

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<AgentWatchEvent> = {}): AgentWatchEvent {
  return {
    id: "evt-001",
    agentId: "agent-main",
    sessionId: "sess-A",
    pipelineId: "run-1",
    pipelineDefinitionId: "my-app",
    projectId: "proj-1",
    sequence: 1,
    type: "session_start",
    level: "info",
    timestamp: 1700000000000,
    payload: { cwd: "/app" },
    meta: { ingestion_source: "claude_code_hook" },
    ...overrides,
  } as AgentWatchEvent;
}

/**
 * Seeds 9 events across 3 sessions, 3 runs, 2 projects, 2 pipeline defs,
 * both ingestion sources, and varied statuses (completed, failed, running).
 */
function seedTestData(store: SQLiteEventStore): void {
  store.insert([
    // --- Session A / Run 1 (completed — has session_end) ---
    makeEvent({
      id: "evt-s1-01",
      sessionId: "sess-A",
      pipelineId: "run-1",
      pipelineDefinitionId: "my-app",
      projectId: "proj-1",
      agentId: "agent-main",
      type: "session_start",
      level: "info",
      timestamp: 1700000000000,
      sequence: 1,
      meta: { ingestion_source: "claude_code_hook" },
    }),
    makeEvent({
      id: "evt-s1-02",
      sessionId: "sess-A",
      pipelineId: "run-1",
      pipelineDefinitionId: "my-app",
      projectId: "proj-1",
      agentId: "agent-main",
      type: "tool_call",
      level: "info",
      timestamp: 1700000001000,
      sequence: 2,
      meta: { ingestion_source: "claude_code_hook" },
    }),
    makeEvent({
      id: "evt-s1-03",
      sessionId: "sess-A",
      pipelineId: "run-1",
      pipelineDefinitionId: "my-app",
      projectId: "proj-1",
      agentId: "agent-sub",
      type: "tool_result",
      level: "info",
      timestamp: 1700000002000,
      sequence: 3,
      meta: { ingestion_source: "claude_code_hook" },
    }),
    makeEvent({
      id: "evt-s1-04",
      sessionId: "sess-A",
      pipelineId: "run-1",
      pipelineDefinitionId: "my-app",
      projectId: "proj-1",
      agentId: "agent-main",
      type: "session_end",
      level: "info",
      timestamp: 1700000003000,
      sequence: 4,
      meta: { ingestion_source: "claude_code_hook" },
    }),

    // --- Session B / Run 2 (failed — has error) ---
    makeEvent({
      id: "evt-s2-01",
      sessionId: "sess-B",
      pipelineId: "run-2",
      pipelineDefinitionId: "my-app",
      projectId: "proj-1",
      agentId: "agent-main",
      type: "session_start",
      level: "info",
      timestamp: 1700000010000,
      sequence: 1,
      meta: { ingestion_source: "otlp" },
    }),
    makeEvent({
      id: "evt-s2-02",
      sessionId: "sess-B",
      pipelineId: "run-2",
      pipelineDefinitionId: "my-app",
      projectId: "proj-1",
      agentId: "agent-main",
      type: "llm_call",
      level: "info",
      timestamp: 1700000011000,
      sequence: 2,
      meta: { ingestion_source: "otlp" },
    }),
    makeEvent({
      id: "evt-s2-03",
      sessionId: "sess-B",
      pipelineId: "run-2",
      pipelineDefinitionId: "my-app",
      projectId: "proj-1",
      agentId: "agent-main",
      type: "error",
      level: "error",
      timestamp: 1700000012000,
      sequence: 3,
      meta: { ingestion_source: "otlp" },
    }),

    // --- Session C / Run 3 (running — no end, no error) ---
    makeEvent({
      id: "evt-s3-01",
      sessionId: "sess-C",
      pipelineId: "run-3",
      pipelineDefinitionId: "other-app",
      projectId: "proj-2",
      agentId: "agent-x",
      type: "session_start",
      level: "info",
      timestamp: 1700000020000,
      sequence: 1,
      meta: { ingestion_source: "claude_code_hook" },
    }),
    makeEvent({
      id: "evt-s3-02",
      sessionId: "sess-C",
      pipelineId: "run-3",
      pipelineDefinitionId: "other-app",
      projectId: "proj-2",
      agentId: "agent-x",
      type: "tool_call",
      level: "warn",
      timestamp: 1700000021000,
      sequence: 2,
      meta: { ingestion_source: "claude_code_hook" },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Store method tests
// ---------------------------------------------------------------------------

describe("EventStore query methods", () => {
  let store: SQLiteEventStore;

  beforeEach(() => {
    store = new SQLiteEventStore(":memory:");
    seedTestData(store);
  });

  afterAll(() => {
    store.close();
  });

  // --- getSessions ---

  describe("getSessions", () => {
    it("returns all sessions", () => {
      const sessions = store.getSessions({});
      expect(sessions).toHaveLength(3);
      // Ordered by start_time DESC
      expect(sessions[0].sessionId).toBe("sess-C");
      expect(sessions[1].sessionId).toBe("sess-B");
      expect(sessions[2].sessionId).toBe("sess-A");
    });

    it("includes correct event counts", () => {
      const sessions = store.getSessions({});
      const byId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));
      expect(byId["sess-A"].eventCount).toBe(4);
      expect(byId["sess-B"].eventCount).toBe(3);
      expect(byId["sess-C"].eventCount).toBe(2);
    });

    it("filters by pipelineDefinitionId", () => {
      const sessions = store.getSessions({
        pipelineDefinitionId: "my-app",
      });
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.sessionId).sort()).toEqual([
        "sess-A",
        "sess-B",
      ]);
    });

    it("filters by ingestionSource", () => {
      const sessions = store.getSessions({ ingestionSource: "otlp" });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe("sess-B");
    });

    it("filters by since/until time range", () => {
      const sessions = store.getSessions({
        since: 1700000005000,
        until: 1700000015000,
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe("sess-B");
    });

    it("respects pagination", () => {
      const page1 = store.getSessions({ limit: 1 });
      expect(page1).toHaveLength(1);
      expect(page1[0].sessionId).toBe("sess-C");

      const page2 = store.getSessions({ limit: 1, offset: 1 });
      expect(page2).toHaveLength(1);
      expect(page2[0].sessionId).toBe("sess-B");
    });

    it("returns empty array when no match", () => {
      const sessions = store.getSessions({
        pipelineDefinitionId: "nonexistent",
      });
      expect(sessions).toEqual([]);
    });
  });

  // --- getRuns ---

  describe("getRuns", () => {
    it("returns all runs", () => {
      const runs = store.getRuns({});
      expect(runs).toHaveLength(3);
    });

    it("derives status=completed for run with session_end", () => {
      const runs = store.getRuns({});
      const run1 = runs.find((r) => r.pipelineId === "run-1");
      expect(run1?.status).toBe("completed");
    });

    it("derives status=failed for run with error", () => {
      const runs = store.getRuns({});
      const run2 = runs.find((r) => r.pipelineId === "run-2");
      expect(run2?.status).toBe("failed");
    });

    it("derives status=running for run without end or error", () => {
      const runs = store.getRuns({});
      const run3 = runs.find((r) => r.pipelineId === "run-3");
      expect(run3?.status).toBe("running");
    });

    it("returns correct agents list", () => {
      const runs = store.getRuns({});
      const run1 = runs.find((r) => r.pipelineId === "run-1");
      expect(run1?.agents.sort()).toEqual(["agent-main", "agent-sub"]);
    });

    it("filters by status", () => {
      const failed = store.getRuns({ status: "failed" });
      expect(failed).toHaveLength(1);
      expect(failed[0].pipelineId).toBe("run-2");
    });

    it("filters by pipelineDefinitionId", () => {
      const runs = store.getRuns({ pipelineDefinitionId: "other-app" });
      expect(runs).toHaveLength(1);
      expect(runs[0].pipelineId).toBe("run-3");
    });

    it("respects pagination", () => {
      const page = store.getRuns({ limit: 2 });
      expect(page).toHaveLength(2);
    });
  });

  // --- getRunDetail ---

  describe("getRunDetail", () => {
    it("returns detail for a known run", () => {
      const detail = store.getRunDetail("run-1");
      expect(detail).not.toBeNull();
      expect(detail!.pipelineId).toBe("run-1");
      expect(detail!.agents.sort()).toEqual(["agent-main", "agent-sub"]);
      expect(detail!.events).toHaveLength(4);
      expect(detail!.status).toBe("completed");
    });

    it("returns events ordered by timestamp", () => {
      const detail = store.getRunDetail("run-1")!;
      for (let i = 1; i < detail.events.length; i++) {
        expect(detail.events[i].timestamp).toBeGreaterThanOrEqual(
          detail.events[i - 1].timestamp,
        );
      }
    });

    it("returns null for unknown pipelineId", () => {
      expect(store.getRunDetail("nonexistent")).toBeNull();
    });

    it("calculates durationMs", () => {
      const detail = store.getRunDetail("run-1")!;
      expect(detail.durationMs).toBe(3000);
    });
  });

  // --- compareRuns ---

  describe("compareRuns", () => {
    it("returns both run details", () => {
      const result = store.compareRuns("run-1", "run-2");
      expect(result).not.toBeNull();
      expect(result!.a.pipelineId).toBe("run-1");
      expect(result!.b.pipelineId).toBe("run-2");
    });

    it("returns null if one run does not exist", () => {
      expect(store.compareRuns("run-1", "nonexistent")).toBeNull();
    });

    it("includes events in both runs", () => {
      const result = store.compareRuns("run-1", "run-2")!;
      expect(result.a.events.length).toBeGreaterThan(0);
      expect(result.b.events.length).toBeGreaterThan(0);
    });
  });

  // --- getProjectSummaries ---

  describe("getProjectSummaries", () => {
    it("returns project summaries grouped by projectId", () => {
      const projects = store.getProjectSummaries();
      expect(projects).toHaveLength(2);

      const proj1 = projects.find((p) => p.projectId === "proj-1");
      expect(proj1?.pipelineDefinitionCount).toBe(1);
      expect(proj1?.runCount).toBe(2);

      const proj2 = projects.find((p) => p.projectId === "proj-2");
      expect(proj2?.pipelineDefinitionCount).toBe(1);
      expect(proj2?.runCount).toBe(1);
    });

    it("returns empty array for empty store", () => {
      const emptyStore = new SQLiteEventStore(":memory:");
      expect(emptyStore.getProjectSummaries()).toEqual([]);
      emptyStore.close();
    });
  });

  // --- getEvents array filters ---

  describe("getEvents array filters", () => {
    it("filters by type array", () => {
      const events = store.getEvents({
        type: ["tool_call", "tool_result"],
      });
      expect(events).toHaveLength(3);
      expect(
        events.every((e) => ["tool_call", "tool_result"].includes(e.type)),
      ).toBe(true);
    });

    it("filters by level array", () => {
      const events = store.getEvents({ level: ["error", "warn"] });
      expect(events).toHaveLength(2);
    });

    it("single type string still works", () => {
      const events = store.getEvents({ type: "error" });
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe("evt-s2-03");
    });
  });
});

// ---------------------------------------------------------------------------
// HTTP route tests
// ---------------------------------------------------------------------------

describe("Query API routes", () => {
  let app: ReturnType<typeof Fastify>;
  let store: SQLiteEventStore;

  beforeAll(async () => {
    store = new SQLiteEventStore(":memory:");
    app = Fastify();
    registerSessionsRoute(app, store);
    registerEventsRoute(app, store);
    registerRunsRoute(app, store);
    registerProjectsRoute(app, store);
    await app.ready();
    seedTestData(store);
  });

  afterAll(async () => {
    await app.close();
    store.close();
  });

  // --- Sessions ---

  it("GET /api/sessions returns all sessions", async () => {
    const res = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(3);
    expect(body[0]).toHaveProperty("sessionId");
    expect(body[0]).toHaveProperty("eventCount");
  });

  it("GET /api/sessions filters by ingestionSource", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions?ingestionSource=otlp",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  // --- Events ---

  it("GET /api/events filters by sessionId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events?sessionId=sess-A",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(4);
  });

  it("GET /api/events splits comma-separated type", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events?type=tool_call,tool_result",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
  });

  // --- Runs ---

  it("GET /api/runs returns all runs", async () => {
    const res = await app.inject({ method: "GET", url: "/api/runs" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
  });

  it("GET /api/runs filters by status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/runs?status=completed",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].pipelineId).toBe("run-1");
  });

  it("GET /api/runs/:pipelineId returns run detail", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/runs/run-1",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pipelineId).toBe("run-1");
    expect(body.events).toHaveLength(4);
  });

  it("GET /api/runs/:pipelineId returns 404 for unknown", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/runs/nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/runs/compare returns comparison", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/runs/compare?a=run-1&b=run-2",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.a.pipelineId).toBe("run-1");
    expect(body.b.pipelineId).toBe("run-2");
  });

  it("GET /api/runs/compare returns 404 when run missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/runs/compare?a=run-1&b=missing",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/runs/compare returns 400 without params", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/runs/compare",
    });
    expect(res.statusCode).toBe(400);
  });

  // --- Projects ---

  it("GET /api/projects returns project summaries", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty("projectId");
    expect(body[0]).toHaveProperty("pipelineDefinitionCount");
    expect(body[0]).toHaveProperty("runCount");
  });

  // --- Pagination ---

  it("respects explicit pagination", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions?limit=1&offset=1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it("caps limit at 500", async () => {
    // With only 3 sessions, we can't directly verify the cap,
    // but we can verify the request succeeds without error
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions?limit=9999",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
  });
});
