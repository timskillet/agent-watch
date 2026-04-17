import { useEffect, useState } from "react";
import type { PipelineRunSummary } from "@agentwatch/types";
import { getRuns } from "../../api/client";
import { useSelection } from "../../context/SelectionContext";
import type { WidgetProps } from "../../widgets/types";

export function RunsTableWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedSessionId, setSelectedSessionId } = useSelection();

  const limit = (config.limit as number) ?? 50;

  useEffect(() => {
    let ignore = false;
    getRuns({ limit }).then((data) => {
      if (!ignore) {
        setRuns(data);
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [limit]);

  if (isConfigOpen) {
    return (
      <div style={{ padding: 4 }}>
        <label
          style={{
            color: "#aaa",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Max rows:
          <select
            value={String(limit)}
            onChange={(e) =>
              onConfigChange({ ...config, limit: Number(e.target.value) })
            }
            style={selectStyle}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      </div>
    );
  }

  if (loading) return <Muted>Loading runs...</Muted>;
  if (runs.length === 0) return <Muted>No runs found</Muted>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #333" }}>
          <th style={th}>Pipeline</th>
          <th style={th}>Status</th>
          <th style={th}>Events</th>
          <th style={th}>Duration</th>
          <th style={th}>Time</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr
            key={run.pipelineId}
            onClick={() => setSelectedSessionId(run.pipelineId)}
            style={{
              cursor: "pointer",
              borderBottom: "1px solid #2a2a3e",
              background:
                run.pipelineId === selectedSessionId
                  ? "rgba(139,156,247,0.15)"
                  : "transparent",
            }}
          >
            <td style={td}>
              {run.pipelineDefinitionId ?? run.pipelineId.slice(0, 8)}
            </td>
            <td style={td}>
              <span style={{ color: statusColor(run.status), fontSize: 11 }}>
                {run.status}
              </span>
            </td>
            <td style={td}>{run.eventCount}</td>
            <td style={td}>
              {run.durationMs != null
                ? `${(run.durationMs / 1000).toFixed(1)}s`
                : "\u2014"}
            </td>
            <td style={td}>{new Date(run.startTime).toLocaleTimeString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function statusColor(status: string): string {
  if (status === "completed") return "#4ade80";
  if (status === "running") return "#60a5fa";
  if (status === "failed") return "#f87171";
  return "#888";
}

function Muted({ children }: { children: string }) {
  return <div style={{ color: "#666", fontSize: 12 }}>{children}</div>;
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 8px",
  fontWeight: 500,
  color: "#888",
};
const td: React.CSSProperties = { padding: "6px 8px", color: "#ccc" };
const selectStyle: React.CSSProperties = {
  background: "#2a2a3e",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 12,
};
