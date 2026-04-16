import type { FastifyInstance } from "fastify";
import type { SessionFilter, IngestionSource } from "@agentwatch/types";
import type { SQLiteEventStore } from "../store.js";

function toNum(val: string | undefined): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

export function registerSessionsRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/sessions",
    async (req, reply) => {
      const q = req.query;
      const filter: SessionFilter = {
        agentId: q.agentId,
        pipelineId: q.pipelineId,
        pipelineDefinitionId: q.pipelineDefinitionId,
        projectId: q.projectId,
        ingestionSource: q.ingestionSource as IngestionSource | undefined,
        since: toNum(q.since),
        until: toNum(q.until),
        limit: toNum(q.limit),
        offset: toNum(q.offset),
      };
      return reply.send(store.getSessions(filter));
    },
  );
}
