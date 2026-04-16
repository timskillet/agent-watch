import type { FastifyInstance } from "fastify";
import type {
  EventFilter,
  EventType,
  EventLevel,
  IngestionSource,
} from "@agentwatch/types";
import type { SQLiteEventStore } from "../store.js";

function toNum(val: string | undefined): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function splitOrSingle<T extends string>(
  val: string | undefined,
): T | T[] | undefined {
  if (val == null) return undefined;
  const parts = val.split(",").map((s) => s.trim()) as T[];
  return parts.length === 1 ? parts[0] : parts;
}

export function registerEventsRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/events",
    async (req, reply) => {
      const q = req.query;
      const filter: EventFilter = {
        sessionId: q.sessionId,
        agentId: q.agentId,
        pipelineId: q.pipelineId,
        pipelineDefinitionId: q.pipelineDefinitionId,
        projectId: q.projectId,
        ingestionSource: q.ingestionSource as IngestionSource | undefined,
        type: splitOrSingle<EventType>(q.type),
        level: splitOrSingle<EventLevel>(q.level),
        since: toNum(q.since),
        until: toNum(q.until),
        limit: toNum(q.limit),
        offset: toNum(q.offset),
      };
      return reply.send(store.getEvents(filter));
    },
  );
}
