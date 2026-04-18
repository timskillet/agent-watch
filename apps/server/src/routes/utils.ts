import type {
  IngestionSource,
  RunStatus,
  RunSortKey,
  RunSortDir,
} from "@agentwatch/types";
import type { FastifyReply } from "fastify";

export function toNum(val: string | undefined): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

const VALID_STATUSES = new Set<RunStatus>(["running", "completed", "failed"]);
const VALID_SOURCES = new Set<IngestionSource>(["claude_code_hook", "otlp"]);
const VALID_SORT_KEYS = new Set<RunSortKey>([
  "startTime",
  "durationMs",
  "eventCount",
  "cost",
  "pipelineDefinitionId",
  "status",
]);

export function validateStatus(
  val: string | undefined,
  reply: FastifyReply,
): RunStatus | undefined | false {
  if (val == null) return undefined;
  if (!VALID_STATUSES.has(val as RunStatus)) {
    reply.status(400).send({
      error: `Invalid status '${val}'. Must be: running, completed, failed`,
    });
    return false;
  }
  return val as RunStatus;
}

export function validateIngestionSource(
  val: string | undefined,
  reply: FastifyReply,
): IngestionSource | undefined | false {
  if (val == null) return undefined;
  if (!VALID_SOURCES.has(val as IngestionSource)) {
    reply.status(400).send({
      error: `Invalid ingestion_source '${val}'. Must be: claude_code_hook, otlp`,
    });
    return false;
  }
  return val as IngestionSource;
}

/**
 * Parses a comma-separated list of statuses (e.g. "completed,failed"). Returns
 * undefined when the param is absent. Validates every entry and short-circuits
 * with a 400 + `false` on the first invalid value.
 */
export function validateStatusList(
  val: string | undefined,
  reply: FastifyReply,
): RunStatus[] | undefined | false {
  if (val == null) return undefined;
  const parts = val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (!VALID_STATUSES.has(p as RunStatus)) {
      reply.status(400).send({
        error: `Invalid status '${p}'. Must be: running, completed, failed`,
      });
      return false;
    }
  }
  return parts as RunStatus[];
}

export function validateIngestionSourceList(
  val: string | undefined,
  reply: FastifyReply,
): IngestionSource[] | undefined | false {
  if (val == null) return undefined;
  const parts = val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (!VALID_SOURCES.has(p as IngestionSource)) {
      reply.status(400).send({
        error: `Invalid ingestion_source '${p}'. Must be: claude_code_hook, otlp`,
      });
      return false;
    }
  }
  return parts as IngestionSource[];
}

export function validateSortBy(
  val: string | undefined,
  reply: FastifyReply,
): RunSortKey | undefined | false {
  if (val == null) return undefined;
  if (!VALID_SORT_KEYS.has(val as RunSortKey)) {
    reply.status(400).send({
      error: `Invalid sortBy '${val}'. Must be one of: ${[...VALID_SORT_KEYS].join(", ")}`,
    });
    return false;
  }
  return val as RunSortKey;
}

export function validateSortDir(
  val: string | undefined,
  reply: FastifyReply,
): RunSortDir | undefined | false {
  if (val == null) return undefined;
  if (val !== "asc" && val !== "desc") {
    reply.status(400).send({
      error: `Invalid sortDir '${val}'. Must be: asc, desc`,
    });
    return false;
  }
  return val;
}
