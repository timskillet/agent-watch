import type { FastifyInstance } from "fastify";
import type { RunFilter, IngestionSource } from "@agentwatch/types";
import type { SQLiteEventStore } from "../store.js";

function toNum(val: string | undefined): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

export function registerRunsRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  // Static route must be registered before parametric
  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/runs/compare",
    async (req, reply) => {
      const { a, b } = req.query;
      if (!a || !b) {
        return reply
          .status(400)
          .send({ error: "Both 'a' and 'b' query parameters are required" });
      }
      const result = store.compareRuns(a, b);
      if (!result) {
        return reply.status(404).send({ error: "One or both runs not found" });
      }
      return reply.send(result);
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/runs",
    async (req, reply) => {
      const q = req.query;
      const filter: RunFilter = {
        pipelineDefinitionId: q.pipelineDefinitionId,
        projectId: q.projectId,
        ingestionSource: q.ingestionSource as IngestionSource | undefined,
        status: q.status as RunFilter["status"],
        since: toNum(q.since),
        until: toNum(q.until),
        limit: toNum(q.limit),
        offset: toNum(q.offset),
      };
      return reply.send(store.getRuns(filter));
    },
  );

  app.get<{ Params: { pipelineId: string } }>(
    "/api/runs/:pipelineId",
    async (req, reply) => {
      const result = store.getRunDetail(req.params.pipelineId);
      if (!result) {
        return reply.status(404).send({ error: "Run not found" });
      }
      return reply.send(result);
    },
  );
}
