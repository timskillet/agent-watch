import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { SQLiteEventStore } from "../store.js";
import { registerHooksRoute } from "../ingest/hooks.js";
import { createArrivalLogger } from "../ingest/arrivalLogger.js";
import { resetSequences } from "../ingest/sequence.js";
import { resetNormalizerState } from "../ingest/normalizer.js";

let app: ReturnType<typeof Fastify>;
let store: SQLiteEventStore;

beforeAll(async () => {
  store = new SQLiteEventStore(":memory:");
  app = Fastify();
  registerHooksRoute(app, store);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  store.close();
});

beforeEach(() => {
  resetSequences();
  resetNormalizerState();
});

describe("POST /hooks", () => {
  it("accepts a SessionStart payload and stores an event", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        type: "SessionStart",
        session_id: "int-sess-001",
        cwd: "/Users/dev/my-project",
        timestamp: 1700000000000,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const events = store.getEvents({ sessionId: "int-sess-001" });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session_start");
    expect(events[0].pipelineDefinitionId).toBe("my-project");
  });

  it("accepts PreToolUse then PostToolUse and correlates them", async () => {
    await app.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        type: "PreToolUse",
        session_id: "int-sess-002",
        cwd: "/app",
        tool_name: "Bash",
        tool_use_id: "tu_int1",
        timestamp: 1700000010000,
      },
    });

    await app.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        type: "PostToolUse",
        session_id: "int-sess-002",
        cwd: "/app",
        tool_name: "Bash",
        tool_use_id: "tu_int1",
        tool_result: "output",
        duration_ms: 200,
        timestamp: 1700000010200,
      },
    });

    const events = store.getEvents({ sessionId: "int-sess-002" });
    expect(events).toHaveLength(2);

    const toolCall = events.find((e) => e.type === "tool_call");
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult!.parentId).toBe(toolCall!.id);
  });

  it("returns 200 for discarded events but does not store them", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        type: "PermissionRequest",
        session_id: "int-sess-003",
        cwd: "/app",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const events = store.getEvents({ sessionId: "int-sess-003" });
    expect(events).toHaveLength(0);
  });

  it("returns 400 for payloads missing session_id", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        type: "SessionStart",
        cwd: "/app",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("invokes arrivalLogger once per session across multiple events", async () => {
    const lines: string[] = [];
    const arrivalLogger = createArrivalLogger((m) => lines.push(m));
    const localStore = new SQLiteEventStore(":memory:");
    const localApp = Fastify();
    registerHooksRoute(localApp, localStore, undefined, arrivalLogger);
    await localApp.ready();

    for (const event of ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]) {
      await localApp.inject({
        method: "POST",
        url: "/hooks",
        payload: {
          type: event,
          session_id: "arrival-sess",
          cwd: "/Users/dev/arrival-proj",
          tool_name: "Bash",
          tool_use_id: "tu_x",
          timestamp: 1700000100000,
        },
      });
    }

    await localApp.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        type: "SessionStart",
        session_id: "arrival-sess-b",
        cwd: "/Users/dev/other",
      },
    });

    await localApp.close();
    localStore.close();

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("session arrival-sess");
    expect(lines[0]).toContain("project: arrival-proj");
    expect(lines[1]).toContain("session arrival-sess-b");
  });
});
