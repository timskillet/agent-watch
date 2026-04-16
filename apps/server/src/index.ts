#!/usr/bin/env node

import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createServer } from "./server.js";
import { runInit } from "./init.js";

const args = process.argv.slice(2);

if (args.includes("init")) {
  runInit();
  process.exit(0);
}

const portFlag = args.indexOf("--port");
const port =
  portFlag !== -1 && args[portFlag + 1]
    ? parseInt(args[portFlag + 1], 10)
    : 4318;

const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
const dbDir = join(home, ".agentwatch");
mkdirSync(dbDir, { recursive: true });
const dbPath = join(dbDir, "events.db");

const { shutdown } = await createServer({ port, dbPath });

console.log("");
console.log("  AgentWatch Dev Server");
console.log("  ---------------------");
console.log(`  Server:    http://localhost:${port}`);
console.log("  Dashboard: http://localhost:5173");
console.log(`  Database:  ${dbPath}`);
console.log("");
console.log("  Listening for hook events...");
console.log("  Run 'npx agentwatch-dev init' to configure Claude Code hooks.");
console.log("");

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
