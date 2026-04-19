import type { TraceRollup } from "@agentwatch/types";

export interface TraceMatch {
  /** Traces of the same `index` or shared OTel trace id between runs. Either side may be undefined. */
  a?: TraceRollup;
  b?: TraceRollup;
  /** `otel_trace_id` when both runs share it; `index` otherwise. */
  matchedBy: "index" | "otel_trace_id";
  /** Stable sort key (the position this row takes in the paired list). */
  position: number;
}

const OTEL_TRACE_ID_RE = /^[0-9a-f]{32}$/i;

function isOtelTraceId(traceId: string): boolean {
  // CC traceIds are `${sessionId}:${index}`; OTel ids are 32 hex chars.
  return OTEL_TRACE_ID_RE.test(traceId);
}

/**
 * Pair two runs' traces for side-by-side comparison.
 *
 * Strategy:
 *   1. If both sides carry OTel trace ids and any id appears in both, match on
 *      that first. (Same agent framework firing the same causal chain twice.)
 *   2. Fall back to positional match by `index` — the common case for two
 *      replays of the same CC session where prompt ordering is stable.
 *
 * Unmatched entries keep their original index position with the other side
 * undefined (→ renders as "not present").
 */
export function matchTraces(a: TraceRollup[], b: TraceRollup[]): TraceMatch[] {
  const otelIdsA = new Set(
    a.filter((t) => isOtelTraceId(t.traceId)).map((t) => t.traceId),
  );
  const sharedOtel = new Set(
    b
      .filter((t) => isOtelTraceId(t.traceId) && otelIdsA.has(t.traceId))
      .map((t) => t.traceId),
  );

  if (sharedOtel.size > 0) {
    return matchByOtelId(a, b, sharedOtel);
  }
  return matchByIndex(a, b);
}

function matchByOtelId(
  a: TraceRollup[],
  b: TraceRollup[],
  shared: Set<string>,
): TraceMatch[] {
  const bById = new Map(b.map((t) => [t.traceId, t]));
  const aUsed = new Set<string>();
  const bUsed = new Set<string>();
  const matches: TraceMatch[] = [];

  // 1. Emit pairs for every shared OTel id, in the order they appear in A.
  for (const ta of a) {
    if (!shared.has(ta.traceId)) continue;
    const tb = bById.get(ta.traceId);
    if (tb === undefined) continue;
    matches.push({
      a: ta,
      b: tb,
      matchedBy: "otel_trace_id",
      position: matches.length,
    });
    aUsed.add(ta.traceId);
    bUsed.add(tb.traceId);
  }

  // 2. Append the unmatched tail of A (side b empty), preserving order.
  for (const ta of a) {
    if (aUsed.has(ta.traceId)) continue;
    matches.push({
      a: ta,
      matchedBy: "otel_trace_id",
      position: matches.length,
    });
  }
  // 3. Then unmatched entries from B.
  for (const tb of b) {
    if (bUsed.has(tb.traceId)) continue;
    matches.push({
      b: tb,
      matchedBy: "otel_trace_id",
      position: matches.length,
    });
  }

  return matches;
}

function matchByIndex(a: TraceRollup[], b: TraceRollup[]): TraceMatch[] {
  const max = Math.max(a.length, b.length);
  const out: TraceMatch[] = [];
  for (let i = 0; i < max; i++) {
    out.push({ a: a[i], b: b[i], matchedBy: "index", position: i });
  }
  return out;
}
