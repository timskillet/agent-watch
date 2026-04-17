import { useEffect, useState } from "react";
import type { AgentWatchEvent, RunDetail } from "@agentwatch/types";
import { getRunDetail } from "../../api/client";
import { useSelection } from "../../context/SelectionContext";
import type { WidgetProps } from "../../widgets/types";

export function SessionWaterfallWidget({ isConfigOpen }: WidgetProps) {
  const { selectedSessionId } = useSelection();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    getRunDetail(selectedSessionId).then((data) => {
      setDetail(data);
      setLoading(false);
    });
  }, [selectedSessionId]);

  if (isConfigOpen) {
    return (
      <div style={{ color: "#aaa", fontSize: 12, padding: 4 }}>
        Session: {selectedSessionId ?? "none selected"}
      </div>
    );
  }

  if (!selectedSessionId) {
    return (
      <div style={{ color: "#666", fontSize: 12 }}>
        Select a session from the Runs Table
      </div>
    );
  }
  if (loading)
    return <div style={{ color: "#666", fontSize: 12 }}>Loading...</div>;
  if (!detail)
    return <div style={{ color: "#666", fontSize: 12 }}>Session not found</div>;

  const bars = buildBars(detail);
  if (bars.length === 0) {
    return (
      <div style={{ color: "#666", fontSize: 12 }}>
        No timed tool events in this session
      </div>
    );
  }

  const minTime = detail.startTime;
  const maxTime =
    detail.endTime ??
    Math.max(...detail.events.map((e) => e.timestamp + (e.durationMs ?? 0)));
  const span = maxTime - minTime || 1;

  return (
    <div style={{ fontSize: 12 }}>
      {bars.map((bar) => {
        const leftPct = ((bar.start - minTime) / span) * 100;
        const widthPct = Math.max((bar.duration / span) * 100, 1);
        return (
          <div
            key={bar.id}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 3,
            }}
          >
            <span style={nameCol}>{bar.name}</span>
            <div style={trackStyle}>
              <div
                style={{
                  position: "absolute",
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: "100%",
                  background: bar.isError ? "#f87171" : "#8b9cf7",
                  borderRadius: 2,
                  minWidth: 2,
                }}
              />
            </div>
            <span style={durationCol}>{bar.duration}ms</span>
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
    return (e.payload as Record<string, unknown>)["gen_ai.tool.name"] as string ?? e.type;
  }
  if (e.type === "llm_call") {
    return (e.payload as Record<string, unknown>)["gen_ai.request.model"] as string ?? "LLM";
  }
  if (e.type === "llm_response") {
    return (e.payload as Record<string, unknown>)["gen_ai.response.model"] as string ?? "LLM";
  }
  return e.type;
}

const nameCol: React.CSSProperties = {
  width: 100,
  flexShrink: 0,
  color: "#aaa",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  paddingRight: 8,
};
const trackStyle: React.CSSProperties = {
  flex: 1,
  position: "relative",
  height: 16,
  background: "#1a1a2e",
  borderRadius: 2,
};
const durationCol: React.CSSProperties = {
  width: 56,
  flexShrink: 0,
  textAlign: "right",
  color: "#666",
  paddingLeft: 8,
};
