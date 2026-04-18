import type { FastifyInstance } from "fastify";
import type { RunFilter, RunListResult } from "@agentwatch/types";
import type { SQLiteEventStore } from "../store.js";
import {
  toNum,
  validateStatusList,
  validateIngestionSourceList,
  validateSortBy,
  validateSortDir,
} from "./utils.js";

export function registerRunsRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  // Static routes must be registered before parametric ones
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
    "/api/runs/trends",
    async (req, reply) => {
      const { pipelineDefinitionIds, limit } = req.query;
      if (!pipelineDefinitionIds) {
        return reply.send({ trends: {} });
      }
      const ids = pipelineDefinitionIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        return reply.send({ trends: {} });
      }
      const perPipelineLimit = toNum(limit) ?? 10;
      const trends = store.getRunDurationTrends(ids, perPipelineLimit);
      return reply.send({ trends });
    },
  );

  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/runs",
    async (req, reply) => {
      const q = req.query;
      // status / ingestionSource accept comma-separated lists for multi-select UI
      const status = validateStatusList(q.status, reply);
      if (status === false) return;
      const ingestionSource = validateIngestionSourceList(
        q.ingestionSource,
        reply,
      );
      if (ingestionSource === false) return;
      const sortBy = validateSortBy(q.sortBy, reply);
      if (sortBy === false) return;
      const sortDir = validateSortDir(q.sortDir, reply);
      if (sortDir === false) return;

      const filter: RunFilter = {
        pipelineDefinitionId: q.pipelineDefinitionId,
        projectId: q.projectId,
        ingestionSource,
        status,
        search: q.search,
        sortBy,
        sortDir,
        since: toNum(q.since),
        until: toNum(q.until),
        limit: toNum(q.limit),
        offset: toNum(q.offset),
      };
      const rows = store.getRuns(filter);
      const total = store.getRunsCount(filter);
      const body: RunListResult = { rows, total };
      return reply.send(body);
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
