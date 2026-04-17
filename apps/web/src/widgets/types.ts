import type { ComponentType } from "react";

export type WidgetType =
  | "runs-table"
  | "session-waterfall"
  | "cost-trend"
  | "tool-breakdown"
  | "stats-summary";

export interface WidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  isConfigOpen: boolean;
}

export interface WidgetDefinition {
  type: WidgetType;
  name: string;
  description: string;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  component: ComponentType<WidgetProps>;
}

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  config: Record<string, unknown>;
}

export interface DashboardState {
  widgets: WidgetInstance[];
  gridLayout: Array<{
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
}
