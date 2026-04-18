import type { FastifyInstance, FastifyReply } from "fastify";
import type { PanelQuery } from "@agentwatch/types";
import type { SQLiteEventStore } from "../store.js";
import { toNum } from "./utils.js";

const VALID_METRICS = new Set([
  "session.cost",
  "session.duration",
  "tool.count",
  "tool.duration",
  "tool.failure_rate",
  "token.usage",
]);
const VALID_GROUPBYS = new Set([
  "day",
  "tool_name",
  "command_prefix",
  "session_tag",
]);
const VALID_RANGES = new Set(["7d", "30d", "90d"]);

function validateEnum(
  val: string | undefined,
  set: Set<string>,
  field: string,
  reply: FastifyReply,
): string | undefined | false {
  if (val == null) return undefined;
  if (!set.has(val)) {
    reply.status(400).send({
      error: `Invalid ${field} '${val}'. Must be one of: ${[...set].join(", ")}`,
    });
    return false;
  }
  return val;
}

export function registerPanelsRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  app.get<{ Querystring: Record<string, string | undefined> }>(
    "/api/panels",
    async (req, reply) => {
      const q = req.query;

      const metric = validateEnum(q.metric, VALID_METRICS, "metric", reply);
      if (metric === false) return;
      const groupBy = validateEnum(q.groupBy, VALID_GROUPBYS, "groupBy", reply);
      if (groupBy === false) return;
      const range = validateEnum(q.range, VALID_RANGES, "range", reply);
      if (range === false) return;

      const query: PanelQuery = {
        tool: q.tool,
        metric: metric as PanelQuery["metric"],
        groupBy: groupBy as PanelQuery["groupBy"],
        range: range as PanelQuery["range"],
        limit: toNum(q.limit),
      };
      return reply.send(store.getPanelData(query));
    },
  );
}
