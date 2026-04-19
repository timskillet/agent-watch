import type { AgentWatchEvent } from "@agentwatch/types";
import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { hashToColor } from "../../../charts/theme";
import { deriveToolCallLabel } from "../../../lib/deriveToolCallLabel";
import { formatDuration } from "../../../lib/formatDuration";
import { pairToolEvents } from "../../../lib/pairToolEvents";
import { EmptyState } from "../../ui/EmptyState";
import styles from "./ToolCallList.module.css";

export interface ToolCallListProps {
  events: AgentWatchEvent[];
  /** Free-text filter substring (case-insensitive) over derived label + raw input JSON + tool name. */
  search: string;
  onSelect: (event: AgentWatchEvent) => void;
  selectedId?: string;
  /** When total rows exceed this count the list virtualises. Default: 50. */
  virtualiseAt?: number;
}

interface RowProps {
  call: AgentWatchEvent;
  durationMs?: number;
  isError: boolean;
  onSelect: (event: AgentWatchEvent) => void;
  selectedId?: string;
}

function Row({ call, durationMs, isError, onSelect, selectedId }: RowProps) {
  const toolName = (call.payload as { "gen_ai.tool.name": string })[
    "gen_ai.tool.name"
  ];
  const derived = deriveToolCallLabel(call);
  const tagColor = isError ? "var(--color-error)" : hashToColor(toolName);
  const isSelected = call.id === selectedId;

  return (
    <button
      type="button"
      className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}
      onClick={() => onSelect(call)}
      aria-current={isSelected ? "true" : undefined}
    >
      <span className={styles.tag} style={{ background: tagColor }} />
      <span className={styles.body}>
        <span className={styles.topRow}>
          <span className={styles.primary}>{derived.primary}</span>
          {derived.chip && <span className={styles.chip}>{derived.chip}</span>}
        </span>
        {derived.secondary && (
          <span className={styles.secondary}>{derived.secondary}</span>
        )}
      </span>
      <span className={styles.right}>
        <span className={styles.duration}>{formatDuration(durationMs)}</span>
        <span className={styles.chevron}>›</span>
      </span>
    </button>
  );
}

export function ToolCallList({
  events,
  search,
  onSelect,
  selectedId,
  virtualiseAt = 50,
}: ToolCallListProps) {
  const pairs = useMemo(() => pairToolEvents(events), [events]);

  const rows = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return pairs;
    return pairs.filter(({ call }) => {
      const toolName = (call.payload as { "gen_ai.tool.name": string })[
        "gen_ai.tool.name"
      ];
      const derived = deriveToolCallLabel(call);
      const inputJson = JSON.stringify(
        (call.payload as { input?: unknown }).input ?? {},
      );
      return (
        derived.primary.toLowerCase().includes(trimmed) ||
        (derived.secondary?.toLowerCase().includes(trimmed) ?? false) ||
        (derived.chip?.toLowerCase().includes(trimmed) ?? false) ||
        toolName.toLowerCase().includes(trimmed) ||
        inputJson.toLowerCase().includes(trimmed)
      );
    });
  }, [pairs, search]);

  if (pairs.length === 0) {
    return <EmptyState message="No tool calls in this run" />;
  }

  if (rows.length === 0) {
    return <EmptyState message={`No calls match "${search.trim()}"`} />;
  }

  if (rows.length > virtualiseAt) {
    return (
      <Virtuoso
        data={rows}
        style={{ height: 400 }}
        itemContent={(_index, row) => (
          <Row
            key={row.call.id}
            call={row.call}
            durationMs={row.durationMs}
            isError={row.isError}
            onSelect={onSelect}
            selectedId={selectedId}
          />
        )}
      />
    );
  }

  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.call.id}>
          <Row
            call={row.call}
            durationMs={row.durationMs}
            isError={row.isError}
            onSelect={onSelect}
            selectedId={selectedId}
          />
        </li>
      ))}
    </ul>
  );
}
