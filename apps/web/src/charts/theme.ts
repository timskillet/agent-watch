import type { CSSProperties } from "react";

export const CHART_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#f97316",
  "#64748b",
] as const;

export function getSeriesColor(index: number): string {
  return CHART_PALETTE[
    ((index % CHART_PALETTE.length) + CHART_PALETTE.length) %
      CHART_PALETTE.length
  ];
}

export function hashToColor(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  return getSeriesColor(Math.abs(hash));
}

export const gridProps = {
  stroke: "var(--color-border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const axisProps = {
  stroke: "var(--color-text-muted)",
  tick: { fontSize: 11, fill: "var(--color-text-muted)" },
  tickLine: false,
  axisLine: false,
} as const;

export const tooltipContentStyle: CSSProperties = {
  background: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
  padding: "8px 10px",
  color: "var(--color-text-primary)",
  boxShadow: "var(--shadow-md)",
};

export const tooltipItemStyle: CSSProperties = {
  color: "var(--color-text-primary)",
};

export const tooltipLabelStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  marginBottom: 4,
};
