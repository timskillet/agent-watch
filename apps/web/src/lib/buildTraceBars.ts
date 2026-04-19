import type { Trace } from "@agentwatch/types";

export interface TraceBar {
  id: string;
  trace: Trace;
  name: string;
  start: number;
  duration: number;
  isError: boolean;
}

function barName(trace: Trace): string {
  if (trace.promptPreview !== undefined && trace.promptPreview.length > 0) {
    return trace.promptPreview.length > 60
      ? trace.promptPreview.slice(0, 60) + "…"
      : trace.promptPreview;
  }
  if (trace.promptLength > 0) {
    return `Prompt #${trace.index} · ${trace.promptLength} chars`;
  }
  return `Trace ${trace.index}`;
}

/**
 * One bar per trace for the "collapse to traces" waterfall mode. Pure.
 */
export function buildTraceBars(traces: Trace[]): TraceBar[] {
  return traces.map((trace) => ({
    id: trace.traceId,
    trace,
    name: barName(trace),
    start: trace.startTime,
    duration: Math.max(trace.durationMs, 1),
    isError: trace.errorCount > 0,
  }));
}
