import type { AgentWatchEvent, Trace } from "@agentwatch/types";
import { useMemo, useState } from "react";
import { buildTraceTree } from "../../../lib/buildTraceTree";
import { formatDuration } from "../../../lib/formatDuration";
import { Drawer, DrawerSection } from "../../ui/Drawer";
import { TextInput } from "../../ui/TextInput";
import { LLMActivitySection } from "./LLMActivitySection";
import { PromptPreviewSection } from "./PromptPreviewSection";
import { ToolCallList } from "./ToolCallList";
import { TraceTree } from "./TraceTree";
import styles from "./TraceDrawer.module.css";

export interface TraceDrawerProps {
  trace: Trace | null;
  onClose: () => void;
  onSelectTool: (event: AgentWatchEvent) => void;
  selectedToolId?: string;
}

function traceTitle(trace: Trace): string {
  if (trace.promptPreview !== undefined && trace.promptPreview.length > 0) {
    const short =
      trace.promptPreview.length > 60
        ? trace.promptPreview.slice(0, 60) + "…"
        : trace.promptPreview;
    return `Trace ${trace.index} · ${short}`;
  }
  if (trace.promptLength > 0) {
    return `Trace ${trace.index} · ${trace.promptLength} chars`;
  }
  return `Trace ${trace.index}`;
}

export function TraceDrawer({
  trace,
  onClose,
  onSelectTool,
  selectedToolId,
}: TraceDrawerProps) {
  const [toolSearch, setToolSearch] = useState("");
  const tree = useMemo(
    () => (trace !== null ? buildTraceTree(trace.events) : []),
    [trace],
  );

  if (trace === null) return null;

  return (
    <Drawer open onClose={onClose} title={traceTitle(trace)} width={640}>
      <DrawerSection title="Prompt" defaultOpen>
        <PromptPreviewSection trace={trace} />
      </DrawerSection>

      <DrawerSection title="Tree">
        <TraceTree
          nodes={tree}
          onSelect={onSelectTool}
          selectedId={selectedToolId}
        />
      </DrawerSection>

      <DrawerSection title="Tool calls">
        <div className={styles.search}>
          <TextInput
            leadingIcon="🔍"
            placeholder="Search tool calls…"
            value={toolSearch}
            onChange={(e) => setToolSearch(e.target.value)}
            size="sm"
          />
        </div>
        <ToolCallList
          events={trace.events}
          search={toolSearch}
          onSelect={onSelectTool}
          selectedId={selectedToolId}
        />
      </DrawerSection>

      <DrawerSection title="LLM activity" defaultOpen={false}>
        <LLMActivitySection events={trace.events} />
      </DrawerSection>

      <DrawerSection title="Metadata" defaultOpen={false}>
        <dl className={styles.metadata}>
          <dt>Trace ID</dt>
          <dd className={styles.mono}>{trace.traceId}</dd>
          <dt>Session ID</dt>
          <dd className={styles.mono}>{trace.sessionId}</dd>
          <dt>Index</dt>
          <dd>{trace.index}</dd>
          <dt>Events</dt>
          <dd>{trace.events.length}</dd>
          <dt>Duration</dt>
          <dd>{formatDuration(trace.durationMs)}</dd>
          <dt>Tokens</dt>
          <dd>
            ↑ {trace.inputTokens.toLocaleString()} in · ↓{" "}
            {trace.outputTokens.toLocaleString()} out
          </dd>
          <dt>Cost</dt>
          <dd>
            {trace.cost !== undefined ? `$${trace.cost.toFixed(4)}` : "—"}
          </dd>
          <dt>Errors</dt>
          <dd>{trace.errorCount}</dd>
          <dt>Retries</dt>
          <dd>{trace.retryCount}</dd>
        </dl>
      </DrawerSection>
    </Drawer>
  );
}
