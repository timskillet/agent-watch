import { useEffect, useState } from "react";
import type { PanelQuery } from "@agentwatch/types";
import { getPanelData } from "../../api/client";
import type { WidgetProps } from "../../widgets/types";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { BarChart } from "../../charts/BarChart";
import styles from "./ToolBreakdownWidget.module.css";

type Range = "7d" | "30d" | "90d";
type Metric = "tool.count" | "tool.duration" | "tool.failure_rate";
type Row = { tool: string; value: number };

const METRIC_OPTIONS: Array<{ value: Metric; label: string }> = [
  { value: "tool.count", label: "Count" },
  { value: "tool.duration", label: "Duration" },
  { value: "tool.failure_rate", label: "Failure rate" },
];

function isRange(v: unknown): v is Range {
  return v === "7d" || v === "30d" || v === "90d";
}

function normalizeMetric(v: unknown): Metric {
  // Accept legacy configs that predate the enum extension (count | duration | failure_rate)
  if (v === "count" || v === "duration" || v === "failure_rate") {
    return `tool.${v}` as Metric;
  }
  if (
    v === "tool.count" ||
    v === "tool.duration" ||
    v === "tool.failure_rate"
  ) {
    return v;
  }
  return "tool.count";
}

function formatterFor(metric: Metric): (v: number) => string {
  if (metric === "tool.duration")
    return (v) =>
      v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
  if (metric === "tool.failure_rate") return (v) => `${(v * 100).toFixed(1)}%`;
  return (v) => v.toFixed(0);
}

export function ToolBreakdownWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const range: Range = isRange(config.range) ? config.range : "7d";
  const metric: Metric = normalizeMetric(config.metric);
  const queryKey = `${metric}|${range}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: Row[] } | null>(
    null,
  );

  useEffect(() => {
    let ignore = false;
    const query: PanelQuery = {
      metric,
      groupBy: "tool_name",
      range,
      limit: 20,
    };
    getPanelData(query).then((result) => {
      if (ignore) return;
      const mapped: Row[] = result.rows.map((r) => ({
        tool: String(r.tool ?? ""),
        value: Number(r.value) || 0,
      }));
      setLoaded({ key: queryKey, rows: mapped });
    });
    return () => {
      ignore = true;
    };
  }, [metric, range]);

  const isLoading = loaded == null || loaded.key !== queryKey;
  const rows = loaded?.rows ?? null;

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
        <label className={styles.configLabel}>
          Metric:
          <Select
            value={metric}
            onChange={(e) =>
              onConfigChange({ ...config, metric: e.target.value })
            }
          >
            {METRIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
    );
  }

  if (isLoading || rows == null)
    return <Skeleton variant="block" height={220} />;
  if (rows.length === 0)
    return <EmptyState icon="⚙" message="No tool usage in range" />;

  return (
    <BarChart
      data={rows}
      xKey="value"
      yKey="tool"
      layout="vertical"
      colorBy="category"
      height={240}
      valueFormatter={formatterFor(metric)}
    />
  );
}
