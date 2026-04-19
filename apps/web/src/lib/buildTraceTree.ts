import type { AgentWatchEvent } from "@agentwatch/types";

export interface TreeNode {
  event: AgentWatchEvent;
  children: TreeNode[];
  depth: number;
  /**
   * True when the previous sibling at the same depth is a `tool_call` of the
   * same tool name with strictly-equal JSON input.
   */
  isRetry: boolean;
  /**
   * True when the node's `durationMs` is more than 2× the mean of its siblings
   * (requires at least 3 siblings with durations for the mean to be meaningful).
   */
  isSlowStep: boolean;
  /** Paired `tool_result` / `tool_error` when this node is a `tool_call`. */
  pairedResult?: AgentWatchEvent;
  /**
   * Effective duration for the node — falls back through: paired-result span,
   * event.durationMs.
   */
  durationMs?: number;
}

const NODE_TYPES: ReadonlySet<string> = new Set([
  "tool_call",
  "llm_call",
  "llm_response",
  "agent_start",
  "agent_end",
  "agent_handoff",
  "error",
  "user_prompt",
]);

interface ToolPayload {
  "gen_ai.tool.call.id"?: string;
  "gen_ai.tool.name"?: string;
  input?: unknown;
}

/**
 * Build a parent-id-based tree for a trace's events. Pure. Returns the roots.
 *
 * - `tool_result` / `tool_error` are collapsed into their matching `tool_call`
 *   via `gen_ai.tool.call.id`; they don't become nodes themselves.
 * - Events whose `parentId` is absent or points outside this set become roots.
 * - Retry + slow-step markers are computed per parent over ordered siblings.
 */
export function buildTraceTree(events: AgentWatchEvent[]): TreeNode[] {
  if (events.length === 0) return [];

  const pairedResultByCallId = new Map<string, AgentWatchEvent>();
  for (const e of events) {
    if (e.type !== "tool_result" && e.type !== "tool_error") continue;
    const callId = (e.payload as ToolPayload)["gen_ai.tool.call.id"];
    if (callId !== undefined) pairedResultByCallId.set(callId, e);
  }

  const nodes = new Map<string, TreeNode>();
  for (const e of events) {
    if (!NODE_TYPES.has(e.type)) continue;
    let pairedResult: AgentWatchEvent | undefined;
    let durationMs = e.durationMs;
    if (e.type === "tool_call") {
      const callId = (e.payload as ToolPayload)["gen_ai.tool.call.id"];
      if (callId !== undefined) {
        pairedResult = pairedResultByCallId.get(callId);
      }
      if (pairedResult !== undefined) {
        durationMs =
          pairedResult.timestamp + (pairedResult.durationMs ?? 0) - e.timestamp;
      }
    }
    nodes.set(e.id, {
      event: e,
      children: [],
      depth: 0,
      isRetry: false,
      isSlowStep: false,
      pairedResult,
      durationMs,
    });
  }

  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.event.parentId;
    if (parentId !== undefined && nodes.has(parentId)) {
      nodes.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  assignDepthAndMarkers(roots, 0);
  return roots;
}

function assignDepthAndMarkers(siblings: TreeNode[], depth: number): void {
  for (const n of siblings) n.depth = depth;

  for (let i = 1; i < siblings.length; i++) {
    const prev = siblings[i - 1].event;
    const cur = siblings[i].event;
    if (prev.type !== "tool_call" || cur.type !== "tool_call") continue;
    const prevP = prev.payload as ToolPayload;
    const curP = cur.payload as ToolPayload;
    if (prevP["gen_ai.tool.name"] !== curP["gen_ai.tool.name"]) continue;
    if (
      JSON.stringify(prevP.input ?? null) !== JSON.stringify(curP.input ?? null)
    ) {
      continue;
    }
    siblings[i].isRetry = true;
  }

  const durations = siblings
    .map((n) => n.durationMs)
    .filter((d): d is number => typeof d === "number" && !Number.isNaN(d));
  if (durations.length >= 3) {
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    if (mean > 0) {
      for (const n of siblings) {
        if (typeof n.durationMs === "number" && n.durationMs > 2 * mean) {
          n.isSlowStep = true;
        }
      }
    }
  }

  for (const n of siblings) {
    if (n.children.length > 0) assignDepthAndMarkers(n.children, depth + 1);
  }
}
