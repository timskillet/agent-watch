import { randomUUID } from "crypto";
import { basename } from "path";
import type { AgentWatchEvent } from "@agentwatch/types";
import { nextSequence, evictSession } from "./sequence.js";

export interface ClaudeCodeHookPayload {
  session_id: string;
  type: string;
  cwd?: string;
  timestamp?: number;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  tool_result?: unknown;
  error?: string;
  stack?: string;
  total_cost_usd?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  duration_ms?: number;
  num_turns?: number;
  prompt?: string;
  agent_id?: string;
  [key: string]: unknown;
}

// tool_use_id → event id (for Pre/Post correlation)
const preToolEventIds = new Map<string, string>();
// session_id → set of tool_use_ids (for eviction on session end)
const sessionToolUseIds = new Map<string, Set<string>>();

function evictPreToolEntries(sessionId: string): void {
  const toolUseIds = sessionToolUseIds.get(sessionId);
  if (toolUseIds) {
    for (const id of toolUseIds) {
      preToolEventIds.delete(id);
    }
    sessionToolUseIds.delete(sessionId);
  }
}

function base(
  hook: ClaudeCodeHookPayload,
  overrides?: Partial<AgentWatchEvent>,
): Omit<AgentWatchEvent, "type" | "payload"> {
  return {
    id: randomUUID(),
    agentId: hook.session_id,
    sessionId: hook.session_id,
    pipelineDefinitionId: hook.cwd ? basename(hook.cwd) : undefined,
    sequence: nextSequence(hook.session_id),
    level: "info",
    timestamp: hook.timestamp ?? Date.now(),
    meta: { ingestion_source: "claude_code_hook" },
    ...overrides,
  };
}

export function normalizeHookPayload(
  hook: ClaudeCodeHookPayload,
): AgentWatchEvent | null {
  switch (hook.type) {
    case "SessionStart": {
      return {
        ...base(hook),
        type: "session_start",
        payload: { cwd: hook.cwd ?? "" },
      } as AgentWatchEvent;
    }

    case "SessionEnd":
    case "Stop": {
      const event = {
        ...base(hook),
        type: "session_end",
        payload: {
          durationMs: hook.duration_ms,
          totalCost: hook.total_cost_usd,
          totalTokens:
            (hook.total_input_tokens ?? 0) + (hook.total_output_tokens ?? 0),
        },
      } as AgentWatchEvent;
      // Evict session state to prevent memory leaks on long-running server
      evictSession(hook.session_id);
      evictPreToolEntries(hook.session_id);
      return event;
    }

    case "PreToolUse": {
      const id = randomUUID();
      if (hook.tool_use_id) {
        preToolEventIds.set(hook.tool_use_id, id);
        let ids = sessionToolUseIds.get(hook.session_id);
        if (!ids) {
          ids = new Set();
          sessionToolUseIds.set(hook.session_id, ids);
        }
        ids.add(hook.tool_use_id);
      }
      return {
        ...base(hook),
        id,
        type: "tool_call",
        payload: {
          "gen_ai.tool.name": hook.tool_name ?? "",
          "gen_ai.tool.call.id": hook.tool_use_id,
          input: hook.tool_input,
        },
        meta: {
          ingestion_source: "claude_code_hook",
          tool_use_id: hook.tool_use_id,
        },
      } as AgentWatchEvent;
    }

    case "PostToolUse": {
      let parentId: string | undefined;
      if (hook.tool_use_id) {
        parentId = preToolEventIds.get(hook.tool_use_id);
        preToolEventIds.delete(hook.tool_use_id);
      }
      return {
        ...base(hook),
        type: "tool_result",
        parentId,
        durationMs: hook.duration_ms,
        payload: {
          "gen_ai.tool.name": hook.tool_name ?? "",
          "gen_ai.tool.call.id": hook.tool_use_id,
          output: hook.tool_result,
        },
        meta: {
          ingestion_source: "claude_code_hook",
          ...(hook.tool_use_id ? { tool_use_id: hook.tool_use_id } : {}),
        },
      } as AgentWatchEvent;
    }

    case "PostToolUseFailure": {
      let parentId: string | undefined;
      if (hook.tool_use_id) {
        parentId = preToolEventIds.get(hook.tool_use_id);
        preToolEventIds.delete(hook.tool_use_id);
      }
      return {
        ...base(hook, { level: "error" }),
        type: "tool_error",
        parentId,
        durationMs: hook.duration_ms,
        payload: {
          "gen_ai.tool.name": hook.tool_name ?? "",
          "gen_ai.tool.call.id": hook.tool_use_id,
          error: hook.error ?? "",
          stack: hook.stack,
        },
        meta: {
          ingestion_source: "claude_code_hook",
          ...(hook.tool_use_id ? { tool_use_id: hook.tool_use_id } : {}),
        },
      } as AgentWatchEvent;
    }

    case "UserPromptSubmit": {
      return {
        ...base(hook),
        type: "user_prompt",
        payload: {
          promptLength: hook.prompt?.length ?? 0,
        },
      } as AgentWatchEvent;
    }

    case "SubagentStop": {
      return {
        ...base(hook),
        type: "agent_end",
        payload: {
          "gen_ai.agent.id": hook.agent_id ?? "",
          "gen_ai.agent.name": hook.agent_id ?? "",
        },
      } as AgentWatchEvent;
    }

    case "PermissionRequest":
    case "Notification":
      return null;

    default:
      return null;
  }
}

export function resetNormalizerState(): void {
  preToolEventIds.clear();
  sessionToolUseIds.clear();
}
