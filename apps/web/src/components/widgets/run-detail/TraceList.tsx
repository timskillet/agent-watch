import type { Trace } from "@agentwatch/types";
import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { hashToColor } from "../../../charts/theme";
import { formatDuration } from "../../../lib/formatDuration";
import { EmptyState } from "../../ui/EmptyState";
import styles from "./TraceList.module.css";

export interface TraceListProps {
  traces: Trace[];
  /** Free-text filter (case-insensitive) over headline + tool names + tool-count summary. */
  search: string;
  onSelect: (trace: Trace) => void;
  selectedTraceId?: string;
  /** When total rows exceed this count the list virtualises. Default: 50. */
  virtualiseAt?: number;
}

interface TraceRowProps {
  trace: Trace;
  onSelect: (trace: Trace) => void;
  selectedTraceId?: string;
}

function traceHeadline(trace: Trace): string {
  if (trace.promptPreview !== undefined && trace.promptPreview.length > 0) {
    return trace.promptPreview;
  }
  if (trace.promptLength > 0) {
    return `Prompt #${trace.index} · ${trace.promptLength} chars`;
  }
  return `Trace ${trace.index}`;
}

function formatTokenPair(input: number, output: number): string {
  if (input === 0 && output === 0) return "—";
  return `↑${formatCompact(input)} / ↓${formatCompact(output)}`;
}

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function Row({ trace, onSelect, selectedTraceId }: TraceRowProps) {
  const isSelected = trace.traceId === selectedTraceId;
  const timestamp = new Date(trace.startTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <button
      type="button"
      className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}
      onClick={() => onSelect(trace)}
      aria-current={isSelected ? "true" : undefined}
    >
      <span
        className={styles.status}
        data-state={trace.errorCount > 0 ? "error" : "ok"}
        aria-hidden="true"
      />
      <span className={styles.body}>
        <span className={styles.headline}>
          <span className={styles.time}>{timestamp}</span>
          <span className={styles.label}>{traceHeadline(trace)}</span>
        </span>
        <span className={styles.meta}>
          <span className={styles.duration}>
            {formatDuration(trace.durationMs)}
          </span>
          <span className={styles.tools}>
            {trace.tools.slice(0, 4).map((t) => (
              <span
                key={t}
                className={styles.toolChip}
                style={{ background: hashToColor(t) }}
                title={`${t} × ${trace.toolCounts[t] ?? 0}`}
              >
                {t}×{trace.toolCounts[t] ?? 0}
              </span>
            ))}
            {trace.tools.length > 4 && (
              <span className={styles.toolChipMore}>
                +{trace.tools.length - 4}
              </span>
            )}
          </span>
          <span className={styles.tokens}>
            {formatTokenPair(trace.inputTokens, trace.outputTokens)}
          </span>
          {trace.cost !== undefined && (
            <span
              className={styles.cost}
              title="CC cost allocated by event-count share of session_end.totalCost"
            >
              ${trace.cost.toFixed(2)}
            </span>
          )}
          {trace.errorCount > 0 && (
            <span className={styles.errorBadge}>
              {trace.errorCount} error{trace.errorCount > 1 ? "s" : ""}
            </span>
          )}
          {trace.retryCount > 0 && (
            <span className={styles.retryBadge}>
              ↻ {trace.retryCount} retr{trace.retryCount > 1 ? "ies" : "y"}
            </span>
          )}
        </span>
      </span>
      <span className={styles.chevron}>›</span>
    </button>
  );
}

export function TraceList({
  traces,
  search,
  onSelect,
  selectedTraceId,
  virtualiseAt = 50,
}: TraceListProps) {
  const rows = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return traces;
    return traces.filter((t) => {
      const headline = traceHeadline(t).toLowerCase();
      const toolsStr = t.tools.join(" ").toLowerCase();
      const countsStr = Object.entries(t.toolCounts)
        .map(([k, v]) => `${k}×${v}`)
        .join(" ")
        .toLowerCase();
      return (
        headline.includes(trimmed) ||
        toolsStr.includes(trimmed) ||
        countsStr.includes(trimmed)
      );
    });
  }, [traces, search]);

  if (traces.length === 0) {
    return <EmptyState message="No traces in this run" />;
  }

  if (rows.length === 0) {
    return <EmptyState message={`No traces match "${search.trim()}"`} />;
  }

  if (rows.length > virtualiseAt) {
    return (
      <Virtuoso
        data={rows}
        style={{ height: 400 }}
        itemContent={(_index, trace) => (
          <Row
            key={trace.traceId}
            trace={trace}
            onSelect={onSelect}
            selectedTraceId={selectedTraceId}
          />
        )}
      />
    );
  }

  return (
    <ul className={styles.list}>
      {rows.map((trace) => (
        <li key={trace.traceId}>
          <Row
            trace={trace}
            onSelect={onSelect}
            selectedTraceId={selectedTraceId}
          />
        </li>
      ))}
    </ul>
  );
}
