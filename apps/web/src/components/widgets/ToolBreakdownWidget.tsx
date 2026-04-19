import { useEffect, useState } from "react";
import type { PanelQuery } from "@agentwatch/types";
import type { TimeRange } from "@agentwatch/types";
import { getPanelData } from "../../api/client";
import type { WidgetProps } from "../../widgets/types";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { Checkbox } from "../ui/Checkbox";
import { TimeRangePicker } from "../ui/TimeRangePicker";
import { BarChart } from "../../charts/BarChart";
import { resolveTimeRange, migrateTimeRange } from "../../lib/timeRange";
import type { DrilldownGroup } from "./tool-breakdown/ToolDrilldownDrawer";
import { ToolDrilldownDrawer } from "./tool-breakdown/ToolDrilldownDrawer";
import styles from "./ToolBreakdownWidget.module.css";

type Metric = "tool.count" | "tool.duration" | "tool.failure_rate";
type GroupBy = "tool_name" | "bash_command" | "file_extension" | "mcp_server";

interface ToolBreakdownConfig {
  range: TimeRange;
  metric: Metric;
  groupBy: GroupBy;
  compareToPrevious: boolean;
}

interface ChartRow extends Record<string, unknown> {
  key: string;
  value: number;
  prevValue?: number;
  calls?: number;
  errors?: number;
}

const METRIC_OPTIONS: Array<{ value: Metric; label: string }> = [
  { value: "tool.count", label: "Count" },
  { value: "tool.duration", label: "Duration" },
  { value: "tool.failure_rate", label: "Failure rate" },
];

const GROUP_BY_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: "tool_name", label: "Tool" },
  { value: "bash_command", label: "Bash command" },
  { value: "file_extension", label: "File extension" },
  { value: "mcp_server", label: "MCP server" },
];

