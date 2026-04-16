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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyPagination(
  params: Record<string, unknown>,
  pagination: { limit?: number; offset?: number },
): string {
  const limit = Math.min(pagination.limit ?? 50, 500);
  params.limit = limit;
  let clause = " LIMIT @limit";
  if (pagination.offset != null) {
    params.offset = pagination.offset;
    clause += " OFFSET @offset";
  }
  return clause;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

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
    if (filter.type) {
      if (Array.isArray(filter.type)) {
        const placeholders = filter.type.map((_, i) => `@type_${i}`);
        conditions.push(`type IN (${placeholders.join(", ")})`);
        filter.type.forEach((t, i) => {
          params[`type_${i}`] = t;
        });
      } else {
        conditions.push("type = @type");
        params.type = filter.type;
      }
    }
    if (filter.level) {
      if (Array.isArray(filter.level)) {
        const placeholders = filter.level.map((_, i) => `@level_${i}`);
        conditions.push(`level IN (${placeholders.join(", ")})`);
        filter.level.forEach((l, i) => {
          params[`level_${i}`] = l;
        });
      } else {
        conditions.push("level = @level");
        params.level = filter.level;
      }
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

    const limitOffset = applyPagination(params, filter);

    const sql = `SELECT * FROM events ${where} ORDER BY timestamp ASC${limitOffset}`;
    const rows = this.db.prepare(sql).all(params) as EventRow[];
    return rows.map(rowToEvent);
  }

  getSessions(filter: SessionFilter): SessionSummary[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.pipelineDefinitionId) {
      conditions.push("pipeline_definition_id = @pipelineDefinitionId");
      params.pipelineDefinitionId = filter.pipelineDefinitionId;
    }
    if (filter.projectId) {
      conditions.push("project_id = @projectId");
      params.projectId = filter.projectId;
    }
    if (filter.agentId) {
      conditions.push("agent_id = @agentId");
      params.agentId = filter.agentId;
    }
    if (filter.pipelineId) {
      conditions.push("pipeline_id = @pipelineId");
      params.pipelineId = filter.pipelineId;
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
    const limitOffset = applyPagination(params, filter);

    const sql = `
      SELECT
        session_id,
        MIN(agent_id)               AS agent_id,
        MAX(pipeline_id)            AS pipeline_id,
        MAX(pipeline_definition_id) AS pipeline_definition_id,
        MAX(project_id)             AS project_id,
        COUNT(*)                    AS event_count,
        MIN(timestamp)              AS start_time,
        MAX(timestamp)              AS end_time,
        MAX(timestamp) - MIN(timestamp) AS duration_ms,
        MIN(ingestion_source)       AS ingestion_source
      FROM events
      ${where}
      GROUP BY session_id
      ORDER BY start_time DESC
      ${limitOffset}
    `;

    interface SessionRow {
      session_id: string;
      agent_id: string;
      pipeline_id: string | null;
      pipeline_definition_id: string | null;
      project_id: string | null;
      event_count: number;
      start_time: number;
      end_time: number;
      duration_ms: number;
      ingestion_source: string;
    }

    const rows = this.db.prepare(sql).all(params) as SessionRow[];
    return rows.map((r) => ({
      sessionId: r.session_id,
      agentId: r.agent_id,
      pipelineId: r.pipeline_id ?? undefined,
      pipelineDefinitionId: r.pipeline_definition_id ?? undefined,
      projectId: r.project_id ?? undefined,
      eventCount: r.event_count,
      startTime: r.start_time,
      endTime: r.end_time,
      durationMs: r.duration_ms,
      ingestionSource: r.ingestion_source as SessionSummary["ingestionSource"],
    }));
  }

  getRuns(filter: RunFilter): PipelineRunSummary[] {
    const innerConditions: string[] = ["pipeline_id IS NOT NULL"];
    const params: Record<string, unknown> = {};

    if (filter.pipelineDefinitionId) {
      innerConditions.push("pipeline_definition_id = @pipelineDefinitionId");
      params.pipelineDefinitionId = filter.pipelineDefinitionId;
    }
    if (filter.projectId) {
      innerConditions.push("project_id = @projectId");
      params.projectId = filter.projectId;
    }
    if (filter.ingestionSource) {
      innerConditions.push("ingestion_source = @ingestionSource");
      params.ingestionSource = filter.ingestionSource;
    }
    if (filter.since) {
      innerConditions.push("timestamp >= @since");
      params.since = filter.since;
    }
    if (filter.until) {
      innerConditions.push("timestamp <= @until");
      params.until = filter.until;
    }

    const innerWhere = `WHERE ${innerConditions.join(" AND ")}`;

    const outerConditions: string[] = [];
    if (filter.status) {
      outerConditions.push("status = @status");
      params.status = filter.status;
    }
    const outerWhere =
      outerConditions.length > 0
        ? `WHERE ${outerConditions.join(" AND ")}`
        : "";

    const limitOffset = applyPagination(params, filter);

    const sql = `
      WITH run_summary AS (
        SELECT
          pipeline_id,
          MAX(pipeline_definition_id) AS pipeline_definition_id,
          MAX(project_id)             AS project_id,
          GROUP_CONCAT(DISTINCT agent_id) AS agents,
          COUNT(*)                    AS event_count,
          MIN(timestamp)              AS start_time,
          MAX(timestamp)              AS end_time,
          MAX(timestamp) - MIN(timestamp) AS duration_ms,
          MIN(ingestion_source)       AS ingestion_source,
          MAX(CASE WHEN level = 'error' THEN 1 ELSE 0 END)     AS has_error,
          MAX(CASE WHEN type = 'session_end' THEN 1 ELSE 0 END) AS has_end
        FROM events
        ${innerWhere}
        GROUP BY pipeline_id
      )
      SELECT *,
        CASE
          WHEN has_error = 1 THEN 'failed'
          WHEN has_end = 1   THEN 'completed'
          ELSE 'running'
        END AS status
      FROM run_summary
      ${outerWhere}
      ORDER BY start_time DESC
      ${limitOffset}
    `;

    interface RunRow {
      pipeline_id: string;
      pipeline_definition_id: string | null;
      project_id: string | null;
      agents: string;
      event_count: number;
      start_time: number;
      end_time: number;
      duration_ms: number;
      ingestion_source: string;
      has_error: number;
      has_end: number;
      status: "running" | "completed" | "failed";
    }

    const rows = this.db.prepare(sql).all(params) as RunRow[];
    return rows.map((r) => ({
      pipelineId: r.pipeline_id,
      pipelineDefinitionId: r.pipeline_definition_id ?? undefined,
      projectId: r.project_id ?? undefined,
      agents: r.agents.split(","),
      eventCount: r.event_count,
      startTime: r.start_time,
      endTime: r.end_time,
      durationMs: r.duration_ms,
      status: r.status,
      ingestionSource:
        r.ingestion_source as PipelineRunSummary["ingestionSource"],
    }));
  }

  getRunDetail(pipelineId: string): RunDetail | null {
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE pipeline_id = @pipelineId ORDER BY timestamp ASC",
      )
      .all({ pipelineId }) as EventRow[];

    if (rows.length === 0) return null;

    const events = rows.map(rowToEvent);
    const agents = [...new Set(rows.map((r) => r.agent_id))];
    const startTime = rows[0].timestamp;
    const endTime = rows[rows.length - 1].timestamp;
    const hasError = rows.some((r) => r.level === "error");
    const hasEnd = rows.some((r) => r.type === "session_end");

    return {
      pipelineId,
      pipelineDefinitionId: rows[0].pipeline_definition_id ?? undefined,
      projectId: rows[0].project_id ?? undefined,
      status: hasError ? "failed" : hasEnd ? "completed" : "running",
      startTime,
      endTime,
      durationMs: endTime - startTime,
      agents,
      events,
    };
  }

  compareRuns(a: string, b: string): RunComparison | null {
    const runA = this.getRunDetail(a);
    const runB = this.getRunDetail(b);
    if (!runA || !runB) return null;
    return { a: runA, b: runB };
  }

  getProjectSummaries(): ProjectSummary[] {
    const sql = `
      SELECT
        project_id,
        COUNT(DISTINCT pipeline_definition_id) AS pipeline_definition_count,
        COUNT(DISTINCT pipeline_id)            AS run_count
      FROM events
      WHERE project_id IS NOT NULL
      GROUP BY project_id
      ORDER BY project_id ASC
    `;

    interface ProjectRow {
      project_id: string;
      pipeline_definition_count: number;
      run_count: number;
    }

    const rows = this.db.prepare(sql).all() as ProjectRow[];
    return rows.map((r) => ({
      projectId: r.project_id,
      pipelineDefinitionCount: r.pipeline_definition_count,
      runCount: r.run_count,
    }));
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
