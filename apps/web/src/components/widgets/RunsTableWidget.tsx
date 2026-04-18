import { useEffect, useState } from "react";
import type { PipelineRunSummary } from "@agentwatch/types";
import { getRuns } from "../../api/client";
import { useSelection } from "../../context/SelectionContext";
import type { WidgetProps } from "../../widgets/types";
import { Badge } from "../ui/Badge";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import styles from "./RunsTableWidget.module.css";

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
    getRuns({ limit })
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
  }, [limit]);

  if (isConfigOpen) {
    return (
      <div className={styles.configPanel}>
        <label className={styles.configLabel}>
          Max rows:
          <Select
            value={String(limit)}
            onChange={(e) =>
              onConfigChange({ ...config, limit: Number(e.target.value) })
            }
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </Select>
        </label>
      </div>
    );
  }

  if (loading) return <Skeleton variant="row" lines={5} />;
  if (runs.length === 0)
    return <EmptyState icon="📋" message="No runs found" />;

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Pipeline</th>
          <th>Status</th>
          <th>Events</th>
          <th>Duration</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr
            key={run.pipelineId}
            onClick={() => setSelectedSessionId(run.pipelineId)}
            className={`${styles.row} ${run.pipelineId === selectedSessionId ? styles.rowSelected : ""}`}
          >
            <td>{run.pipelineDefinitionId ?? run.pipelineId.slice(0, 8)}</td>
            <td>
              <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
            </td>
            <td>{run.eventCount}</td>
            <td>
              {run.durationMs != null
                ? `${(run.durationMs / 1000).toFixed(1)}s`
                : "\u2014"}
            </td>
            <td>{new Date(run.startTime).toLocaleTimeString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function statusVariant(
  status: string,
): "success" | "info" | "error" | "neutral" {
  if (status === "completed") return "success";
  if (status === "running") return "info";
  if (status === "failed") return "error";
  return "neutral";
}
