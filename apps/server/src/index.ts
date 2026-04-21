#!/usr/bin/env node

import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createServer } from "./server.js";
import { runInit } from "./init.js";
import { createArrivalLogger } from "./ingest/arrivalLogger.js";

const args = process.argv.slice(2);

if (args.includes("init")) {
  runInit();
  process.exit(0);
}

const portFlag = args.indexOf("--port");
let port = 4318;
if (portFlag !== -1 && args[portFlag + 1]) {
  port = parseInt(args[portFlag + 1], 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${args[portFlag + 1]}. Must be 1-65535.`);
    process.exit(1);
  }
}

const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
const dbDir = join(home, ".agentwatch");
mkdirSync(dbDir, { recursive: true });
const dbPath = join(dbDir, "events.db");

const dashboardPort = parseInt(
  process.env.AGENTWATCH_DASHBOARD_PORT ?? "5173",
  10,
);

const arrivalLogger = createArrivalLogger();
const { shutdown } = await createServer({ port, dbPath, arrivalLogger });

printStartupBanner({
  serverUrl: `http://localhost:${port}`,
  dashboardUrl: `http://localhost:${dashboardPort}`,
  dbPath,
});

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

interface BannerOpts {
  serverUrl: string;
  dashboardUrl: string;
  dbPath: string;
}

function printStartupBanner(opts: BannerOpts): void {
  const lines = [
    "AgentWatch dev server",
    "",
    `Server:    ${opts.serverUrl}`,
    `Dashboard: ${opts.dashboardUrl}`,
    `Database:  ${opts.dbPath}`,
    "",
    "Hooks:     POST /hooks",
    "OTLP:      POST /v1/traces",
    "",
    "Waiting for events...",
  ];

  const padding = 2;
  const width = Math.max(...lines.map((l) => l.length)) + padding * 2;
  const horizontal = "─".repeat(width);
  const pad = (s: string) =>
    " ".repeat(padding) + s + " ".repeat(width - s.length - padding);

  console.log("");
  console.log(`┌${horizontal}┐`);
  for (const line of lines) {
    console.log(`│${pad(line)}│`);
  }
  console.log(`└${horizontal}┘`);
  console.log("");
}
