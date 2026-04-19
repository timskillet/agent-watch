import type { TimeRange, TimeRangePreset } from "@agentwatch/types";

export const TIME_RANGE_PRESETS: ReadonlyArray<{
  value: TimeRangePreset;
  label: string;
  durationMs?: number;
}> = [
  { value: "15m", label: "Last 15 minutes", durationMs: 15 * 60_000 },
  { value: "1h", label: "Last hour", durationMs: 60 * 60_000 },
  { value: "4h", label: "Last 4 hours", durationMs: 4 * 60 * 60_000 },
  { value: "24h", label: "Last 24 hours", durationMs: 24 * 60 * 60_000 },
  { value: "7d", label: "Last 7 days", durationMs: 7 * 86_400_000 },
  { value: "30d", label: "Last 30 days", durationMs: 30 * 86_400_000 },
  { value: "all", label: "All time" },
] as const;

export const DEFAULT_TIME_RANGE: TimeRange = { kind: "preset", value: "24h" };

export function resolveTimeRange(
  r: TimeRange,
  now: number = Date.now(),
): { since?: number; until?: number } {
  if (r.kind === "custom") {
    return { since: r.since, until: r.until };
  }
  if (r.value === "all") {
    return {};
  }
  const preset = TIME_RANGE_PRESETS.find((p) => p.value === r.value);
  const durationMs = preset?.durationMs;
  if (durationMs === undefined) {
    return {};
  }
  return { since: now - durationMs, until: now };
}

export function formatTimeRangeLabel(r: TimeRange): string {
  if (r.kind === "preset") {
    return (
      TIME_RANGE_PRESETS.find((p) => p.value === r.value)?.label ?? r.value
    );
  }
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return `${fmt(r.since)} → ${fmt(r.until)}`;
}

export function isTimeRange(v: unknown): v is TimeRange {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return false;
  }
  const obj = v as Record<string, unknown>;
  if (obj["kind"] === "preset") {
    return TIME_RANGE_PRESETS.some((p) => p.value === obj["value"]);
  }
  if (obj["kind"] === "custom") {
    return typeof obj["since"] === "number" && typeof obj["until"] === "number";
  }
  return false;
}

const LEGACY_RANGE_STRINGS = new Set(["7d", "30d"]);

export function migrateTimeRange(raw: unknown): TimeRange {
  if (isTimeRange(raw)) {
    return raw;
  }

  if (raw === "90d") {
    return { kind: "preset", value: "30d" };
  }

  if (typeof raw === "string" && LEGACY_RANGE_STRINGS.has(raw)) {
    return { kind: "preset", value: raw as TimeRangePreset };
  }

  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj["since"] === "number" && typeof obj["until"] === "number") {
      return { kind: "custom", since: obj["since"], until: obj["until"] };
    }
  }

  return DEFAULT_TIME_RANGE;
}
