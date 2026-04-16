import type { FastifyInstance } from "fastify";
import type { SQLiteEventStore } from "../store.js";

export function registerProjectsRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  app.get("/api/projects", async (_req, reply) => {
    return reply.send(store.getProjectSummaries());
  });
}
