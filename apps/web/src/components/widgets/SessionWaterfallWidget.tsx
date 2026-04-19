import { useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import type { AgentWatchEvent, RunDetail } from "@agentwatch/types";
import { getRunDetail } from "../../api/client";
import { useSelection } from "../../context/SelectionContext";
import { deriveToolCallLabel } from "../../lib/deriveToolCallLabel";
import { pairToolEvents } from "../../lib/pairToolEvents";
import type { WidgetProps } from "../../widgets/types";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { TextInput } from "../ui/TextInput";
import { hashToColor, tooltipContentStyle } from "../../charts/theme";
import { ToolCallDrawer } from "./run-detail/ToolCallDrawer";
import styles from "./SessionWaterfallWidget.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Bar {
  id: string;
  call: AgentWatchEvent;
  paired?: AgentWatchEvent;
  name: string;
  type: string;
  start: number;
  duration: number;
  isError: boolean;
  errorMessage?: string;
  isToolBar: boolean;
}

interface HoverState {
  bar: Bar;
  x: number;
  y: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AXIS_TICKS = 5;
const VIRTUALISE_THRESHOLD = 50;
const ROW_HEIGHT = 19;

const TYPE_LABELS: Record<string, string> = {
  tool_call: "Tool call",
  tool_result: "Tool call",
  tool_error: "Tool call",
  llm_call: "LLM response",
  llm_response: "LLM response",
};

// ── buildBars ─────────────────────────────────────────────────────────────────

function buildBars(detail: RunDetail): Bar[] {
  const bars: Bar[] = [];

  // Paired tool bars
  const pairs = pairToolEvents(detail.events);
  for (const pair of pairs) {
    const { call, paired, durationMs, isError } = pair;
    const duration =
      durationMs != null && durationMs > 0
        ? durationMs
        : call.durationMs != null && call.durationMs > 0
          ? call.durationMs
          : 1;
    const label = deriveToolCallLabel(call);
    const payload = call.payload as Record<string, unknown>;
    const toolName = (payload["gen_ai.tool.name"] as string | undefined) ?? "";
    bars.push({
      id: call.id,
      call,
      paired,
      name: label.primary || toolName || "tool_call",
      type: "tool_call",
      start: call.timestamp,
      duration,
      isError: isError || call.level === "error",
      errorMessage:
        paired?.type === "tool_error"
          ? String((paired.payload as Record<string, unknown>).error ?? "")
          : undefined,
      isToolBar: true,
    });
  }

  // Unpaired tool_result / tool_error (call missing)
  const pairedCallIds = new Set(
    pairs.map((p) => {
      const callId = (
        p.paired?.payload as Record<string, unknown> | undefined
      )?.["gen_ai.tool.call.id"] as string | undefined;
      return callId;
    }),
  );
  for (const e of detail.events) {
    if (e.type !== "tool_result" && e.type !== "tool_error") continue;
    const payload = e.payload as Record<string, unknown>;
    const callId = payload["gen_ai.tool.call.id"] as string | undefined;
    if (callId && pairedCallIds.has(callId)) continue;
    const toolName =
      (payload["gen_ai.tool.name"] as string | undefined) ?? e.type;
    const dur = e.durationMs != null && e.durationMs > 0 ? e.durationMs : 1;
    bars.push({
      id: e.id,
      call: e,
      name: toolName,
      type: e.type,
      start: e.timestamp,
      duration: dur,
      isError: e.type === "tool_error" || e.level === "error",
      errorMessage:
        e.type === "tool_error"
          ? String((e.payload as Record<string, unknown>).error ?? "")
          : undefined,
      isToolBar: false,
    });
  }

  // llm_call bars — no reliable pairing ID in this codebase, use durationMs
  for (const e of detail.events) {
    if (e.type !== "llm_call") continue;
    const payload = e.payload as Record<string, unknown>;
    const model =
      (payload["gen_ai.request.model"] as string | undefined) ?? "LLM";
    const dur = e.durationMs != null && e.durationMs > 0 ? e.durationMs : 1;
    bars.push({
      id: e.id,
      call: e,
      name: model,
      type: "llm_call",
      start: e.timestamp,
      duration: dur,
      isError: e.level === "error",
      isToolBar: false,
    });
  }

  // Sort by start time
  bars.sort((a, b) => a.start - b.start);
  return bars;
}

// ── Tooltip helpers ───────────────────────────────────────────────────────────

const TOOLTIP_W = 260;
const TOOLTIP_H = 140;
const CURSOR_OFFSET = 12;
const VIEWPORT_PAD = 8;

function positionTooltip(x: number, y: number): { left: number; top: number } {
  const flipX = x + CURSOR_OFFSET + TOOLTIP_W > window.innerWidth;
  const flipY = y + CURSOR_OFFSET + TOOLTIP_H > window.innerHeight;
  return {
    left: flipX
      ? Math.max(VIEWPORT_PAD, x - CURSOR_OFFSET - TOOLTIP_W)
      : x + CURSOR_OFFSET,
    top: flipY
      ? Math.max(VIEWPORT_PAD, y - CURSOR_OFFSET - TOOLTIP_H)
      : y + CURSOR_OFFSET,
  };
}

function formatRelativeTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m${secs}s`;
}

// ── BarRow ────────────────────────────────────────────────────────────────────

interface BarRowProps {
  bar: Bar;
  leftPct: number;
  widthPct: number;
  ticks: Array<{ pct: number; label: string }>;
  onHoverEnter: (bar: Bar, x: number, y: number) => void;
  onHoverMove: (bar: Bar, x: number, y: number) => void;
  onHoverLeave: () => void;
  onClick: (bar: Bar) => void;
}

function BarRow({
  bar,
  leftPct,
  widthPct,
  ticks,
  onHoverEnter,
  onHoverMove,
  onHoverLeave,
  onClick,
}: BarRowProps) {
  const color = bar.isError ? undefined : hashToColor(bar.name);
  return (
    <div className={styles.bar}>
      <span className={styles.nameCol} title={bar.name}>
        {bar.name}
      </span>
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
          onMouseEnter={(e) => onHoverEnter(bar, e.clientX, e.clientY)}
          onMouseMove={(e) => onHoverMove(bar, e.clientX, e.clientY)}
          onMouseLeave={onHoverLeave}
          onClick={() => onClick(bar)}
        />
      </div>
      <span className={styles.durationCol}>{bar.duration}ms</span>
    </div>
  );
}

// ── SessionWaterfallWidget ────────────────────────────────────────────────────

export function SessionWaterfallWidget({
  config,
  onConfigChange,
  isConfigOpen,
}: WidgetProps) {
  const { selectedSessionId } = useSelection();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [selectedCall, setSelectedCall] = useState<AgentWatchEvent | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const viewMode =
    (config.viewMode as "time" | "sequence" | undefined) ?? "time";

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

  const visibleBars = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return bars;
    return bars.filter((b) => b.name.toLowerCase().includes(trimmed));
  }, [bars, search]);

  // ── layout math ──────────────────────────────────────────────────────────

  const minTime = detail?.startTime ?? 0;
  const maxTime =
    detail?.endTime ??
    (detail?.events ?? []).reduce(
      (max, e) => Math.max(max, e.timestamp + (e.durationMs ?? 0)),
      0,
    );
  const span = Math.max(maxTime - minTime, 1);

  const totalDuration = useMemo(
    () => visibleBars.reduce((s, b) => s + b.duration, 0),
    [visibleBars],
  );

  function getBarPosition(
    bar: Bar,
    index: number,
  ): { leftPct: number; widthPct: number } {
    if (viewMode === "sequence") {
      let cumulative = 0;
      for (let i = 0; i < index; i++) {
        cumulative +=
          (visibleBars[i].duration / Math.max(totalDuration, 1)) * 100;
      }
      const widthPct = Math.max(
        (bar.duration / Math.max(totalDuration, 1)) * 100,
        0.5,
      );
      return { leftPct: cumulative, widthPct };
    }
    const leftPct = ((bar.start - minTime) / span) * 100;
    const widthPct = Math.max((bar.duration / span) * 100, 0.5);
    return { leftPct, widthPct };
  }

  const ticks = useMemo(() => {
    if (viewMode === "sequence") return [];
    return Array.from({ length: AXIS_TICKS }, (_, i) => {
      const pct = (i / (AXIS_TICKS - 1)) * 100;
      const offsetMs = (span * i) / (AXIS_TICKS - 1);
      return { pct, label: `+${formatRelativeTime(offsetMs)}` };
    });
  }, [viewMode, span]);

  // ── error banner ─────────────────────────────────────────────────────────

  const hasErrors = visibleBars.some((b) => b.isError);
  const errorCount = visibleBars.filter((b) => b.isError).length;
  const firstErrorIndex = visibleBars.findIndex((b) => b.isError);

  function jumpToFirstError() {
    if (firstErrorIndex < 0) return;
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: firstErrorIndex,
        align: "center",
      });
    } else {
      const el = document.getElementById(`bar-row-${firstErrorIndex}`);
      el?.scrollIntoView({ block: "center" });
    }
  }

  // ── event handlers ────────────────────────────────────────────────────────

  function handleHoverEnter(bar: Bar, x: number, y: number) {
    setHover({ bar, x, y });
  }
  function handleHoverMove(bar: Bar, x: number, y: number) {
    setHover({ bar, x, y });
  }
  function handleHoverLeave() {
    setHover(null);
  }
  function handleBarClick(bar: Bar) {
    if (bar.isToolBar) {
      setSelectedCall(bar.call);
    }
  }

  // ── early returns ─────────────────────────────────────────────────────────

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

  // ── render ────────────────────────────────────────────────────────────────

  const useVirtualise = visibleBars.length > VIRTUALISE_THRESHOLD;

  return (
    <div className={styles.container} onMouseLeave={() => setHover(null)}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <TextInput
          leadingIcon="🔍"
          placeholder="Search bars..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.segmented}>
          <button
            type="button"
            className={`${styles.segmentBtn} ${viewMode === "time" ? styles.segmentActive : ""}`}
            onClick={() => onConfigChange({ ...config, viewMode: "time" })}
          >
            By time
          </button>
          <button
            type="button"
            className={`${styles.segmentBtn} ${viewMode === "sequence" ? styles.segmentActive : ""}`}
            onClick={() => onConfigChange({ ...config, viewMode: "sequence" })}
          >
            By sequence
          </button>
        </div>
      </div>

      {/* Error banner */}
      {hasErrors && (
        <div className={styles.errorBanner}>
          <span>
            {errorCount} error{errorCount !== 1 ? "s" : ""} in this session
          </span>
          <button
            type="button"
            className={styles.jumpBtn}
            onClick={jumpToFirstError}
          >
            Jump to first
          </button>
        </div>
      )}

      {/* Axis row — sticky, outside Virtuoso */}
      {viewMode === "time" && (
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
      )}

      {/* Bar list */}
      {useVirtualise ? (
        <Virtuoso
          ref={virtuosoRef}
          data={visibleBars}
          style={{
            height: Math.max(
              200,
              Math.min(600, visibleBars.length * ROW_HEIGHT),
            ),
          }}
          itemContent={(index, bar) => {
            const { leftPct, widthPct } = getBarPosition(bar, index);
            return (
              <div id={`bar-row-${index}`}>
                <BarRow
                  key={bar.id}
                  bar={bar}
                  leftPct={leftPct}
                  widthPct={widthPct}
                  ticks={ticks}
                  onHoverEnter={handleHoverEnter}
                  onHoverMove={handleHoverMove}
                  onHoverLeave={handleHoverLeave}
                  onClick={handleBarClick}
                />
              </div>
            );
          }}
        />
      ) : (
        <div className={styles.waterfall}>
          {visibleBars.map((bar, index) => {
            const { leftPct, widthPct } = getBarPosition(bar, index);
            return (
              <BarRow
                key={bar.id}
                bar={bar}
                leftPct={leftPct}
                widthPct={widthPct}
                ticks={ticks}
                onHoverEnter={handleHoverEnter}
                onHoverMove={handleHoverMove}
                onHoverLeave={handleHoverLeave}
                onClick={handleBarClick}
              />
            );
          })}
        </div>
      )}

      {/* Hover tooltip */}
      {hover && (
        <div
          className={styles.tooltip}
          style={{
            ...tooltipContentStyle,
            ...positionTooltip(hover.x, hover.y),
          }}
        >
          <div className={styles.tooltipTitle}>{hover.bar.name}</div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Type</span>
            <span>{TYPE_LABELS[hover.bar.type] ?? hover.bar.type}</span>
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

      {/* Tool call drawer */}
      <ToolCallDrawer
        events={detail.events}
        selectedEvent={selectedCall}
        onClose={() => setSelectedCall(null)}
      />
    </div>
  );
}
