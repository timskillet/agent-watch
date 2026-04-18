import { useEffect, useState } from "react";
import type { AgentWatchEvent, RunDetail } from "@agentwatch/types";
import { getRunDetail } from "../../api/client";
import { useSelection } from "../../context/SelectionContext";
import type { WidgetProps } from "../../widgets/types";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import styles from "./SessionWaterfallWidget.module.css";

export function SessionWaterfallWidget({ isConfigOpen }: WidgetProps) {
  const { selectedSessionId } = useSelection();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSessionId) return;
    let ignore = false;
    getRunDetail(selectedSessionId)
      .then((data) => {
        if (!ignore) {
          setDetail(data);
          setLoadedSessionId(selectedSessionId);
        }
      })
      .catch(() => {
        if (!ignore) {
          setDetail(null);
          setLoadedSessionId(selectedSessionId);
        }
      });
    return () => {
      ignore = true;
    };
  }, [selectedSessionId]);

  const loading =
    selectedSessionId != null && loadedSessionId !== selectedSessionId;

  if (isConfigOpen) {
    return (
      <div className={styles.configPanel}>
        Session: {selectedSessionId ?? "none selected"}
      </div>
    );
  }

  if (!selectedSessionId) {
    return (
      <EmptyState icon="↔" message="Select a session from the Runs Table" />
    );
  }
  if (loading) return <Skeleton variant="block" height={120} />;
  if (!detail) return <EmptyState message="Session not found" />;

  const bars = buildBars(detail);
  if (bars.length === 0) {
    return <EmptyState message="No timed tool events in this session" />;
  }

  const minTime = detail.startTime;
  const maxTime =
    detail.endTime ??
    detail.events.reduce(
      (max, e) => Math.max(max, e.timestamp + (e.durationMs ?? 0)),
      0,
    );
  const span = maxTime - minTime || 1;

  return (
    <div className={styles.waterfall}>
      {bars.map((bar) => {
        const leftPct = ((bar.start - minTime) / span) * 100;
        const widthPct = Math.max((bar.duration / span) * 100, 1);
        return (
          <div key={bar.id} className={styles.bar}>
            <span className={styles.nameCol}>{bar.name}</span>
            <div className={styles.track}>
              <div
                className={`${styles.fill} ${bar.isError ? styles.fillError : ""}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            </div>
            <span className={styles.durationCol}>{bar.duration}ms</span>
          </div>
        );
      })}
    </div>
  );
}

interface Bar {
  id: string;
  name: string;
  start: number;
  duration: number;
  isError: boolean;
}

function buildBars(detail: RunDetail): Bar[] {
  return detail.events
    .filter((e) => e.durationMs != null && e.durationMs > 0)
    .filter(
      (e) =>
        e.type === "tool_call" ||
        e.type === "tool_result" ||
        e.type === "tool_error" ||
        e.type === "llm_call" ||
        e.type === "llm_response",
    )
    .map((e) => ({
      id: e.id,
      name: getEventName(e),
      start: e.timestamp,
      duration: e.durationMs!,
      isError: e.type === "tool_error" || e.level === "error",
    }));
}

function getEventName(e: AgentWatchEvent): string {
  if (
    e.type === "tool_call" ||
    e.type === "tool_result" ||
    e.type === "tool_error"
  ) {
    return (
      ((e.payload as Record<string, unknown>)["gen_ai.tool.name"] as string) ??
      e.type
    );
  }
  if (e.type === "llm_call") {
    return (
      ((e.payload as Record<string, unknown>)[
        "gen_ai.request.model"
      ] as string) ?? "LLM"
    );
  }
  if (e.type === "llm_response") {
    return (
      ((e.payload as Record<string, unknown>)[
        "gen_ai.response.model"
      ] as string) ?? "LLM"
    );
  }
  return e.type;
}
