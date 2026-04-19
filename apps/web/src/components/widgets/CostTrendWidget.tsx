import { useEffect, useMemo, useState } from "react";
import type { PanelQuery, TimeRange } from "@agentwatch/types";
import { getPanelData } from "../../api/client";
import type { WidgetProps } from "../../widgets/types";
import { TimeRangePicker } from "../ui/TimeRangePicker";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { AreaChart } from "../../charts/AreaChart";
import { migrateTimeRange, resolveTimeRange } from "../../lib/timeRange";
import styles from "./CostTrendWidget.module.css";

type Point = { day: string; value: number };

function fillDays(
  rows: Array<Record<string, unknown>>,
  since: number | undefined,
  until: number | undefined,
): Point[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(String(r.day), Number(r.value) || 0);
  const end = until != null ? new Date(until) : new Date();
  end.setUTCHours(0, 0, 0, 0);
  const startTs = since ?? end.getTime() - 6 * 86_400_000;
  const start = new Date(startTs);
  start.setUTCHours(0, 0, 0, 0);
  const out: Point[] = [];
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, value: byDay.get(key) ?? 0 });
  }
  return out;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CostTrendWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const cfg = useMemo(
    () => ({ range: migrateTimeRange(config.range) as TimeRange }),
    [config.range],
  );
  const { since, until } = resolveTimeRange(cfg.range);

  const key = useMemo(
    () => JSON.stringify(cfg.range) + ":" + JSON.stringify({ since, until }),
    [cfg.range, since, until],
  );

  const [loaded, setLoaded] = useState<{ key: string; rows: Point[] } | null>(
    null,
  );

  useEffect(() => {
    let ignore = false;
    const query: PanelQuery = {
      metric: "session.cost",
      groupBy: "day",
      since,
      until,
    };
    getPanelData(query).then((result) => {
      if (!ignore)
        setLoaded({ key, rows: fillDays(result.rows, since, until) });
    });
    return () => {
      ignore = true;
    };
  }, [key, since, until]);

  const isLoading = loaded == null || loaded.key !== key;
  const data = loaded?.rows ?? null;
  const hasAnyValue = useMemo(
    () => (data ?? []).some((p) => p.value > 0),
    [data],
  );

  if (isConfigOpen) {
    return (
      <div className={styles.configPanel}>
        <label className={styles.configLabel}>
          Range
          <TimeRangePicker
            value={cfg.range}
            onChange={(range) => onConfigChange({ ...config, range })}
            size="sm"
          />
        </label>
      </div>
    );
  }

  if (isLoading || data == null)
    return <Skeleton variant="block" height={200} />;
  if (!hasAnyValue)
    return <EmptyState icon="$" message="No cost data in range" />;

  return (
    <AreaChart
      data={data}
      xKey="day"
      yKey="value"
      height={220}
      valueFormatter={(v) => `$${v.toFixed(2)}`}
      xFormatter={formatShortDate}
    />
  );
}
