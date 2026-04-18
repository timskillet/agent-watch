import { Line, LineChart, ResponsiveContainer } from "recharts";
import { getSeriesColor } from "./theme";

type Dimension = number | `${number}%`;

interface SparklineProps<T extends Record<string, unknown>> {
  data: T[];
  yKey: keyof T & string;
  width?: Dimension;
  height?: number;
  color?: string;
}

export function Sparkline<T extends Record<string, unknown>>({
  data,
  yKey,
  width = "100%",
  height = 24,
  color,
}: SparklineProps<T>) {
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data} margin={{ top: 1, right: 0, left: 0, bottom: 1 }}>
        <Line
          type="monotone"
          dataKey={yKey as string}
          stroke={color ?? getSeriesColor(0)}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
