import type { IngestionSource } from "@agentwatch/types";
import type { FastifyReply } from "fastify";

export function toNum(val: string | undefined): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

const VALID_STATUSES = new Set(["running", "completed", "failed"]);
const VALID_SOURCES = new Set(["claude_code_hook", "otlp"]);

export function validateStatus(
  val: string | undefined,
  reply: FastifyReply,
): "running" | "completed" | "failed" | undefined | false {
  if (val == null) return undefined;
  if (!VALID_STATUSES.has(val)) {
    reply.status(400).send({
      error: `Invalid status '${val}'. Must be: running, completed, failed`,
    });
    return false;
  }
  return val as "running" | "completed" | "failed";
}

export function validateIngestionSource(
  val: string | undefined,
  reply: FastifyReply,
): IngestionSource | undefined | false {
  if (val == null) return undefined;
  if (!VALID_SOURCES.has(val)) {
    reply.status(400).send({
      error: `Invalid ingestion_source '${val}'. Must be: claude_code_hook, otlp`,
    });
    return false;
  }
  return val as IngestionSource;
}
