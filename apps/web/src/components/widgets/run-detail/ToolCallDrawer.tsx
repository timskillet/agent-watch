import type { AgentWatchEvent } from "@agentwatch/types";
import { useMemo, useState } from "react";
import { deriveToolCallLabel } from "../../../lib/deriveToolCallLabel";
import { formatDuration } from "../../../lib/formatDuration";
import { Drawer, DrawerSection } from "../../ui/Drawer";
import styles from "./ToolCallDrawer.module.css";

const TRUNCATE_AT = 2048;

export interface ToolCallDrawerProps {
  events: AgentWatchEvent[];
  selectedEvent: AgentWatchEvent | null;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type ToolPayload = {
  "gen_ai.tool.name"?: string;
  "gen_ai.tool.call.id"?: string;
  input?: unknown;
};

type ResultPayload = {
  "gen_ai.tool.call.id"?: string;
  output?: unknown;
};

type ErrorPayload = {
  "gen_ai.tool.call.id"?: string;
  error?: string;
  stack?: string;
};

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as object).length === 0;
  }
  return false;
}

// ── ToolCallHeader ────────────────────────────────────────────────────────────

interface ToolCallHeaderProps {
  event: AgentWatchEvent;
  paired: AgentWatchEvent | undefined;
  durationMs: number | undefined;
}

function ToolCallHeader({ event, paired, durationMs }: ToolCallHeaderProps) {
  const derived = deriveToolCallLabel(event);
  const toolName = (event.payload as ToolPayload)["gen_ai.tool.name"] ?? "";
  const isError = paired?.type === "tool_error";

  return (
    <span className={styles.header}>
      <span className={styles.headerPrimary}>{derived.primary}</span>
      <span className={styles.headerMeta}>
        {toolName && <span className={styles.toolPill}>{toolName}</span>}
        {isError && <span className={styles.errorPill}>Failed</span>}
        {durationMs != null && (
          <span className={styles.duration}>{formatDuration(durationMs)}</span>
        )}
      </span>
    </span>
  );
}

// ── TruncatedPre ─────────────────────────────────────────────────────────────

interface TruncatedPreProps {
  text: string;
}

function TruncatedPre({ text }: TruncatedPreProps) {
  const [expanded, setExpanded] = useState(false);

  const needsTruncation = text.length > TRUNCATE_AT;
  const displayed =
    needsTruncation && !expanded ? text.slice(0, TRUNCATE_AT) + "…" : text;

  return (
    <div>
      <pre className={styles.pre}>{displayed}</pre>
      {needsTruncation && (
        <button
          type="button"
          className={styles.showMore}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

// ── ToolCallDrawer ────────────────────────────────────────────────────────────

export function ToolCallDrawer({
  events,
  selectedEvent,
  onClose,
}: ToolCallDrawerProps) {
  const paired = useMemo(() => {
    if (selectedEvent == null) return undefined;
    const callId = (selectedEvent.payload as ToolPayload)[
      "gen_ai.tool.call.id"
    ];
    if (!callId) return undefined;
    return events.find(
      (e) =>
        (e.type === "tool_result" || e.type === "tool_error") &&
        (e.payload as ToolPayload)["gen_ai.tool.call.id"] === callId,
    );
  }, [events, selectedEvent]);

  const durationMs = useMemo(() => {
    if (selectedEvent == null) return undefined;
    if (paired != null) {
      return (
        paired.timestamp + (paired.durationMs ?? 0) - selectedEvent.timestamp
      );
    }
    return selectedEvent.durationMs;
  }, [selectedEvent, paired]);

  const call = selectedEvent;

  const inputText = useMemo(() => {
    if (call == null) return "";
    const input = (call.payload as ToolPayload).input;
    if (isEmpty(input)) return "";
    return JSON.stringify(input, null, 2);
  }, [call]);

  const outputContent = useMemo(() => {
    if (paired == null) return null;
    if (paired.type === "tool_result") {
      const output = (paired.payload as ResultPayload).output;
      if (isEmpty(output)) return null;
      return { kind: "result" as const, text: JSON.stringify(output, null, 2) };
    }
    if (paired.type === "tool_error") {
      const ep = paired.payload as ErrorPayload;
      return { kind: "error" as const, error: ep.error ?? "", stack: ep.stack };
    }
    return null;
  }, [paired]);

  const metaRows = useMemo(() => {
    if (call == null) return [];
    const payload = call.payload as ToolPayload;
    const rows: Array<{
      label: string;
      value: string | number | undefined;
      mono?: boolean;
    }> = [
      { label: "Event ID", value: call.id, mono: true },
      { label: "Sequence", value: call.sequence },
      { label: "Timestamp", value: new Date(call.timestamp).toLocaleString() },
      {
        label: "Tool call ID",
        value: payload["gen_ai.tool.call.id"],
        mono: true,
      },
      { label: "Tool name", value: payload["gen_ai.tool.name"] },
      { label: "Level", value: call.level },
      { label: "Parent ID", value: call.parentId, mono: true },
      { label: "Paired event ID", value: paired?.id, mono: true },
      { label: "Agent ID", value: call.agentId, mono: true },
      { label: "Session ID", value: call.sessionId, mono: true },
    ];
    return rows.filter((r) => r.value != null && r.value !== "");
  }, [call, paired]);

  // Mounting TruncatedPre with a key resets its expanded state when the
  // selected event changes, without needing a setState-in-effect pattern.
  const resetKey = call?.id ?? "";

  return (
    <Drawer
      open={selectedEvent != null}
      onClose={onClose}
      title={
        call != null ? (
          <ToolCallHeader
            event={call}
            paired={paired}
            durationMs={durationMs}
          />
        ) : undefined
      }
      width={520}
    >
      {call != null && (
        <>
          <DrawerSection title="Input" defaultOpen>
            {inputText ? (
              <TruncatedPre key={resetKey} text={inputText} />
            ) : (
              <span className={styles.muted}>(no input)</span>
            )}
          </DrawerSection>

          <DrawerSection title="Output" defaultOpen>
            {outputContent == null && paired == null && (
              <span className={styles.muted}>(no output yet)</span>
            )}
            {outputContent?.kind === "result" && (
              <TruncatedPre key={resetKey + "-out"} text={outputContent.text} />
            )}
            {outputContent?.kind === "error" && (
              <div>
                <p className={styles.errorLabel}>Error</p>
                <pre className={styles.pre}>{outputContent.error}</pre>
                {outputContent.stack && (
                  <>
                    <p className={styles.errorLabel}>Stack</p>
                    <pre className={styles.pre}>{outputContent.stack}</pre>
                  </>
                )}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Metadata" defaultOpen={false}>
            <dl className={styles.metaList}>
              {metaRows.map((row) => (
                <div key={row.label} className={styles.metaRow}>
                  <dt className={styles.metaDt}>{row.label}</dt>
                  <dd
                    className={`${styles.metaDd} ${row.mono ? styles.metaMono : ""}`}
                  >
                    {String(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}
