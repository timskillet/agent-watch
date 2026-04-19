export interface AgentWatchConfig {
  project: string;
  tags?: string[];
  alerts?: AlertRule[];
  annotate?: AnnotationRule[];
  panels?: PanelDefinition[];
  /**
   * Off by default. When `true`, the server retains the raw user-prompt text
   * on `user_prompt` events (capped at 8192 chars) so the dashboard can show
   * it as the trace headline. Loaded from `agentwatch.config.json` in the
   * session's cwd.
   */
  capturePromptContent?: boolean;
}

export interface AlertRule {
  on: "session.cost" | "session.duration" | "tool.failures" | "token.usage";
  exceeds: number;
  notify: "desktop";
}

export interface AnnotationRule {
  tag: string;
  when: Record<string, unknown>;
}

export interface PanelDefinition {
  id: string;
  title: string;
  type: "timeseries" | "bar" | "table";
  query: PanelQuery;
}

// Intentionally separate from @agentwatch/types PanelQuery (store-level).
// These serve different layers and may diverge as the config DSL evolves.
export interface PanelQuery {
  tool?: string;
  metric:
    | "session.cost"
    | "session.duration"
    | "tool.failure_rate"
    | "token.usage";
  groupBy?: "day" | "tool_name" | "command_prefix" | "session_tag";
  range?: "7d" | "30d" | "90d";
  limit?: number;
}
