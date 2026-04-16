import type { FastifyInstance } from "fastify";
import type { SessionFilter } from "@agentwatch/types";
import type { SQLiteEventStore } from "../store.js";
import { toNum, validateIngestionSource } from "./utils.js";

export function registerSessionsRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/sessions",
    async (req, reply) => {
      const q = req.query;
      const ingestionSource = validateIngestionSource(q.ingestionSource, reply);
      if (ingestionSource === false) return;

      const filter: SessionFilter = {
        agentId: q.agentId,
        pipelineId: q.pipelineId,
        pipelineDefinitionId: q.pipelineDefinitionId,
        projectId: q.projectId,
        ingestionSource,
        since: toNum(q.since),
        until: toNum(q.until),
        limit: toNum(q.limit),
        offset: toNum(q.offset),
      };
      return reply.send(store.getSessions(filter));
    },
  );
}
