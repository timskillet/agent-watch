import { describe, it, expect } from "vitest";
import { defineConfig } from "../index";
import type {
  AgentWatchConfig,
  AlertRule,
  AnnotationRule,
  PanelDefinition,
  PanelQuery,
} from "../config";

describe("config types", () => {
  it("AlertRule accepts all valid metric types", () => {
    const rules: AlertRule[] = [
      { on: "session.cost", exceeds: 1.0, notify: "desktop" },
      { on: "session.duration", exceeds: 5000, notify: "desktop" },
      { on: "tool.failures", exceeds: 3, notify: "desktop" },
      { on: "token.usage", exceeds: 10000, notify: "desktop" },
    ];
    expect(rules).toHaveLength(4);
  });

  it("PanelDefinition accepts all valid panel types", () => {
    const baseQuery: PanelQuery = { metric: "session.cost", groupBy: "day", range: "30d" };
    const panels: PanelDefinition[] = [
      { id: "a", title: "A", type: "timeseries", query: baseQuery },
      { id: "b", title: "B", type: "bar", query: baseQuery },
      { id: "c", title: "C", type: "table", query: baseQuery },
    ];
    expect(panels).toHaveLength(3);
  });

  it("AgentWatchConfig requires project, rest optional", () => {
    const minimal: AgentWatchConfig = { project: "test" };
    expect(minimal.project).toBe("test");
    expect(minimal.tags).toBeUndefined();
    expect(minimal.alerts).toBeUndefined();
    expect(minimal.annotate).toBeUndefined();
    expect(minimal.panels).toBeUndefined();
  });
});

describe("defineConfig", () => {
  it("returns the config object unchanged", () => {
    const input: AgentWatchConfig = {
      project: "test-project",
      tags: ["ci"],
      alerts: [{ on: "session.cost", exceeds: 2.0, notify: "desktop" }],
      annotate: [{ tag: "expensive", when: { "session.cost": { gt: 1.0 } } }],
      panels: [
        {
          id: "cost-trend",
          title: "Daily Cost",
          type: "timeseries",
          query: { metric: "session.cost", groupBy: "day", range: "30d" },
        },
      ],
    };
    const output = defineConfig(input);
    expect(output).toBe(input);
  });

  it("returns minimal config unchanged", () => {
    const input: AgentWatchConfig = { project: "minimal" };
    const output = defineConfig(input);
    expect(output).toBe(input);
    expect(output.project).toBe("minimal");
  });
});
