import { useEffect, useState } from "react";
import type { PipelineRunSummary } from "@agentwatch/types";
import { getRuns } from "../../api/client";
import type { WidgetProps } from "../../widgets/types";
import { Skeleton } from "../ui/Skeleton";
import styles from "./StatsSummaryWidget.module.css";

export function StatsSummaryWidget({ isConfigOpen }: WidgetProps) {
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    getRuns({ limit: 500 })
      .then((data) => {
        if (!ignore) {
          setRuns(data);
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
    { label: "Total Runs", value: String(total) },
    {
      label: "Success Rate",
      value: total > 0 ? `${Math.round((completed / total) * 100)}%` : "\u2014",
    },
    {
      label: "Failed",
      value: String(failed),
      danger: failed > 0,
    },
    {
      label: "Avg Duration",
      value:
        avgDuration != null ? `${(avgDuration / 1000).toFixed(1)}s` : "\u2014",
    },
    { label: "Total Events", value: String(totalEvents) },
  ];

  return (
    <div className={styles.grid}>
      {stats.map((s) => (
        <div key={s.label} className={styles.card}>
          <div className={styles.label}>{s.label}</div>
          <div
            className={`${styles.value} ${s.danger ? styles.valueDanger : ""}`}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
