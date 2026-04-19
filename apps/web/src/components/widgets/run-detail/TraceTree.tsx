import type { AgentWatchEvent } from "@agentwatch/types";
import type { TreeNode } from "../../../lib/buildTraceTree";
import { TraceNode } from "./TraceNode";
import styles from "./TraceTree.module.css";

export interface TraceTreeProps {
  nodes: TreeNode[];
  onSelect: (event: AgentWatchEvent) => void;
  selectedId?: string;
}

export function TraceTree({ nodes, onSelect, selectedId }: TraceTreeProps) {
  if (nodes.length === 0) {
    return <div className={styles.empty}>No events in this trace.</div>;
  }
  return (
    <ul className={styles.tree}>
      {nodes.map((node) => (
        <TraceNode
          key={node.event.id}
          node={node}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
    </ul>
  );
}
