import { useEffect, useState } from "react";
import type { PipelineRunSummary } from "@agentwatch/types";
import { getRuns } from "../../api/client";
import type { WidgetProps } from "../../widgets/types";

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
      <div style={{ color: "#aaa", fontSize: 12, padding: 4 }}>
        Displays aggregate stats from recent runs. No configuration options.
      </div>
    );
  }

  if (loading)
    return <div style={{ color: "#666", fontSize: 12 }}>Loading...</div>;

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
      color: failed > 0 ? "#f87171" : undefined,
    },
    {
      label: "Avg Duration",
      value:
        avgDuration != null ? `${(avgDuration / 1000).toFixed(1)}s` : "\u2014",
    },
    { label: "Total Events", value: String(totalEvents) },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
        height: "100%",
      }}
    >
      {stats.map((s) => (
        <div key={s.label} style={{ minWidth: 100 }}>
          <div
            style={{
              color: "#888",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {s.label}
          </div>
          <div
            style={{
              color: s.color ?? "#e0e0e0",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
