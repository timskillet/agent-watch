import type { AgentWatchEvent } from "@agentwatch/types";
import { useMemo } from "react";
import { formatDuration } from "../../../lib/formatDuration";
import styles from "./LLMActivitySection.module.css";

export interface LLMActivitySectionProps {
  events: AgentWatchEvent[];
}

interface LLMGroup {
  call?: AgentWatchEvent;
  response?: AgentWatchEvent;
  /** Stable key for React. */
  key: string;
}

function spanIdOf(e: AgentWatchEvent): string | undefined {
  const v = e.meta?.otel_span_id;
  return typeof v === "string" ? v : undefined;
}

function groupBySpan(events: AgentWatchEvent[]): LLMGroup[] {
  const groups = new Map<string, LLMGroup>();
  const ungrouped: LLMGroup[] = [];
  for (const e of events) {
    if (e.type !== "llm_call" && e.type !== "llm_response") continue;
    const span = spanIdOf(e);
    if (span === undefined) {
      ungrouped.push({
        [e.type === "llm_call" ? "call" : "response"]: e,
        key: e.id,
      });
      continue;
    }
    const existing = groups.get(span);
    if (existing !== undefined) {
      if (e.type === "llm_call") existing.call = e;
      else existing.response = e;
    } else {
      groups.set(span, {
        key: span,
        ...(e.type === "llm_call" ? { call: e } : { response: e }),
      });
    }
  }
  return [...groups.values(), ...ungrouped];
}

function tokensOf(e: AgentWatchEvent | undefined): {
  input: number;
  output: number;
} {
  if (e === undefined) return { input: 0, output: 0 };
  const p = e.payload as Record<string, unknown>;
  return {
    input:
      typeof p["gen_ai.usage.input_tokens"] === "number"
        ? (p["gen_ai.usage.input_tokens"] as number)
        : 0,
    output:
      typeof p["gen_ai.usage.output_tokens"] === "number"
        ? (p["gen_ai.usage.output_tokens"] as number)
        : 0,
  };
}

function modelOf(e: AgentWatchEvent | undefined): string | undefined {
  if (e === undefined) return undefined;
  const model = (e.payload as Record<string, unknown>)["gen_ai.request.model"];
  return typeof model === "string" ? model : undefined;
}

export function LLMActivitySection({ events }: LLMActivitySectionProps) {
  const groups = useMemo(() => groupBySpan(events), [events]);

  if (groups.length === 0) {
    return <div className={styles.empty}>No LLM activity in this trace.</div>;
  }

  return (
    <ul className={styles.list}>
      {groups.map((g) => {
        const tokens = tokensOf(g.response ?? g.call);
        const model = modelOf(g.call) ?? modelOf(g.response);
        const duration = g.call?.durationMs ?? g.response?.durationMs;
        return (
          <li key={g.key} className={styles.item}>
            <div className={styles.header}>
              <span className={styles.badge}>
                {g.call && g.response
                  ? "call + response"
                  : g.call
                    ? "call"
                    : "response"}
              </span>
              {model !== undefined && (
                <span className={styles.model}>{model}</span>
              )}
              {duration !== undefined && (
                <span className={styles.duration}>
                  {formatDuration(duration)}
                </span>
              )}
            </div>
            {(tokens.input > 0 || tokens.output > 0) && (
              <div className={styles.tokens}>
                ↑ {tokens.input.toLocaleString()} in · ↓{" "}
                {tokens.output.toLocaleString()} out
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
