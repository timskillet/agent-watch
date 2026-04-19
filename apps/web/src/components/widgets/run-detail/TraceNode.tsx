import type { AgentWatchEvent } from "@agentwatch/types";
import type { TreeNode } from "../../../lib/buildTraceTree";
import { hashToColor } from "../../../charts/theme";
import { deriveToolCallLabel } from "../../../lib/deriveToolCallLabel";
import { formatDuration } from "../../../lib/formatDuration";
import styles from "./TraceTree.module.css";

export interface TraceNodeProps {
  node: TreeNode;
  onSelect: (event: AgentWatchEvent) => void;
  selectedId?: string;
}

const TYPE_LABEL: Record<string, string> = {
  tool_call: "tool",
  llm_call: "llm",
  llm_response: "llm",
  agent_start: "agent",
  agent_end: "agent",
  agent_handoff: "handoff",
  user_prompt: "prompt",
  error: "error",
};

function nodeLabel(event: AgentWatchEvent): { primary: string; chip?: string } {
  if (event.type === "tool_call") {
    const d = deriveToolCallLabel(event);
    return { primary: d.primary, chip: d.chip };
  }
  if (event.type === "user_prompt") {
    const len = (event.payload as { promptLength?: number }).promptLength ?? 0;
    return { primary: `Prompt · ${len} chars` };
  }
  if (event.type === "llm_call" || event.type === "llm_response") {
    return { primary: event.type };
  }
  if (event.type === "agent_start" || event.type === "agent_end") {
    const id =
      (event.payload as { "gen_ai.agent.id"?: string })["gen_ai.agent.id"] ??
      "";
    return { primary: `${event.type}${id ? ` · ${id}` : ""}` };
  }
  if (event.type === "error") {
    const msg = (event.payload as { message?: string }).message ?? "error";
    return { primary: msg };
  }
  return { primary: event.type };
}

export function TraceNode({ node, onSelect, selectedId }: TraceNodeProps) {
  const { event } = node;
  const isSelected = event.id === selectedId;
  const { primary, chip } = nodeLabel(event);
  const typeLabel = TYPE_LABEL[event.type] ?? event.type;
  const tagColor =
    event.level === "error"
      ? "var(--color-error)"
      : event.type === "tool_call"
        ? hashToColor(
            (event.payload as { "gen_ai.tool.name"?: string })[
              "gen_ai.tool.name"
            ] ?? "",
          )
        : "var(--color-text-muted)";

  const clickable = event.type === "tool_call";

  return (
    <li
      className={`${styles.node} ${node.isSlowStep ? styles.nodeSlow : ""}`}
      style={{ paddingLeft: `${node.depth * 16}px` }}
    >
      <button
        type="button"
        className={`${styles.row} ${isSelected ? styles.rowSelected : ""} ${
          clickable ? "" : styles.rowInert
        }`}
        onClick={clickable ? () => onSelect(event) : undefined}
        aria-current={isSelected ? "true" : undefined}
        disabled={!clickable}
      >
        <span className={styles.tag} style={{ background: tagColor }} />
        <span className={styles.content}>
          <span className={styles.typeBadge}>{typeLabel}</span>
          <span className={styles.primary}>{primary}</span>
          {chip && <span className={styles.chip}>{chip}</span>}
          {node.isRetry && (
            <span className={styles.retry} title="Retry of previous sibling">
              ↻ retry
            </span>
          )}
          {event.level === "error" && (
            <span className={styles.errorBadge}>error</span>
          )}
        </span>
        <span className={styles.duration}>
          {node.durationMs !== undefined ? formatDuration(node.durationMs) : ""}
        </span>
      </button>
      {node.children.length > 0 && (
        <ul className={styles.subtree}>
          {node.children.map((child) => (
            <TraceNode
              key={child.event.id}
              node={child}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
