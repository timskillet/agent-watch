import Database from "better-sqlite3";
import type {
  AgentWatchEvent,
  EventFilter,
  SessionSummary,
  SessionFilter,
  PipelineRunSummary,
  RunFilter,
  RunSortKey,
  RunDurationTrends,
  RunDetail,
  RunComparisonResult,
  ProjectSummary,
  PanelQuery,
  PanelResult,
  EventStore,
} from "@agentwatch/types";
import { buildTraces } from "./trace/buildTraces.js";
import { buildComparison } from "./compare/buildComparison.js";

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
  /**
   * Memoises `buildTraces` output by (pipelineId, eventCount). Events are
   * append-only per pipeline, so an unchanged event count implies unchanged
   * trace derivation. Invalidated by `insert()` to keep cache coherence
   * simple — we drop by pipelineId whenever any new event for that pipeline
   * is written.
   */
  private tracesCache = new Map<
    string,
    { eventCount: number; traces: ReturnType<typeof buildTraces> }
  >();

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
    // Invalidate traces cache for every affected pipeline.
    for (const evt of events) {
      if (evt.pipelineId !== undefined) {
        this.tracesCache.delete(evt.pipelineId);
      }
    }
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

    let limitOffset = "";
    if (filter.limit != null) {
      params.limit = filter.limit;
      limitOffset += " LIMIT @limit";
    }
    if (filter.offset != null) {
      params.offset = filter.offset;
      limitOffset += " OFFSET @offset";
    }

    const sql = `SELECT * FROM events ${where} ORDER BY timestamp ASC${limitOffset}`;
    const rows = this.db.prepare(sql).all(params) as EventRow[];
    return rows.map(rowToEvent);
  }

  getSessions(filter: SessionFilter): SessionSummary[] {
    const conditions: string[] = [];
    const havingConditions: string[] = [];
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
      havingConditions.push("MIN(timestamp) >= @since");
      params.since = filter.since;
    }
    if (filter.until) {
      havingConditions.push("MAX(timestamp) <= @until");
      params.until = filter.until;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const having =
      havingConditions.length > 0
        ? `HAVING ${havingConditions.join(" AND ")}`
        : "";
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
      ${having}
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
    const { sql, params } = this.buildRunsQuery(filter, {
      withPagination: true,
    });

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
      cost: number | null;
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
      cost: r.cost ?? undefined,
    }));
  }

  getRunsCount(filter: RunFilter): number {
    const { sql, params } = this.buildRunsQuery(filter, {
      withPagination: false,
      countOnly: true,
    });
    const row = this.db.prepare(sql).get(params) as { total: number };
    return row.total;
  }

  /**
   * Builds the runs CTE query shared by getRuns and getRunsCount. When
   * countOnly is true, returns SELECT COUNT(*) wrapping the same CTE — guaranteeing
   * total count and visible rows always agree on filter semantics.
   */
  private buildRunsQuery(
    filter: RunFilter,
    opts: { withPagination: boolean; countOnly?: boolean },
  ): { sql: string; params: Record<string, unknown> } {
    const innerConditions: string[] = ["pipeline_id IS NOT NULL"];
    const innerHaving: string[] = [];
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
      const sources = Array.isArray(filter.ingestionSource)
        ? filter.ingestionSource
        : [filter.ingestionSource];
      if (sources.length > 0) {
        const placeholders = sources.map((_, i) => `@ingestionSource_${i}`);
        innerConditions.push(
          `ingestion_source IN (${placeholders.join(", ")})`,
        );
        sources.forEach((s, i) => {
          params[`ingestionSource_${i}`] = s;
        });
      }
    }
    if (filter.search) {
      // Substring on pipeline_id OR pipeline_definition_id, case-insensitive.
      // Escape SQLite LIKE metacharacters (%, _) and the escape char (\) itself
      // so that user input like "my_app" matches literal underscore, not any char.
      const escaped = filter.search.replace(/[\\%_]/g, "\\$&");
      innerConditions.push(
        "(pipeline_id LIKE @search ESCAPE '\\' COLLATE NOCASE OR pipeline_definition_id LIKE @search ESCAPE '\\' COLLATE NOCASE)",
      );
      params.search = `%${escaped}%`;
    }
    if (filter.since) {
      innerHaving.push("MIN(timestamp) >= @since");
      params.since = filter.since;
    }
    if (filter.until) {
      innerHaving.push("MAX(timestamp) <= @until");
      params.until = filter.until;
    }

    const innerWhere = `WHERE ${innerConditions.join(" AND ")}`;
    const innerHavingClause =
      innerHaving.length > 0 ? `HAVING ${innerHaving.join(" AND ")}` : "";

    const outerConditions: string[] = [];
    if (filter.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      if (statuses.length > 0) {
        const placeholders = statuses.map((_, i) => `@status_${i}`);
        outerConditions.push(`status IN (${placeholders.join(", ")})`);
        statuses.forEach((s, i) => {
          params[`status_${i}`] = s;
        });
      }
    }
    const outerWhere =
      outerConditions.length > 0
        ? `WHERE ${outerConditions.join(" AND ")}`
        : "";

    const cte = `
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
          MAX(CASE WHEN type = 'session_end' THEN 1 ELSE 0 END) AS has_end,
          MAX(CASE WHEN type = 'session_end' THEN CAST(json_extract(payload, '$.totalCost') AS REAL) END) AS cost
        FROM events
        ${innerWhere}
        GROUP BY pipeline_id
        ${innerHavingClause}
      )
    `;

    if (opts.countOnly) {
      const sql = `${cte}
        SELECT COUNT(*) AS total FROM (
          SELECT
            CASE
              WHEN has_error = 1 THEN 'failed'
              WHEN has_end = 1   THEN 'completed'
              ELSE 'running'
            END AS status
          FROM run_summary
        ) sub
        ${outerWhere}
      `;
      return { sql, params };
    }

    // Whitelist sort keys → SQL columns. Never interpolate user input directly.
    const sortColumns: Record<RunSortKey, string> = {
      startTime: "start_time",
      durationMs: "duration_ms",
      eventCount: "event_count",
      cost: "cost",
      pipelineDefinitionId: "pipeline_definition_id",
      status: "status",
    };
    const sortColumn = sortColumns[filter.sortBy ?? "startTime"];
    const sortDir = filter.sortDir === "asc" ? "ASC" : "DESC";
    // Stable secondary sort by pipeline_id keeps pagination deterministic
    // when the primary sort key has ties.
    const orderBy = `ORDER BY ${sortColumn} ${sortDir} NULLS LAST, pipeline_id ASC`;

    const limitOffset = opts.withPagination
      ? applyPagination(params, filter)
      : "";

    const sql = `${cte}
      SELECT *,
        CASE
          WHEN has_error = 1 THEN 'failed'
          WHEN has_end = 1   THEN 'completed'
          ELSE 'running'
        END AS status
      FROM run_summary
      ${outerWhere}
      ${orderBy}
      ${limitOffset}
    `;
    return { sql, params };
  }

  getRunDurationTrends(
    pipelineDefinitionIds: string[],
    perPipelineLimit: number,
  ): RunDurationTrends {
    const result: RunDurationTrends = {};
    if (pipelineDefinitionIds.length === 0) return result;

    const limit = Math.max(1, Math.min(perPipelineLimit, 100));
    const placeholders = pipelineDefinitionIds.map((_, i) => `@id_${i}`);
    const params: Record<string, unknown> = { limit };
    pipelineDefinitionIds.forEach((id, i) => {
      params[`id_${i}`] = id;
    });

    // Per-run start_time and duration, ranked newest-first within each
    // pipeline_definition_id, then keep the top N per group.
    const sql = `
      WITH per_run AS (
        SELECT
          pipeline_id,
          pipeline_definition_id,
          MIN(timestamp) AS start_time,
          MAX(timestamp) - MIN(timestamp) AS duration_ms
        FROM events
        WHERE pipeline_id IS NOT NULL
          AND pipeline_definition_id IN (${placeholders.join(", ")})
        GROUP BY pipeline_id
      ),
      ranked AS (
        SELECT
          pipeline_definition_id,
          start_time,
          duration_ms,
          ROW_NUMBER() OVER (
            PARTITION BY pipeline_definition_id
            ORDER BY start_time DESC
          ) AS rn
        FROM per_run
      )
      SELECT pipeline_definition_id, start_time, duration_ms
      FROM ranked
      WHERE rn <= @limit
      ORDER BY pipeline_definition_id ASC, start_time ASC
    `;

    interface TrendRow {
      pipeline_definition_id: string;
      start_time: number;
      duration_ms: number;
    }
    const rows = this.db.prepare(sql).all(params) as TrendRow[];
    for (const id of pipelineDefinitionIds) {
      result[id] = [];
    }
    for (const r of rows) {
      result[r.pipeline_definition_id]?.push({
        startTime: r.start_time,
        durationMs: r.duration_ms,
      });
    }
    return result;
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

    const hit = this.tracesCache.get(pipelineId);
    let traces: ReturnType<typeof buildTraces>;
    if (hit !== undefined && hit.eventCount === events.length) {
      traces = hit.traces;
    } else {
      traces = buildTraces(events);
      this.tracesCache.set(pipelineId, {
        eventCount: events.length,
        traces,
      });
    }

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
      traces,
    };
  }

  compareRuns(a: string, b: string): RunComparisonResult | null {
    const runA = this.getRunDetail(a);
    const runB = this.getRunDetail(b);
    if (!runA || !runB) return null;
    return buildComparison(runA, runB);
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

  getPanelData(query: PanelQuery): PanelResult {
    const hasAbsoluteRange =
      typeof query.since === "number" || typeof query.until === "number";

    let since: number;
    let until: number;
    if (hasAbsoluteRange) {
      since = query.since ?? 0;
      until = query.until ?? Date.now();
    } else {
      const rangeStr = query.range ?? "7d";
      const days = rangeStr === "30d" ? 30 : rangeStr === "90d" ? 90 : 7;
      since = Date.now() - days * 86_400_000;
      until = Date.now();
    }

    const limit = Math.min(Math.max(1, query.limit ?? 50), 500);
    const metric = query.metric;
    const groupBy =
      query.groupBy ?? (metric?.startsWith("tool.") ? "tool_name" : "day");

    // Session-level metrics bucketed by day
    if (groupBy === "day" && metric != null) {
      const agg =
        metric === "session.duration"
          ? "AVG(CAST(json_extract(payload, '$.durationMs') AS REAL))"
          : metric === "token.usage"
            ? "SUM(CAST(json_extract(payload, '$.totalTokens') AS REAL))"
            : metric === "session.cost"
              ? "SUM(CAST(json_extract(payload, '$.totalCost') AS REAL))"
              : null;
      if (agg == null) return { rows: [] };

      const sql = `
        SELECT date(timestamp / 1000, 'unixepoch') AS day,
               ${agg} AS value
        FROM events
        WHERE type = 'session_end'
          AND timestamp >= @since AND timestamp <= @until
          AND json_extract(payload, '$.${
            metric === "session.duration"
              ? "durationMs"
              : metric === "token.usage"
                ? "totalTokens"
                : "totalCost"
          }') IS NOT NULL
        GROUP BY day
        ORDER BY day ASC
        LIMIT @limit
      `;
      interface Row {
        day: string;
        value: number | null;
      }
      const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
      return {
        rows: rows.map((r) => ({ day: r.day, value: r.value ?? 0 })),
      };
    }

    // Tool-level metrics grouped by tool_name
    if (groupBy === "tool_name") {
      if (metric === "tool.count") {
        const sql = `
          SELECT json_extract(payload, '$."gen_ai.tool.name"') AS tool,
                 COUNT(*) AS value
          FROM events
          WHERE type = 'tool_call'
            AND timestamp >= @since AND timestamp <= @until
            AND json_extract(payload, '$."gen_ai.tool.name"') IS NOT NULL
          GROUP BY tool
          ORDER BY value DESC
          LIMIT @limit
        `;
        interface Row {
          tool: string;
          value: number;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return { rows: rows.map((r) => ({ tool: r.tool, value: r.value })) };
      }

      if (metric === "tool.duration") {
        const sql = `
          SELECT json_extract(payload, '$."gen_ai.tool.name"') AS tool,
                 SUM(duration_ms) AS value
          FROM events
          WHERE type = 'tool_call'
            AND timestamp >= @since AND timestamp <= @until
            AND duration_ms IS NOT NULL
            AND json_extract(payload, '$."gen_ai.tool.name"') IS NOT NULL
          GROUP BY tool
          ORDER BY value DESC
          LIMIT @limit
        `;
        interface Row {
          tool: string;
          value: number | null;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return {
          rows: rows.map((r) => ({ tool: r.tool, value: r.value ?? 0 })),
        };
      }

      if (metric === "tool.failure_rate") {
        // value = errors / calls, where calls counts tool_call events and errors
        // counts tool_error events. Assumes a failed invocation fires both events;
        // if a data anomaly produces errors > calls we clamp to 1.0 instead of
        // exposing a rate above 100%.
        const sql = `
          WITH calls AS (
            SELECT json_extract(payload, '$."gen_ai.tool.name"') AS tool,
                   COUNT(*) AS n
            FROM events
            WHERE type = 'tool_call'
              AND timestamp >= @since AND timestamp <= @until
              AND json_extract(payload, '$."gen_ai.tool.name"') IS NOT NULL
            GROUP BY tool
          ),
          errs AS (
            SELECT json_extract(payload, '$."gen_ai.tool.name"') AS tool,
                   COUNT(*) AS n
            FROM events
            WHERE type = 'tool_error'
              AND timestamp >= @since AND timestamp <= @until
              AND json_extract(payload, '$."gen_ai.tool.name"') IS NOT NULL
            GROUP BY tool
          )
          SELECT calls.tool AS tool,
                 COALESCE(errs.n, 0) AS errors,
                 calls.n AS calls,
                 MIN(CAST(COALESCE(errs.n, 0) AS REAL) / calls.n, 1.0) AS value
          FROM calls
          LEFT JOIN errs ON errs.tool = calls.tool
          ORDER BY value DESC, calls.n DESC
          LIMIT @limit
        `;
        interface Row {
          tool: string;
          errors: number;
          calls: number;
          value: number;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return {
          rows: rows.map((r) => ({
            tool: r.tool,
            value: r.value,
            calls: r.calls,
            errors: r.errors,
          })),
        };
      }
    }

    // Tool-level metrics grouped by bash_command (Bash tool only)
    // Only tool.* metrics make sense here; others return empty.
    if (groupBy === "bash_command" && metric?.startsWith("tool.")) {
      if (metric === "tool.failure_rate") return { rows: [] };

      // Why: extract the first whitespace-delimited token of $.input.command
      // (the executable name) so we can rank which shell commands are called most
      // often or consume the most time.
      const cmdExpr = `
        lower(
          substr(
            trim(json_extract(payload, '$.input.command')),
            1,
            CASE
              WHEN instr(trim(json_extract(payload, '$.input.command')), ' ') > 0
                THEN instr(trim(json_extract(payload, '$.input.command')), ' ') - 1
              ELSE length(trim(json_extract(payload, '$.input.command')))
            END
          )
        )
      `;

      if (metric === "tool.count") {
        const sql = `
          WITH bash_cmds AS (
            SELECT ${cmdExpr} AS command
            FROM events
            WHERE type = 'tool_call'
              AND timestamp >= @since AND timestamp <= @until
              AND json_extract(payload, '$."gen_ai.tool.name"') = 'Bash'
              AND json_extract(payload, '$.input.command') IS NOT NULL
          )
          SELECT command, COUNT(*) AS value
          FROM bash_cmds
          WHERE command != ''
          GROUP BY command
          ORDER BY value DESC
          LIMIT @limit
        `;
        interface Row {
          command: string;
          value: number;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return {
          rows: rows.map((r) => ({ command: r.command, value: r.value })),
        };
      }

      if (metric === "tool.duration") {
        const sql = `
          WITH bash_cmds AS (
            SELECT ${cmdExpr} AS command,
                   duration_ms
            FROM events
            WHERE type = 'tool_call'
              AND timestamp >= @since AND timestamp <= @until
              AND json_extract(payload, '$."gen_ai.tool.name"') = 'Bash'
              AND json_extract(payload, '$.input.command') IS NOT NULL
              AND duration_ms IS NOT NULL
          )
          SELECT command, SUM(duration_ms) AS value
          FROM bash_cmds
          WHERE command != ''
          GROUP BY command
          ORDER BY value DESC
          LIMIT @limit
        `;
        interface Row {
          command: string;
          value: number | null;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return {
          rows: rows.map((r) => ({ command: r.command, value: r.value ?? 0 })),
        };
      }
    }

    // Tool-level metrics grouped by file_extension (Read/Edit/Write tools only)
    // Only tool.* metrics make sense here; others return empty.
    if (groupBy === "file_extension" && metric?.startsWith("tool.")) {
      if (metric === "tool.failure_rate") return { rows: [] };

      // Why: we use instr(path, '.') to find the first dot in the full path as a
      // proxy for the extension. This is a simplification — it gives the wrong answer
      // for files in hidden directories (e.g. .git/config → ".git/config" instead of
      // no extension) but is acceptable because source files in this codebase do not
      // have dots in their directory names. SQLite has no REVERSE() function so a
      // last-dot approach would require a verbose CTE; the first-dot heuristic is
      // sufficient for the expected data shape.
      const extExpr = `
        CASE
          WHEN json_extract(payload, '$.input.file_path') LIKE '%.%'
            THEN lower(
              substr(
                json_extract(payload, '$.input.file_path'),
                instr(json_extract(payload, '$.input.file_path'), '.')
              )
            )
          ELSE ''
        END
      `;

      if (metric === "tool.count") {
        const sql = `
          WITH ext_rows AS (
            SELECT ${extExpr} AS extension
            FROM events
            WHERE type = 'tool_call'
              AND timestamp >= @since AND timestamp <= @until
              AND json_extract(payload, '$."gen_ai.tool.name"') IN ('Read', 'Edit', 'Write')
              AND json_extract(payload, '$.input.file_path') IS NOT NULL
          )
          SELECT extension, COUNT(*) AS value
          FROM ext_rows
          WHERE extension != ''
          GROUP BY extension
          ORDER BY value DESC
          LIMIT @limit
        `;
        interface Row {
          extension: string;
          value: number;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return {
          rows: rows.map((r) => ({
            extension: r.extension,
            value: r.value,
          })),
        };
      }

      if (metric === "tool.duration") {
        const sql = `
          WITH ext_rows AS (
            SELECT ${extExpr} AS extension,
                   duration_ms
            FROM events
            WHERE type = 'tool_call'
              AND timestamp >= @since AND timestamp <= @until
              AND json_extract(payload, '$."gen_ai.tool.name"') IN ('Read', 'Edit', 'Write')
              AND json_extract(payload, '$.input.file_path') IS NOT NULL
              AND duration_ms IS NOT NULL
          )
          SELECT extension, SUM(duration_ms) AS value
          FROM ext_rows
          WHERE extension != ''
          GROUP BY extension
          ORDER BY value DESC
          LIMIT @limit
        `;
        interface Row {
          extension: string;
          value: number | null;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return {
          rows: rows.map((r) => ({
            extension: r.extension,
            value: r.value ?? 0,
          })),
        };
      }
    }

    // Tool-level metrics grouped by mcp_server (MCP tools matching mcp__{server}__{fn})
    // Only tool.* metrics make sense here; others return empty.
    if (groupBy === "mcp_server" && metric?.startsWith("tool.")) {
      if (metric === "tool.failure_rate") return { rows: [] };

      if (metric === "tool.count") {
        const sql = `
          WITH mcp_rows AS (
            SELECT
              substr(
                json_extract(payload, '$."gen_ai.tool.name"'),
                6,
                instr(substr(json_extract(payload, '$."gen_ai.tool.name"'), 6), '__') - 1
              ) AS server
            FROM events
            WHERE type = 'tool_call'
              AND timestamp >= @since AND timestamp <= @until
              AND json_extract(payload, '$."gen_ai.tool.name"') LIKE 'mcp\\_\\_%\\_\\_%' ESCAPE '\\'
          )
          SELECT server, COUNT(*) AS value
          FROM mcp_rows
          WHERE server != ''
          GROUP BY server
          ORDER BY value DESC
          LIMIT @limit
        `;
        interface Row {
          server: string;
          value: number;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return {
          rows: rows.map((r) => ({ server: r.server, value: r.value })),
        };
      }

      if (metric === "tool.duration") {
        const sql = `
          WITH mcp_rows AS (
            SELECT
              substr(
                json_extract(payload, '$."gen_ai.tool.name"'),
                6,
                instr(substr(json_extract(payload, '$."gen_ai.tool.name"'), 6), '__') - 1
              ) AS server,
              duration_ms
            FROM events
            WHERE type = 'tool_call'
              AND timestamp >= @since AND timestamp <= @until
              AND json_extract(payload, '$."gen_ai.tool.name"') LIKE 'mcp\\_\\_%\\_\\_%' ESCAPE '\\'
              AND duration_ms IS NOT NULL
          )
          SELECT server, SUM(duration_ms) AS value
          FROM mcp_rows
          WHERE server != ''
          GROUP BY server
          ORDER BY value DESC
          LIMIT @limit
        `;
        interface Row {
          server: string;
          value: number | null;
        }
        const rows = this.db.prepare(sql).all({ since, until, limit }) as Row[];
        return {
          rows: rows.map((r) => ({ server: r.server, value: r.value ?? 0 })),
        };
      }
    }

    return { rows: [] };
  }

  upsertProjectConfig(cwd: string, configJson: string, loadedAt: number): void {
    this.db
      .prepare(
        `INSERT INTO project_configs (cwd, config_json, loaded_at)
         VALUES (@cwd, @configJson, @loadedAt)
         ON CONFLICT(cwd) DO UPDATE SET
           config_json = excluded.config_json,
           loaded_at   = excluded.loaded_at`,
      )
      .run({ cwd, configJson, loadedAt });
  }

  getProjectConfig(
    cwd: string,
  ): { cwd: string; configJson: string; loadedAt: number } | null {
    const row = this.db
      .prepare(
        "SELECT cwd, config_json AS configJson, loaded_at AS loadedAt FROM project_configs WHERE cwd = @cwd",
      )
      .get({ cwd }) as
      | { cwd: string; configJson: string; loadedAt: number }
      | undefined;
    return row ?? null;
  }

  close(): void {
    this.db.close();
  }
}
