import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SQLiteEventStore } from "../store.js";
import type { AgentWatchEvent } from "@agentwatch/types";

let store: SQLiteEventStore;

beforeEach(() => {
  store = new SQLiteEventStore(":memory:");
});

afterEach(() => {
  store.close();
});

function makeEvent(overrides: Partial<AgentWatchEvent> = {}): AgentWatchEvent {
  return {
    id: "evt-001",
    agentId: "sess-001",
    sessionId: "sess-001",
    pipelineDefinitionId: "my-app",
    pipelineId: "sess-001",
    sequence: 1,
    type: "session_start",
    level: "info",
    timestamp: 1700000000000,
    payload: { cwd: "/app" },
    meta: { ingestion_source: "claude_code_hook" },
    ...overrides,
  } as AgentWatchEvent;
}

describe("SQLiteEventStore", () => {
  describe("schema", () => {
    it("creates events table with all columns", () => {
      const event = makeEvent();
      store.insert([event]);
      const rows = store.getEvents({ sessionId: "sess-001" });
      expect(rows).toHaveLength(1);
    });

    it("creates session_tags table", () => {
      store.setSessionTags("sess-001", ["tag1", "tag2"]);
      const tags = store.getSessionTags("sess-001");
      expect(tags).toContain("tag1");
      expect(tags).toContain("tag2");
    });

    it("creates project_configs table", () => {
      const db = (store as any).db;
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='project_configs'",
        )
        .get();
      expect(result).toBeTruthy();
    });

    it("enables WAL mode", () => {
      const dir = mkdtempSync(join(tmpdir(), "aw-test-"));
      const fileStore = new SQLiteEventStore(join(dir, "test.db"));
      try {
        const db = (fileStore as any).db;
        const result = db.prepare("PRAGMA journal_mode").get() as {
          journal_mode: string;
        };
        expect(result.journal_mode).toBe("wal");
      } finally {
        fileStore.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("insert", () => {
    it("inserts a single event", () => {
      const event = makeEvent();
      store.insert([event]);

      const rows = store.getEvents({ sessionId: "sess-001" });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("evt-001");
      expect(rows[0].type).toBe("session_start");
      expect(rows[0].payload).toEqual({ cwd: "/app" });
      expect(rows[0].meta).toEqual({ ingestion_source: "claude_code_hook" });
    });

    it("inserts multiple events in a batch", () => {
      const events = [
        makeEvent({ id: "evt-001", sequence: 1 }),
        makeEvent({
          id: "evt-002",
          sequence: 2,
          type: "tool_call",
          payload: { "gen_ai.tool.name": "Bash" },
        }),
        makeEvent({
          id: "evt-003",
          sequence: 3,
          type: "tool_result",
          payload: { "gen_ai.tool.name": "Bash" },
        }),
      ];
      store.insert(events);

      const rows = store.getEvents({ sessionId: "sess-001" });
      expect(rows).toHaveLength(3);
    });

    it("stores ingestion_source from meta", () => {
      const event = makeEvent({
        meta: { ingestion_source: "claude_code_hook", extra: "data" },
      });
      store.insert([event]);

      const rows = store.getEvents({ sessionId: "sess-001" });
      expect(rows[0].meta).toMatchObject({
        ingestion_source: "claude_code_hook",
      });
    });

    it("handles events with no optional fields", () => {
      const event = makeEvent({
        pipelineDefinitionId: undefined,
        pipelineId: undefined,
        parentId: undefined,
        durationMs: undefined,
        meta: undefined,
      });
      store.insert([event]);

      const rows = store.getEvents({ sessionId: "sess-001" });
      expect(rows).toHaveLength(1);
    });
  });

  describe("getEvents", () => {
    it("filters by sessionId", () => {
      store.insert([
        makeEvent({ id: "evt-1", sessionId: "sess-A" }),
        makeEvent({ id: "evt-2", sessionId: "sess-B" }),
      ]);

      const rows = store.getEvents({ sessionId: "sess-A" });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("evt-1");
    });

    it("returns events ordered by timestamp", () => {
      store.insert([
        makeEvent({ id: "evt-2", timestamp: 2000, sequence: 2 }),
        makeEvent({ id: "evt-1", timestamp: 1000, sequence: 1 }),
      ]);

      const rows = store.getEvents({ sessionId: "sess-001" });
      expect(rows[0].id).toBe("evt-1");
      expect(rows[1].id).toBe("evt-2");
    });
  });

  describe("session tags", () => {
    it("overwrites tags on repeated set", () => {
      store.setSessionTags("sess-001", ["a", "b"]);
      store.setSessionTags("sess-001", ["c"]);

      const tags = store.getSessionTags("sess-001");
      expect(tags).toEqual(["c"]);
    });

    it("returns empty array for unknown session", () => {
      const tags = store.getSessionTags("nonexistent");
      expect(tags).toEqual([]);
    });
  });
});
