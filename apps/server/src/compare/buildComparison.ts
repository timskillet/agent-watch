import type {
  RunComparisonResult,
  RunDetail,
  Trace,
  TraceRollup,
} from "@agentwatch/types";
import { buildAgentRollups } from "./buildAgentRollups.js";
import { buildRunSummary } from "./buildRunSummary.js";

/**
 * Pure: compose the compare payload from two pre-loaded run details. Strips
 * per-event slices from traces — drill-down re-fetches them via
 * `GET /api/runs/:pipelineId`.
 */
export function buildComparison(
  a: RunDetail,
  b: RunDetail,
): RunComparisonResult {
  return {
    a: buildRunSummary(a),
    b: buildRunSummary(b),
    agentsA: buildAgentRollups(a),
    agentsB: buildAgentRollups(b),
    tracesA: a.traces.map(stripTraceEvents),
    tracesB: b.traces.map(stripTraceEvents),
  };
}

function stripTraceEvents(trace: Trace): TraceRollup {
  const { events: _events, ...rest } = trace;
  return rest;
}
