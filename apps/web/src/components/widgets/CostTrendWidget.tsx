import { useEffect, useMemo, useState } from "react";
import type { PanelQuery } from "@agentwatch/types";
import { getPanelData } from "../../api/client";
import type { WidgetProps } from "../../widgets/types";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { AreaChart } from "../../charts/AreaChart";
import styles from "./CostTrendWidget.module.css";

type Range = "7d" | "30d" | "90d";
type Point = { day: string; value: number };

function isRange(v: unknown): v is Range {
  return v === "7d" || v === "30d" || v === "90d";
}

function fillDays(rows: Array<Record<string, unknown>>, range: Range): Point[] {
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 7;
  const byDay = new Map<string, number>();
  for (const r of rows) {
    byDay.set(String(r.day), Number(r.value) || 0);
  }
  const out: Point[] = [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
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
  const range: Range = isRange(config.range) ? config.range : "7d";
  const [loaded, setLoaded] = useState<{ key: string; rows: Point[] } | null>(
    null,
  );

  useEffect(() => {
    let ignore = false;
    const query: PanelQuery = {
      metric: "session.cost",
      groupBy: "day",
      range,
    };
    getPanelData(query).then((result) => {
      if (!ignore)
        setLoaded({ key: range, rows: fillDays(result.rows, range) });
    });
    return () => {
      ignore = true;
    };
  }, [range]);

  const isLoading = loaded == null || loaded.key !== range;
  const data = loaded?.rows ?? null;
  const hasAnyValue = useMemo(
    () => (data ?? []).some((p) => p.value > 0),
    [data],
  );

  if (isConfigOpen) {
    return (
      <div className={styles.configPanel}>
        <label className={styles.configLabel}>
          Range:
          <Select
            value={range}
            onChange={(e) =>
              onConfigChange({ ...config, range: e.target.value })
            }
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </Select>
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
