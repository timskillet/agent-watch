import { randomUUID } from "crypto";
import { basename } from "path";
import type { AgentWatchEvent } from "@agentwatch/types";
import { nextSequence, evictSession } from "./sequence.js";

export interface ClaudeCodeHookPayload {
  session_id: string;
  hook_event_name?: string;
  type?: string;
  cwd?: string;
  timestamp?: number;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  tool_result?: unknown;
  tool_response?: unknown;
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

// tool_use_id → { event id, Pre timestamp } (for Pre/Post correlation + duration)
const preToolEventIds = new Map<string, { id: string; timestamp: number }>();
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

// Clamp implausible durations (negative from clock skew, or wildly large from
// a malformed timestamp on one side of a Pre/Post pair). 1 hour = 3.6e6 ms.
const MAX_TOOL_DURATION_MS = 3_600_000;

const MAX_PROMPT_CHARS = 8192;

export interface NormalizeOptions {
  /** Returns true when the project's config opts in to prompt-content capture. */
  shouldCapturePromptContent?: (cwd: string) => boolean;
}

function sanityCheckDuration(
  durationMs: number,
  toolUseId: string | undefined,
): number | undefined {
  if (durationMs < 0 || durationMs > MAX_TOOL_DURATION_MS) {
    console.warn(
      `[agentwatch] implausible tool duration ${durationMs}ms (tool_use_id=${toolUseId ?? "?"}); dropping`,
    );
    return undefined;
  }
  return durationMs;
}

function base(
  hook: ClaudeCodeHookPayload,
  overrides?: Partial<AgentWatchEvent>,
): Omit<AgentWatchEvent, "type" | "payload"> {
  return {
    id: randomUUID(),
    agentId: hook.session_id,
    sessionId: hook.session_id,
    pipelineId: hook.session_id,
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
  opts: NormalizeOptions = {},
): AgentWatchEvent | null {
  const eventName = hook.hook_event_name ?? hook.type;
  switch (eventName) {
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
      const timestamp = hook.timestamp ?? Date.now();
      if (hook.tool_use_id) {
        preToolEventIds.set(hook.tool_use_id, { id, timestamp });
        let ids = sessionToolUseIds.get(hook.session_id);
        if (!ids) {
          ids = new Set();
          sessionToolUseIds.set(hook.session_id, ids);
        }
        ids.add(hook.tool_use_id);
      }
      return {
        ...base(hook, { timestamp }),
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
      let durationMs: number | undefined = hook.duration_ms;
      const postTimestamp = hook.timestamp ?? Date.now();
      if (hook.tool_use_id) {
        const pre = preToolEventIds.get(hook.tool_use_id);
        if (pre) {
          parentId = pre.id;
          if (durationMs == null) {
            durationMs = sanityCheckDuration(
              postTimestamp - pre.timestamp,
              hook.tool_use_id,
            );
          }
        }
        preToolEventIds.delete(hook.tool_use_id);
      }
      return {
        ...base(hook, { timestamp: postTimestamp }),
        type: "tool_result",
        parentId,
        durationMs,
        payload: {
          "gen_ai.tool.name": hook.tool_name ?? "",
          "gen_ai.tool.call.id": hook.tool_use_id,
          output: hook.tool_response ?? hook.tool_result,
        },
        meta: {
          ingestion_source: "claude_code_hook",
          ...(hook.tool_use_id ? { tool_use_id: hook.tool_use_id } : {}),
        },
      } as AgentWatchEvent;
    }

    case "PostToolUseFailure": {
      let parentId: string | undefined;
      let durationMs: number | undefined = hook.duration_ms;
      const postTimestamp = hook.timestamp ?? Date.now();
      if (hook.tool_use_id) {
        const pre = preToolEventIds.get(hook.tool_use_id);
        if (pre) {
          parentId = pre.id;
          if (durationMs == null) {
            durationMs = sanityCheckDuration(
              postTimestamp - pre.timestamp,
              hook.tool_use_id,
            );
          }
        }
        preToolEventIds.delete(hook.tool_use_id);
      }
      return {
        ...base(hook, { level: "error", timestamp: postTimestamp }),
        type: "tool_error",
        parentId,
        durationMs,
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
      const rawPrompt = typeof hook.prompt === "string" ? hook.prompt : "";
      const allowCapture =
        rawPrompt.length > 0 &&
        hook.cwd !== undefined &&
        opts.shouldCapturePromptContent?.(hook.cwd) === true;
      return {
        ...base(hook),
        type: "user_prompt",
        payload: {
          promptLength: rawPrompt.length,
          ...(allowCapture
            ? { promptText: rawPrompt.slice(0, MAX_PROMPT_CHARS) }
            : {}),
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
      console.warn(
        `[agentwatch] dropping hook payload with unknown event name: ${JSON.stringify(eventName)}`,
      );
      return null;
  }
}

export function resetNormalizerState(): void {
  preToolEventIds.clear();
  sessionToolUseIds.clear();
}
