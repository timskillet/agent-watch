import type { AgentWatchEvent, TimeRange } from "@agentwatch/types";
import { useEffect, useMemo, useState } from "react";
import { getEvents } from "../../../api/client";
import { resolveTimeRange } from "../../../lib/timeRange";
import { Drawer } from "../../ui/Drawer";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";
import { TextInput } from "../../ui/TextInput";
import { ToolCallDrawer } from "../run-detail/ToolCallDrawer";
import { ToolCallList } from "../run-detail/ToolCallList";
import styles from "./ToolDrilldownDrawer.module.css";

export type DrilldownGroup =
  | { kind: "tool"; toolName: string }
  | { kind: "bash_command"; command: string }
  | { kind: "file_extension"; extension: string }
  | { kind: "mcp_server"; server: string };

interface ToolDrilldownDrawerProps {
  open: boolean;
  onClose: () => void;
  group: DrilldownGroup;
  range: TimeRange;
  errorsOnly?: boolean;
}

function groupLabel(g: DrilldownGroup): string {
  if (g.kind === "tool") return g.toolName;
  if (g.kind === "bash_command") return `Bash: ${g.command}`;
  if (g.kind === "file_extension") return `Files ${g.extension}`;
  return `MCP: ${g.server}`;
}

type ToolCallPayload = {
  "gen_ai.tool.name"?: string;
  "gen_ai.tool.call.id"?: string;
  input?: { command?: string; file_path?: string };
};

function matchesGroup(event: AgentWatchEvent, group: DrilldownGroup): boolean {
  const payload = event.payload as ToolCallPayload;
  const toolName = payload["gen_ai.tool.name"] ?? "";

  if (group.kind === "tool") {
    return toolName === group.toolName;
  }

  if (group.kind === "bash_command") {
    if (toolName !== "Bash") return false;
    const rawCommand = payload.input?.command ?? "";
    const firstToken = rawCommand.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    return firstToken === group.command;
  }

  if (group.kind === "file_extension") {
    if (toolName !== "Read" && toolName !== "Edit" && toolName !== "Write")
      return false;
    const filePath = payload.input?.file_path ?? "";
    const dotIndex = filePath.indexOf(".");
    const ext = dotIndex === -1 ? "" : filePath.slice(dotIndex).toLowerCase();
    return ext === group.extension;
  }

  if (group.kind === "mcp_server") {
    const match = toolName.match(/^mcp__([^_]+(?:_[^_]+)*)__/);
    return match?.[1] === group.server;
  }

  return false;
}

export function ToolDrilldownDrawer({
  open,
  onClose,
  group,
  range,
  errorsOnly = false,
}: ToolDrilldownDrawerProps) {
  const [fetchKey, setFetchKey] = useState<string | null>(null);
  const [allEvents, setAllEvents] = useState<AgentWatchEvent[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState<AgentWatchEvent | null>(
    null,
  );

  const { since, until } = useMemo(() => resolveTimeRange(range), [range]);

  const currentKey = `${open}|${JSON.stringify(group)}|${since}|${until}|${errorsOnly}`;
  const loading = open && fetchKey !== currentKey;

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    getEvents({
      type: ["tool_call", "tool_result", "tool_error"],
      since,
      until,
      limit: 500,
    }).then((rows) => {
      if (ignore) return;
      setAllEvents(rows);
      setFetchKey(currentKey);
    });
    return () => {
      ignore = true;
    };
  }, [open, group, range, errorsOnly, since, until, currentKey]);

  const filteredEvents = useMemo(() => {
    const toolCalls = allEvents.filter(
      (e) => e.type === "tool_call" && matchesGroup(e, group),
    );

    const errorCallIds = errorsOnly
      ? new Set(
          allEvents
            .filter((e) => e.type === "tool_error")
            .map(
              (e) =>
                (e.payload as { "gen_ai.tool.call.id"?: string })[
                  "gen_ai.tool.call.id"
                ],
            )
            .filter(Boolean),
        )
      : null;

    const filteredCalls = errorsOnly
      ? toolCalls.filter((c) => {
          const id = (c.payload as { "gen_ai.tool.call.id"?: string })[
            "gen_ai.tool.call.id"
          ];
          return id != null && errorCallIds!.has(id);
        })
      : toolCalls;

    const filteredCallIds = new Set(
      filteredCalls
        .map(
          (c) =>
            (c.payload as { "gen_ai.tool.call.id"?: string })[
              "gen_ai.tool.call.id"
            ],
        )
        .filter(Boolean),
    );

    const partners = allEvents.filter(
      (e) =>
        (e.type === "tool_result" || e.type === "tool_error") &&
        filteredCallIds.has(
          (e.payload as { "gen_ai.tool.call.id"?: string })[
            "gen_ai.tool.call.id"
          ],
        ),
    );

    return [...filteredCalls, ...partners];
  }, [allEvents, group, errorsOnly]);

  const callCount = filteredEvents.filter((e) => e.type === "tool_call").length;
  const subText =
    `${callCount} call${callCount !== 1 ? "s" : ""}` +
    (errorsOnly ? " · errors only" : "");

  function handleToolCallClose() {
    setSelectedCall(null);
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={groupLabel(group)}
        width={560}
      >
        <div className={styles.subText}>{subText}</div>

        {loading ? (
          <Skeleton variant="block" height={96} />
        ) : filteredEvents.length === 0 ? (
          <EmptyState icon="🔍" message="No matching calls in this range" />
        ) : (
          <>
            <TextInput
              placeholder="Search calls…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <ToolCallList
              events={filteredEvents}
              search={search}
              onSelect={setSelectedCall}
              selectedId={selectedCall?.id}
            />
          </>
        )}
      </Drawer>

      <ToolCallDrawer
        events={filteredEvents}
        selectedEvent={selectedCall}
        onClose={handleToolCallClose}
      />
    </>
  );
}
