import { useEffect, useMemo, useState } from "react";
import type { AgentWatchEvent, RunDetail } from "@agentwatch/types";
import { getRunDetail } from "../../api/client";
import { useSelection } from "../../context/SelectionContext";
import type { WidgetProps } from "../../widgets/types";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { hashToColor, tooltipContentStyle } from "../../charts/theme";
import styles from "./SessionWaterfallWidget.module.css";

interface Bar {
  id: string;
  name: string;
  type: string;
  start: number;
  duration: number;
  isError: boolean;
  errorMessage?: string;
}

interface HoverState {
  bar: Bar;
  x: number;
  y: number;
}

const AXIS_TICKS = 5;

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
      type: e.type,
      start: e.timestamp,
      duration: e.durationMs!,
      isError: e.type === "tool_error" || e.level === "error",
      errorMessage:
        e.type === "tool_error"
          ? String((e.payload as Record<string, unknown>).error ?? "")
          : undefined,
    }));
}

function getEventName(e: AgentWatchEvent): string {
  const p = e.payload as Record<string, unknown>;
  if (
    e.type === "tool_call" ||
    e.type === "tool_result" ||
    e.type === "tool_error"
  ) {
    return (p["gen_ai.tool.name"] as string) ?? e.type;
  }
  if (e.type === "llm_call") {
    return (p["gen_ai.request.model"] as string) ?? "LLM";
  }
  if (e.type === "llm_response") {
    return (p["gen_ai.response.model"] as string) ?? "LLM";
  }
  return e.type;
}

function formatRelativeTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m${secs}s`;
}

export function SessionWaterfallWidget({ isConfigOpen }: WidgetProps) {
  const { selectedSessionId } = useSelection();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

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

  const bars = useMemo(() => (detail ? buildBars(detail) : []), [detail]);

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
  const span = Math.max(maxTime - minTime, 1);

  const ticks = Array.from({ length: AXIS_TICKS }, (_, i) => {
    const pct = (i / (AXIS_TICKS - 1)) * 100;
    const offsetMs = (span * i) / (AXIS_TICKS - 1);
    return { pct, label: `+${formatRelativeTime(offsetMs)}` };
  });

  return (
    <div className={styles.container} onMouseLeave={() => setHover(null)}>
      <div className={styles.axisRow}>
        <span className={styles.nameColSpacer} />
        <div className={styles.axisTrack}>
          {ticks.map((t, i) => (
            <span
              key={i}
              className={styles.axisTick}
              style={{ left: `${t.pct}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
        <span className={styles.durationColSpacer} />
      </div>

      <div className={styles.waterfall}>
        {bars.map((bar) => {
          const leftPct = ((bar.start - minTime) / span) * 100;
          const widthPct = Math.max((bar.duration / span) * 100, 0.5);
          const color = bar.isError ? undefined : hashToColor(bar.name);
          return (
            <div key={bar.id} className={styles.bar}>
              <span className={styles.nameCol}>{bar.name}</span>
              <div className={styles.track}>
                {ticks.map((t, i) => (
                  <span
                    key={i}
                    className={styles.gridLine}
                    style={{ left: `${t.pct}%` }}
                  />
                ))}
                <div
                  className={`${styles.fill} ${bar.isError ? styles.fillError : ""}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    background: color,
                  }}
                  onMouseEnter={(e) =>
                    setHover({ bar, x: e.clientX, y: e.clientY })
                  }
                  onMouseMove={(e) =>
                    setHover({ bar, x: e.clientX, y: e.clientY })
                  }
                  onMouseLeave={() => setHover(null)}
                />
              </div>
              <span className={styles.durationCol}>{bar.duration}ms</span>
            </div>
          );
        })}
      </div>

      {hover && (
        <div
          className={styles.tooltip}
          style={{
            ...tooltipContentStyle,
            left: hover.x + 12,
            top: hover.y + 12,
          }}
        >
          <div className={styles.tooltipTitle}>{hover.bar.name}</div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Type</span>
            <span>{hover.bar.type}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Start</span>
            <span>+{formatRelativeTime(hover.bar.start - minTime)}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Duration</span>
            <span>{hover.bar.duration}ms</span>
          </div>
          {hover.bar.errorMessage && (
            <div className={styles.tooltipError}>{hover.bar.errorMessage}</div>
          )}
        </div>
      )}
    </div>
  );
}
