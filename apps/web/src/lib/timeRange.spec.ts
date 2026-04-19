import { describe, it, expect } from "vitest";
import type { TimeRange } from "@agentwatch/types";
import {
  DEFAULT_TIME_RANGE,
  resolveTimeRange,
  formatTimeRangeLabel,
  migrateTimeRange,
  isTimeRange,
} from "./timeRange";

const NOW = 100_000_000_000;

describe("resolveTimeRange", () => {
  it("preset 'all' returns empty object", () => {
    const result = resolveTimeRange({ kind: "preset", value: "all" }, NOW);
    expect(result).toEqual({});
  });

  it("preset '24h' with fixed now returns since = now - 24h and until = now", () => {
    const result = resolveTimeRange({ kind: "preset", value: "24h" }, NOW);
    expect(result).toEqual({
      since: NOW - 24 * 60 * 60_000,
      until: NOW,
    });
  });

  it("preset '15m' with fixed now returns since = now - 15m", () => {
    const result = resolveTimeRange({ kind: "preset", value: "15m" }, NOW);
    expect(result).toEqual({
      since: NOW - 15 * 60_000,
      until: NOW,
    });
  });

  it("custom passes through unchanged; now param is ignored", () => {
    const r: TimeRange = { kind: "custom", since: 111, until: 999 };
    const result = resolveTimeRange(r, NOW);
    expect(result).toEqual({ since: 111, until: 999 });
  });
});

describe("formatTimeRangeLabel", () => {
  it("preset '7d' returns 'Last 7 days'", () => {
    expect(formatTimeRangeLabel({ kind: "preset", value: "7d" })).toBe(
      "Last 7 days",
    );
  });

  it("preset 'all' returns 'All time'", () => {
    expect(formatTimeRangeLabel({ kind: "preset", value: "all" })).toBe(
      "All time",
    );
  });

  it("custom range label contains → arrow and both formatted dates", () => {
    const since = new Date("2024-04-17T12:00:00.000Z").getTime();
    const until = new Date("2024-04-18T12:00:00.000Z").getTime();
    const label = formatTimeRangeLabel({ kind: "custom", since, until });
    expect(label).toContain("→");
    const sinceStr = new Date(since).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const untilStr = new Date(until).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(label).toBe(`${sinceStr} → ${untilStr}`);
  });
});

describe("migrateTimeRange", () => {
  it("passes through a valid preset TimeRange", () => {
    const r: TimeRange = { kind: "preset", value: "7d" };
    expect(migrateTimeRange(r)).toEqual(r);
  });

  it("passes through a valid custom TimeRange", () => {
    const r: TimeRange = { kind: "custom", since: 1, until: 2 };
    expect(migrateTimeRange(r)).toEqual(r);
  });

  it("legacy { since, until } both set → custom TimeRange", () => {
    expect(migrateTimeRange({ since: 123, until: 456 })).toEqual({
      kind: "custom",
      since: 123,
      until: 456,
    });
  });

  it("legacy { since } only (no until) → DEFAULT_TIME_RANGE", () => {
    expect(migrateTimeRange({ since: 123 })).toEqual(DEFAULT_TIME_RANGE);
  });

  it("'7d' string → preset 7d", () => {
    expect(migrateTimeRange("7d")).toEqual({ kind: "preset", value: "7d" });
  });

  it("'30d' string → preset 30d", () => {
    expect(migrateTimeRange("30d")).toEqual({ kind: "preset", value: "30d" });
  });

  it("'90d' string → coerced to preset 30d", () => {
    expect(migrateTimeRange("90d")).toEqual({ kind: "preset", value: "30d" });
  });

  it("null → DEFAULT_TIME_RANGE", () => {
    expect(migrateTimeRange(null)).toEqual(DEFAULT_TIME_RANGE);
  });

  it("array → DEFAULT_TIME_RANGE", () => {
    expect(migrateTimeRange([])).toEqual(DEFAULT_TIME_RANGE);
  });

  it("object with unknown shape → DEFAULT_TIME_RANGE", () => {
    expect(migrateTimeRange({ random: "shape" })).toEqual(DEFAULT_TIME_RANGE);
  });
});

describe("isTimeRange", () => {
  it("valid preset → true", () => {
    expect(isTimeRange({ kind: "preset", value: "24h" })).toBe(true);
  });

  it("valid custom → true", () => {
    expect(isTimeRange({ kind: "custom", since: 0, until: 1 })).toBe(true);
  });

  it("null → false", () => {
    expect(isTimeRange(null)).toBe(false);
  });

  it("missing kind → false", () => {
    expect(isTimeRange({ since: 0, until: 1 })).toBe(false);
  });

  it("unknown kind → false", () => {
    expect(isTimeRange({ kind: "relative", value: "1d" })).toBe(false);
  });
});
