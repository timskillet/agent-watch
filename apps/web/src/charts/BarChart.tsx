import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisProps,
  getSeriesColor,
  gridProps,
  hashToColor,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "./theme";

type Layout = "horizontal" | "vertical";
type ColorBy = "series" | "category";

interface BarChartProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  /** "vertical" draws horizontal bars (Recharts' inverted naming). */
  layout?: Layout;
  colorBy?: ColorBy;
  height?: number;
  valueFormatter?: (value: number) => string;
  onBarClick?: (row: T) => void;
  /** Optional second bar key for compare-to-previous overlays. */
  prevDataKey?: string;
  /** Per-bar label; receives the full row so row-specific context survives. */
  barLabelFormatter?: (row: T) => string;
}

export function BarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  layout = "vertical",
  colorBy = "series",
  height = 240,
  valueFormatter,
  onBarClick,
  prevDataKey,
  barLabelFormatter,
}: BarChartProps<T>) {
  const seriesColor = getSeriesColor(0);
  const isVerticalLayout = layout === "vertical";

  // In Recharts "vertical" layout: categories on Y, numeric on X
  const categoryKey = (isVerticalLayout ? yKey : xKey) as string;
  const valueKey = (isVerticalLayout ? xKey : yKey) as string;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid {...gridProps} vertical={isVerticalLayout} />
        {isVerticalLayout ? (
          <>
            <XAxis
              type="number"
              dataKey={valueKey}
              {...axisProps}
              tickFormatter={
                valueFormatter
                  ? (v: unknown) => valueFormatter(Number(v))
                  : undefined
              }
            />
            <YAxis
              type="category"
              dataKey={categoryKey}
              {...axisProps}
              width={96}
            />
          </>
        ) : (
          <>
            <XAxis type="category" dataKey={categoryKey} {...axisProps} />
            <YAxis
              type="number"
              dataKey={valueKey}
              {...axisProps}
              tickFormatter={
                valueFormatter
                  ? (v: unknown) => valueFormatter(Number(v))
                  : undefined
              }
              width={48}
            />
          </>
        )}
        <Tooltip
          contentStyle={tooltipContentStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          formatter={(value: unknown) =>
            valueFormatter ? valueFormatter(Number(value)) : String(value)
          }
          cursor={{ fill: "var(--color-bg-hover)" }}
        />
        <Bar
          dataKey={valueKey}
          fill={seriesColor}
          isAnimationActive={false}
          radius={3}
          onClick={
            onBarClick ? (data: unknown) => onBarClick(data as T) : undefined
          }
          style={onBarClick ? { cursor: "pointer" } : undefined}
        >
          {colorBy === "category" &&
            data.map((row, i) => (
              <Cell key={i} fill={hashToColor(String(row[categoryKey] ?? i))} />
            ))}
          {barLabelFormatter != null && (
            <LabelList
              dataKey={valueKey}
              position={isVerticalLayout ? "right" : "top"}
              content={(props) => {
                const p = props as {
                  x?: number;
                  y?: number;
                  width?: number;
                  height?: number;
                  index?: number;
                };
                const x = p.x ?? 0;
                const y = p.y ?? 0;
                const width = p.width ?? 0;
                const height = p.height ?? 0;
                const index = p.index ?? -1;
                const row = data[index];
                if (row == null) return null;
                const text = barLabelFormatter(row);
                const cx = isVerticalLayout ? x + width + 6 : x + width / 2;
                const cy = isVerticalLayout ? y + height / 2 : y - 6;
                return (
                  <text
                    x={cx}
                    y={cy}
                    fill="var(--color-text-primary)"
                    fontSize={11}
                    dominantBaseline="central"
                    textAnchor={isVerticalLayout ? "start" : "middle"}
                  >
                    {text}
                  </text>
                );
              }}
            />
          )}
        </Bar>
        {prevDataKey != null && (
          <Bar
            dataKey={prevDataKey}
            fill={seriesColor}
            fillOpacity={0.25}
            isAnimationActive={false}
            radius={3}
          />
        )}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
