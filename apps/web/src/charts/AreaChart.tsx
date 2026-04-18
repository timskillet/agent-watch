import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisProps,
  getSeriesColor,
  gridProps,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "./theme";

interface AreaChartProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  height?: number;
  valueFormatter?: (value: number) => string;
  xFormatter?: (value: string) => string;
}

export function AreaChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  height = 200,
  valueFormatter,
  xFormatter,
}: AreaChartProps<T>) {
  const color = getSeriesColor(0);
  const gradientId = `area-gradient-${String(yKey)}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey={xKey as string}
          {...axisProps}
          tickFormatter={
            xFormatter ? (v: unknown) => xFormatter(String(v)) : undefined
          }
          minTickGap={24}
        />
        <YAxis
          {...axisProps}
          tickFormatter={
            valueFormatter
              ? (v: unknown) => valueFormatter(Number(v))
              : undefined
          }
          width={48}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          formatter={(value: unknown) =>
            valueFormatter ? valueFormatter(Number(value)) : String(value)
          }
          labelFormatter={(label: unknown) =>
            xFormatter ? xFormatter(String(label)) : String(label)
          }
        />
        <Area
          type="monotone"
          dataKey={yKey as string}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}