function normalizeMetric(v: unknown): Metric {
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

function normalizeGroupBy(v: unknown): GroupBy {
  if (
    v === "tool_name" ||
    v === "bash_command" ||
    v === "file_extension" ||
    v === "mcp_server"
  ) {
    return v;
  }
  return "tool_name";
}

function readConfig(raw: Record<string, unknown>): ToolBreakdownConfig {
  return {
    range: migrateTimeRange(raw.range),
    metric: normalizeMetric(raw.metric),
    groupBy: normalizeGroupBy(raw.groupBy),
    compareToPrevious: raw.compareToPrevious === true,
  };
}

function keyForGroupBy(
  row: Record<string, unknown>,
  groupBy: GroupBy,
): string {
  if (groupBy === "tool_name") return String(row.tool ?? "");
  if (groupBy === "bash_command") return String(row.command ?? "");
  if (groupBy === "file_extension") return String(row.extension ?? "");
  return String(row.server ?? "");
}

function formatterFor(metric: Metric): (v: number) => string {
  if (metric === "tool.duration")
    return (v) =>
      v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
  if (metric === "tool.failure_rate") return (v) => `${(v * 100).toFixed(1)}%`;
  return (v) => v.toFixed(0);
}

function failureRateFormatter(
  row: ChartRow,
): (v: number) => string {
  return (v) =>
    `${(v * 100).toFixed(1)}% (${row.errors ?? 0} of ${row.calls ?? 0})`;
}

const PLACEHOLDER_GROUP: DrilldownGroup = { kind: "tool", toolName: "" };

export function ToolBreakdownWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const cfg = readConfig(config);
  const [loaded, setLoaded] = useState<{
    key: string;
    rows: ChartRow[];
  } | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownGroup | null>(null);

  useEffect(() => {
    let ignore = false;
    const { since, until } = resolveTimeRange(cfg.range);
    const key = `${cfg.metric}|${cfg.groupBy}|${since}|${until}|${cfg.compareToPrevious}`;

    const query: PanelQuery = {
      metric: cfg.metric,
      groupBy: cfg.groupBy,
      since,
      until,
      limit: 20,
    };

    const fetchCurrent = getPanelData(query);

    const canCompare =
      cfg.compareToPrevious && since != null && until != null;
    const fetchPrev = canCompare
      ? (() => {
          const duration = until! - since!;
          const prevSince = since! - duration;
          const prevUntil = since!;
          return getPanelData({
            ...query,
            since: prevSince,
            until: prevUntil,
          });
        })()
      : Promise.resolve(null);

    Promise.all([fetchCurrent, fetchPrev]).then(([current, prev]) => {
      if (ignore) return;

      const prevMap = new Map<string, number>();
      if (prev != null) {
        for (const r of prev.rows) {
          const k = keyForGroupBy(r, cfg.groupBy);
          prevMap.set(k, Number(r.value) || 0);
        }
      }

      const rows: ChartRow[] = current.rows.map((r) => {
        const k = keyForGroupBy(r, cfg.groupBy);
        const row: ChartRow = {
          key: k,
          value: Number(r.value) || 0,
        };
        if (prev != null) {
          row.prevValue = prevMap.get(k) ?? 0;
        }
        if (cfg.metric === "tool.failure_rate" && cfg.groupBy === "tool_name") {
          row.calls = Number(r.calls) || 0;
          row.errors = Number(r.errors) || 0;
        }
        return row;
      });

      setLoaded({ key, rows });
    });

    return () => {
      ignore = true;
    };
  }, [cfg.metric, cfg.groupBy, cfg.range, cfg.compareToPrevious]);

  const { since, until } = resolveTimeRange(cfg.range);
  const fetchKey = `${cfg.metric}|${cfg.groupBy}|${since}|${until}|${cfg.compareToPrevious}`;
  const isLoading = loaded == null || loaded.key !== fetchKey;
  const rows = loaded?.rows ?? null;

  if (isConfigOpen) {
    return (
      <div className={styles.configPanel}>
        <label className={styles.configLabel}>
          Range:
          <TimeRangePicker
            value={cfg.range}
            onChange={(range) => onConfigChange({ ...config, range })}
          />
        </label>
        <label className={styles.configLabel}>
          Metric:
          <Select
            value={cfg.metric}
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
        <label className={styles.configLabel}>
          Group by:
          <Select
            value={cfg.groupBy}
            onChange={(e) =>
              onConfigChange({ ...config, groupBy: e.target.value })
            }
          >
            {GROUP_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <Checkbox
          label="Compare to previous period"
          checked={cfg.compareToPrevious}
          onChange={(e) =>
            onConfigChange({ ...config, compareToPrevious: e.target.checked })
          }
        />
      </div>
    );
  }

  if (isLoading || rows == null)
    return <Skeleton variant="block" height={220} />;
  if (rows.length === 0)
    return <EmptyState icon="⚙" message="No tool usage in range" />;

  const isFailureRateWithToolName =
    cfg.metric === "tool.failure_rate" && cfg.groupBy === "tool_name";

  function handleBarClick(row: ChartRow) {
    const group: DrilldownGroup = (() => {
      if (cfg.groupBy === "tool_name")
        return { kind: "tool" as const, toolName: row.key };
      if (cfg.groupBy === "bash_command")
        return { kind: "bash_command" as const, command: row.key };
      if (cfg.groupBy === "file_extension")
        return { kind: "file_extension" as const, extension: row.key };
      return { kind: "mcp_server" as const, server: row.key };
    })();
    setDrilldown(group);
  }

  // When failure_rate + tool_name, each bar gets its own formatter;
  // for other cases use the shared metric formatter.
  const sharedFormatter = isFailureRateWithToolName
    ? undefined
    : formatterFor(cfg.metric);

  return (
    <>
      <BarChart
        data={rows}
        xKey="value"
        yKey="key"
        layout="vertical"
        colorBy="category"
        height={240}
        valueFormatter={
          isFailureRateWithToolName
            ? (v) => {
                const row = rows.find((r) => r.value === v);
                return row
                  ? failureRateFormatter(row)(v)
                  : `${(v * 100).toFixed(1)}%`;
              }
            : sharedFormatter
        }
        onBarClick={handleBarClick}
        prevDataKey={cfg.compareToPrevious ? "prevValue" : undefined}
      />
      <ToolDrilldownDrawer
        open={drilldown != null}
        onClose={() => setDrilldown(null)}
        group={drilldown ?? PLACEHOLDER_GROUP}
        range={cfg.range}
        errorsOnly={cfg.metric === "tool.failure_rate"}
      />
    </>
  );
}
