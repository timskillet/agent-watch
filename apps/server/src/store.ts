import Database from "better-sqlite3";
import type {
  AgentWatchEvent,
  EventFilter,
  SessionSummary,
  SessionFilter,
  PipelineRunSummary,
  RunFilter,
  RunDetail,
  RunComparison,
  ProjectSummary,
  PanelQuery,
  PanelResult,
  EventStore,
} from "@agentwatch/types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id                     TEXT PRIMARY KEY,
  agent_id               TEXT NOT NULL,
  session_id             TEXT NOT NULL,
  pipeline_id            TEXT,
  pipeline_definition_id TEXT,
  project_id             TEXT,
  parent_id              TEXT,
  sequence               INTEGER NOT NULL,
  type                   TEXT NOT NULL,
  level                  TEXT NOT NULL,
  timestamp              INTEGER NOT NULL,
  duration_ms            INTEGER,
  payload                TEXT NOT NULL,
  meta                   TEXT,
  ingestion_source       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_tags (
  session_id  TEXT NOT NULL,
  tag         TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'static',
  PRIMARY KEY (session_id, tag)
);

CREATE TABLE IF NOT EXISTS project_configs (
  cwd         TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  loaded_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session    ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_pipeline   ON events(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_proj_def   ON events(pipeline_definition_id);
CREATE INDEX IF NOT EXISTS idx_timestamp  ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_type       ON events(type);
CREATE INDEX IF NOT EXISTS idx_source     ON events(ingestion_source);
`;

interface EventRow {
  id: string;
  agent_id: string;
  session_id: string;
  pipeline_id: string | null;
  pipeline_definition_id: string | null;
  project_id: string | null;
  parent_id: string | null;
  sequence: number;
  type: string;
  level: string;
  timestamp: number;
  duration_ms: number | null;
  payload: string;
  meta: string | null;
  ingestion_source: string;
}

function rowToEvent(row: EventRow): AgentWatchEvent {
  const meta = row.meta ? JSON.parse(row.meta) : undefined;
  return {
    id: row.id,
    agentId: row.agent_id,
    sessionId: row.session_id,
    pipelineId: row.pipeline_id ?? undefined,
    pipelineDefinitionId: row.pipeline_definition_id ?? undefined,
    projectId: row.project_id ?? undefined,
    parentId: row.parent_id ?? undefined,
    sequence: row.sequence,
    type: row.type,
    level: row.level,
    timestamp: row.timestamp,
    durationMs: row.duration_ms ?? undefined,
    payload: JSON.parse(row.payload),
    meta,
  } as AgentWatchEvent;
}

export class SQLiteEventStore implements EventStore {
  private db: Database.Database;
  private insertStmt: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);

    this.insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO events
        (id, agent_id, session_id, pipeline_id, pipeline_definition_id, project_id,
         parent_id, sequence, type, level, timestamp, duration_ms, payload, meta, ingestion_source)
      VALUES
        (@id, @agent_id, @session_id, @pipeline_id, @pipeline_definition_id, @project_id,
         @parent_id, @sequence, @type, @level, @timestamp, @duration_ms, @payload, @meta, @ingestion_source)
    `);
  }

  insert(events: AgentWatchEvent[]): void {
    const run = this.db.transaction((evts: AgentWatchEvent[]) => {
      for (const evt of evts) {
        const meta = evt.meta ? JSON.stringify(evt.meta) : null;
        const ingestionSource = String(evt.meta?.ingestion_source ?? "unknown");

        this.insertStmt.run({
          id: evt.id,
          agent_id: evt.agentId,
          session_id: evt.sessionId,
          pipeline_id: evt.pipelineId ?? null,
          pipeline_definition_id: evt.pipelineDefinitionId ?? null,
          project_id: evt.projectId ?? null,
          parent_id: evt.parentId ?? null,
          sequence: evt.sequence,
          type: evt.type,
          level: evt.level,
          timestamp: evt.timestamp,
          duration_ms: evt.durationMs ?? null,
          payload: JSON.stringify(evt.payload),
          meta,
          ingestion_source: ingestionSource,
        });
      }
    });
    run(events);
  }

  getEvents(filter: EventFilter): AgentWatchEvent[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.sessionId) {
      conditions.push("session_id = @sessionId");
      params.sessionId = filter.sessionId;
    }
    if (filter.agentId) {
      conditions.push("agent_id = @agentId");
      params.agentId = filter.agentId;
    }
    if (filter.pipelineId) {
      conditions.push("pipeline_id = @pipelineId");
      params.pipelineId = filter.pipelineId;
    }
    if (filter.pipelineDefinitionId) {
      conditions.push("pipeline_definition_id = @pipelineDefinitionId");
      params.pipelineDefinitionId = filter.pipelineDefinitionId;
    }
    if (filter.projectId) {
      conditions.push("project_id = @projectId");
      params.projectId = filter.projectId;
    }
    if (filter.ingestionSource) {
      conditions.push("ingestion_source = @ingestionSource");
      params.ingestionSource = filter.ingestionSource;
    }
    if (filter.since) {
      conditions.push("timestamp >= @since");
      params.since = filter.since;
    }
    if (filter.until) {
      conditions.push("timestamp <= @until");
      params.until = filter.until;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let limitOffset = "";
    if (filter.limit != null) {
      limitOffset += " LIMIT @limit";
      params.limit = filter.limit;
    }
    if (filter.offset != null) {
      limitOffset += " OFFSET @offset";
      params.offset = filter.offset;
    }

    const sql = `SELECT * FROM events ${where} ORDER BY timestamp ASC${limitOffset}`;
    const rows = this.db.prepare(sql).all(params) as EventRow[];
    return rows.map(rowToEvent);
  }

  getSessions(_filter: SessionFilter): SessionSummary[] {
    return [];
  }

  getRuns(_filter: RunFilter): PipelineRunSummary[] {
    return [];
  }

  getRunDetail(_pipelineId: string): RunDetail | null {
    return null;
  }

  compareRuns(_a: string, _b: string): RunComparison | null {
    return null;
  }

  getProjectSummaries(): ProjectSummary[] {
    return [];
  }

  getSessionTags(sessionId: string): string[] {
    const rows = this.db
      .prepare("SELECT tag FROM session_tags WHERE session_id = @sessionId")
      .all({ sessionId }) as { tag: string }[];
    return rows.map((r) => r.tag);
  }

  setSessionTags(sessionId: string, tags: string[]): void {
    const run = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM session_tags WHERE session_id = @sessionId")
        .run({ sessionId });
      const insert = this.db.prepare(
        "INSERT INTO session_tags (session_id, tag, source) VALUES (@sessionId, @tag, 'static')",
      );
      for (const tag of tags) {
        insert.run({ sessionId, tag });
      }
    });
    run();
  }

  getPanelData(_query: PanelQuery): PanelResult {
    return { rows: [] };
  }

  close(): void {
    this.db.close();
  }
}
