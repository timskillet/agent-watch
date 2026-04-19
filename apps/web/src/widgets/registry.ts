import type { WidgetType, WidgetDefinition } from "./types";
import { RunsTableWidget } from "../components/widgets/RunsTableWidget";
import { SessionWaterfallWidget } from "../components/widgets/SessionWaterfallWidget";
import { CostTrendWidget } from "../components/widgets/CostTrendWidget";
import { ToolBreakdownWidget } from "../components/widgets/ToolBreakdownWidget";
import { StatsSummaryWidget } from "../components/widgets/StatsSummaryWidget";

export const widgetRegistry: WidgetDefinition[] = [
  {
    type: "runs-table",
    name: "Runs Table",
    description: "Filterable list of recent sessions/runs",
    defaultW: 12,
    defaultH: 10,
    minW: 6,
    minH: 6,
    component: RunsTableWidget,
  },
  {
    type: "session-waterfall",
    name: "Session Waterfall",
    description: "Horizontal timeline of tools in one session",
    defaultW: 8,
    defaultH: 6,
    minW: 4,
    minH: 3,
    component: SessionWaterfallWidget,
  },
  {
    type: "cost-trend",
    name: "Cost Trend",
    description: "Time-series chart of session costs",
    defaultW: 6,
    defaultH: 5,
    minW: 3,
    minH: 3,
    component: CostTrendWidget,
  },
  {
    type: "tool-breakdown",
    name: "Tool Breakdown",
    description: "Bar chart of tool call frequency and duration",
    defaultW: 6,
    defaultH: 5,
    minW: 3,
    minH: 3,
    component: ToolBreakdownWidget,
  },
  {
    type: "stats-summary",
    name: "Stats Summary",
    description: "Key metrics: total runs, success rate, avg duration",
    defaultW: 12,
    defaultH: 3,
    minW: 6,
    minH: 2,
    component: StatsSummaryWidget,
  },
];

export function getWidgetDefinition(
  type: WidgetType,
): WidgetDefinition | undefined {
  return widgetRegistry.find((d) => d.type === type);
}

const defaultConfigs: Record<WidgetType, Record<string, unknown>> = {
  "runs-table": {
    pageSize: 25,
    sort: { key: "startTime", dir: "desc" },
    columnVisibility: {
      pipeline: true,
      status: true,
      started: true,
      duration: true,
      events: true,
      cost: true,
      trend: true,
      source: true,
    },
    filters: {
      search: "",
      statuses: [],
      sources: [],
      range: { kind: "preset", value: "24h" },
    },
    costThreshold: 0.5,
  },
  "session-waterfall": { viewMode: "time" },
  "cost-trend": { range: "7d" },
  "tool-breakdown": {
    range: { kind: "preset", value: "7d" },
    metric: "tool.count",
    groupBy: "tool_name",
    compareToPrevious: false,
  },
  "stats-summary": {},
};

export function getDefaultConfig(type: WidgetType): Record<string, unknown> {
  return { ...defaultConfigs[type] };
}

export function getDefaultSize(type: WidgetType): {
  defaultW: number;
  defaultH: number;
} {
  const def = getWidgetDefinition(type);
  return { defaultW: def?.defaultW ?? 6, defaultH: def?.defaultH ?? 4 };
}
