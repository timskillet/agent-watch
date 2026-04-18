import { useEffect, useMemo, useState } from "react";
import type { PipelineRunSummary } from "@agentwatch/types";
import { getRuns } from "../../api/client";
import type { WidgetProps } from "../../widgets/types";
import { Skeleton } from "../ui/Skeleton";
import { Sparkline } from "../../charts/Sparkline";
import { getSeriesColor } from "../../charts/theme";
import styles from "./StatsSummaryWidget.module.css";

type DayBucket = { day: string; value: number };

const TREND_DAYS = 7;

function buildSparklineSeries(
  runs: PipelineRunSummary[],
): Record<string, DayBucket[]> {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  const days: string[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  interface Agg {
    total: number;
    completed: number;
    failed: number;
    durationSum: number;
    durationCount: number;
    events: number;
  }
  const byDay = new Map<string, Agg>(
    days.map((d) => [
      d,
      {
        total: 0,
        completed: 0,
        failed: 0,
        durationSum: 0,
        durationCount: 0,
        events: 0,
      },
    ]),
  );

  for (const r of runs) {
    const key = new Date(r.startTime).toISOString().slice(0, 10);
    const agg = byDay.get(key);
    if (!agg) continue;
    agg.total += 1;
    if (r.status === "completed") agg.completed += 1;
    if (r.status === "failed") agg.failed += 1;
    if (r.durationMs != null) {
      agg.durationSum += r.durationMs;
      agg.durationCount += 1;
    }
    agg.events += r.eventCount;
  }

  const map = (fn: (a: Agg) => number): DayBucket[] =>
    days.map((d) => ({ day: d, value: fn(byDay.get(d)!) }));

  return {
    total: map((a) => a.total),
    successRate: map((a) => (a.total > 0 ? a.completed / a.total : 0)),
    failed: map((a) => a.failed),
    avgDuration: map((a) =>
      a.durationCount > 0 ? a.durationSum / a.durationCount : 0,
    ),
    events: map((a) => a.events),
  };
}

export function StatsSummaryWidget({ isConfigOpen }: WidgetProps) {
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    getRuns({ limit: 500 })
      .then((res) => {
        if (!ignore) {
          setRuns(res.rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const series = useMemo(() => buildSparklineSeries(runs), [runs]);

  if (isConfigOpen) {
    return (
      <div className={styles.configPanel}>
        Displays aggregate stats from recent runs. No configuration options.
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={styles.skeletonCard}>
            <Skeleton width={60} height={10} />
            <Skeleton width={48} height={20} />
            <Skeleton width="100%" height={24} />
          </div>
        ))}
      </div>
    );
  }

  const total = runs.length;
  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const durations = runs
    .map((r) => r.durationMs)
    .filter((d): d is number => d != null);
  const avgDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
  const totalEvents = runs.reduce((sum, r) => sum + r.eventCount, 0);

  const stats = [
    {
      key: "total",
      label: "Total Runs",
      value: String(total),
      series: series.total,
    },
    {
      key: "successRate",
      label: "Success Rate",
      value: total > 0 ? `${Math.round((completed / total) * 100)}%` : "\u2014",
      series: series.successRate,
    },
    {
      key: "failed",
      label: "Failed",
      value: String(failed),
      danger: failed > 0,
      series: series.failed,
    },
    {
      key: "avgDuration",
      label: "Avg Duration",
      value:
        avgDuration != null ? `${(avgDuration / 1000).toFixed(1)}s` : "\u2014",
      series: series.avgDuration,
    },
    {
      key: "events",
      label: "Total Events",
      value: String(totalEvents),
      series: series.events,
    },
  ];

  return (
    <div className={styles.grid}>
      {stats.map((s, i) => {
        const hasTrend = s.series.some((p) => p.value > 0);
        return (
          <div key={s.key} className={styles.card}>
            <div className={styles.label}>{s.label}</div>
            <div
              className={`${styles.value} ${s.danger ? styles.valueDanger : ""}`}
            >
              {s.value}
            </div>
            <div className={styles.sparkline}>
              {hasTrend && (
                <Sparkline
                  data={s.series}
                  yKey="value"
                  color={getSeriesColor(i)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
