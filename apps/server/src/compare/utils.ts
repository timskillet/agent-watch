/**
 * Treat missing / non-numeric / NaN values as 0 when summing unknown JSON
 * payload fields. Shared by the run-summary / agent-rollup builders so the
 * coercion rule stays identical across metrics.
 */
export function numOr0(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}
