import type { FastifyInstance } from "fastify";
import type { SQLiteEventStore } from "../store.js";
import {
  normalizeHookPayload,
  type ClaudeCodeHookPayload,
} from "./normalizer.js";

export function registerHooksRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  app.post<{ Body: ClaudeCodeHookPayload }>("/hooks", async (req, reply) => {
    const body = req.body;

    if (!body || !body.session_id) {
      return reply.status(400).send({ error: "Missing session_id" });
    }

    const event = normalizeHookPayload(body);

    if (event) {
      store.insert([event]);
    }

    return reply.send({ ok: true });
  });
}
