import type { Delta } from "../../lib/computeDelta";
import styles from "./DeltaCell.module.css";

export type DeltaValueFormat =
  | "duration"
  | "cost"
  | "count"
  | "tokens"
  | "percent";

export interface DeltaCellProps {
  value: number | undefined;
  format: DeltaValueFormat;
  highlight?: "diverges" | "none";
}

/** Renders a single numeric cell — used for the A and B columns. */
export function DeltaCell({
  value,
  format,
  highlight = "none",
}: DeltaCellProps) {
  const text = value === undefined ? "—" : formatValue(value, format);
  return (
    <span
      className={`${styles.value} ${
        value === undefined ? styles.missing : ""
      } ${highlight === "diverges" ? styles.divergent : ""}`}
    >
      {text}
    </span>
  );
}

export interface DeltaSummaryProps {
  delta: Delta;
  format: DeltaValueFormat;
}

/** Renders the "▲/▼/~ / not present" column for a row. */
export function DeltaSummary({ delta, format }: DeltaSummaryProps) {
  if (delta.kind === "not_present") {
    return <span className={styles.muted}>not present</span>;
  }
  if (delta.kind === "similar") {
    return <span className={styles.muted}>~ similar</span>;
  }

  const arrow = delta.kind === "worse" ? "▲" : "▼";
  const cls =
    delta.kind === "worse"
      ? delta.diverges
        ? styles.worseStrong
        : styles.worse
      : styles.better;

  const label = formatDelta(delta, format);
  return (
    <span className={cls}>
      <span className={styles.arrow}>{arrow}</span> {label}
      {delta.diverges && delta.kind === "worse" ? (
        <span className={styles.divergeBadge}>DIVERGES</span>
      ) : null}
    </span>
  );
}

function formatDelta(delta: Delta, format: DeltaValueFormat): string {
  if (delta.ratio !== null) {
    return `${delta.ratio.toFixed(1)}×`;
  }
  if (delta.absolute !== null) {
    return formatValue(Math.abs(delta.absolute), format, { withSign: false });
  }
  return "—";
}

function formatValue(
  value: number,
  format: DeltaValueFormat,
  opts: { withSign?: boolean } = {},
): string {
  const prefix = opts.withSign && value > 0 ? "+" : "";
  switch (format) {
    case "duration":
      return prefix + formatDuration(value);
    case "cost":
      return prefix + `$${value.toFixed(2)}`;
    case "tokens":
      return prefix + value.toLocaleString();
    case "percent":
      return prefix + `${(value * 100).toFixed(1)}%`;
    case "count":
    default:
      return prefix + value.toLocaleString();
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
