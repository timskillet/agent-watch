import type { WidgetType, DashboardState, WidgetInstance } from "./types";
import { getDefaultConfig } from "./registry";

export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  createState: () => DashboardState;
}

interface PresetEntry {
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
}

function buildPreset(entries: PresetEntry[]): DashboardState {
  const widgets: WidgetInstance[] = entries.map((e) => ({
    id: crypto.randomUUID(),
    type: e.type,
    config: getDefaultConfig(e.type),
  }));
  const gridLayout = entries.map((e, i) => ({
    i: widgets[i].id,
    x: e.x,
    y: e.y,
    w: e.w,
    h: e.h,
  }));
  return { widgets, gridLayout };
}

export const presets: PresetDefinition[] = [
  {
    id: "overview",
    name: "Overview",
    description: "Stats, runs table, cost trend, tool breakdown",
    createState: () =>
      buildPreset([
        { type: "stats-summary", x: 0, y: 0, w: 12, h: 3 },
        { type: "runs-table", x: 0, y: 3, w: 7, h: 8 },
        { type: "cost-trend", x: 7, y: 3, w: 5, h: 4 },
        { type: "tool-breakdown", x: 7, y: 7, w: 5, h: 4 },
      ]),
  },
  {
    id: "session-debug",
    name: "Session Debug",
    description: "Runs list with waterfall detail view",
    createState: () =>
      buildPreset([
        { type: "runs-table", x: 0, y: 0, w: 4, h: 10 },
        { type: "session-waterfall", x: 4, y: 0, w: 8, h: 10 },
      ]),
  },
  {
    id: "performance",
    name: "Performance",
    description: "Cost, tokens, and tool metrics",
    createState: () =>
      buildPreset([
        { type: "stats-summary", x: 0, y: 0, w: 12, h: 3 },
        { type: "cost-trend", x: 0, y: 3, w: 6, h: 5 },
        { type: "tool-breakdown", x: 6, y: 3, w: 6, h: 5 },
      ]),
  },
];

export function getDefaultLayout(): DashboardState {
  return presets[0].createState();
}
