import Fastify from "fastify";
import cors from "@fastify/cors";
import { SQLiteEventStore } from "./store.js";
import { registerHooksRoute } from "./ingest/hooks.js";

export interface ServerOptions {
  port: number;
  dbPath: string;
}

export async function createServer(options: ServerOptions) {
  const { port, dbPath } = options;

  const store = new SQLiteEventStore(dbPath);
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: ["http://localhost:5173"],
  });

  registerHooksRoute(app, store);

  const address = await app.listen({ port, host: "0.0.0.0" });

  const shutdown = async () => {
    await app.close();
    store.close();
  };

  return { address, app, store, shutdown };
}
