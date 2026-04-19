import type { AgentRollup } from "@agentwatch/types";

export interface AgentMatch {
  agentId: string;
  a?: AgentRollup;
  b?: AgentRollup;
  /** Row position in the combined ordered list. */
  position: number;
}

/**
 * Pair two runs' agents by `agentId`. Agents only present in one run keep
 * their row with the other side undefined (→ "not present" in the UI).
 *
 * Order: agents from A first in their original order, then agents only in B.
 */
export function matchAgents(a: AgentRollup[], b: AgentRollup[]): AgentMatch[] {
  const bById = new Map(b.map((r) => [r.agentId, r]));
  const seen = new Set<string>();
  const matches: AgentMatch[] = [];

  for (const ra of a) {
    const rb = bById.get(ra.agentId);
    matches.push({
      agentId: ra.agentId,
      a: ra,
      b: rb,
      position: matches.length,
    });
    seen.add(ra.agentId);
  }
  for (const rb of b) {
    if (seen.has(rb.agentId)) continue;
    matches.push({
      agentId: rb.agentId,
      b: rb,
      position: matches.length,
    });
  }
  return matches;
}
