import type { FastifyInstance } from "fastify";
import type { SQLiteEventStore } from "../store.js";
import type { ConfigLoader } from "../config/configLoader.js";
import type { ArrivalLogger } from "./arrivalLogger.js";
import {
  normalizeHookPayload,
  type ClaudeCodeHookPayload,
} from "./normalizer.js";

export function registerHooksRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
  configLoader?: ConfigLoader,
  arrivalLogger?: ArrivalLogger,
): void {
  app.post<{ Body: ClaudeCodeHookPayload }>("/hooks", async (req, reply) => {
    const body = req.body;

    if (!body || !body.session_id) {
      return reply.status(400).send({ error: "Missing session_id" });
    }

    arrivalLogger?.hook(
      body.session_id,
      typeof body.cwd === "string" ? body.cwd : undefined,
    );

    // Pre-warm the per-cwd config cache before the sync normalizer runs.
    // `shouldCapturePromptContent` is sync and reads only the cache, so a
    // cold cache would default to "off" on the first event for a new cwd.
    // Swallow load errors (malformed JSON, etc.) so a broken config file in
    // one project doesn't 500 the hooks endpoint.
    if (configLoader && typeof body.cwd === "string") {
      try {
        await configLoader.loadConfigForCwd(body.cwd);
      } catch {
        // Fall through — `shouldCapturePromptContent` will return false.
      }
    }

    const event = normalizeHookPayload(body, {
      shouldCapturePromptContent: configLoader?.shouldCapturePromptContent,
    });

    if (event) {
      store.insert([event]);
    }

    return reply.send({ ok: true });
  });
}
