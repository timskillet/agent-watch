import Fastify from "fastify";
import cors from "@fastify/cors";
import { SQLiteEventStore } from "./store.js";
import { createConfigLoader } from "./config/configLoader.js";
import { registerHooksRoute } from "./ingest/hooks.js";
import { registerOtlpRoute } from "./ingest/otlp.js";
import { registerSessionsRoute } from "./routes/sessions.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerRunsRoute } from "./routes/runs.js";
import { registerProjectsRoute } from "./routes/projects.js";
import { registerPanelsRoute } from "./routes/panels.js";

export interface ServerOptions {
  port: number;
  dbPath: string;
}

export async function createServer(options: ServerOptions) {
  const { port, dbPath } = options;

  const store = new SQLiteEventStore(dbPath);
  const configLoader = createConfigLoader(store);
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: ["http://localhost:5173"],
  });

  registerHooksRoute(app, store, configLoader);
  registerOtlpRoute(app, store);
  registerSessionsRoute(app, store);
  registerEventsRoute(app, store);
  registerRunsRoute(app, store);
  registerProjectsRoute(app, store);
  registerPanelsRoute(app, store);

  const address = await app.listen({ port, host: "127.0.0.1" });

  const shutdown = async () => {
    await app.close();
    store.close();
  };

  return { address, app, store, shutdown };
}
