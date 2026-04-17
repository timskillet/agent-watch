import type { WidgetProps } from "../../widgets/types";

export function ToolBreakdownWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const range = (config.range as string) ?? "7d";
  const metric = (config.metric as string) ?? "count";

  if (isConfigOpen) {
    return (
      <div
        style={{ padding: 4, display: "flex", flexDirection: "column", gap: 8 }}
      >
        <label
          style={{
            color: "#aaa",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Range:
          <select
            value={range}
            onChange={(e) =>
              onConfigChange({ ...config, range: e.target.value })
            }
            style={selectStyle}
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        </label>
        <label
          style={{
            color: "#aaa",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Metric:
          <select
            value={metric}
            onChange={(e) =>
              onConfigChange({ ...config, metric: e.target.value })
            }
            style={selectStyle}
          >
            <option value="count">Count</option>
            <option value="duration">Duration</option>
            <option value="failure_rate">Failure Rate</option>
          </select>
        </label>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "#555",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 32 }}>&#128202;</div>
      <div style={{ fontSize: 12 }}>
        Tool Breakdown &middot; {metric} &middot; {range}
      </div>
      <div style={{ fontSize: 11, color: "#444" }}>
        Chart renders when panel API data is available
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "#2a2a3e",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 12,
};
