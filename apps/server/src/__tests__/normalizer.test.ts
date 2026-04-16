import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeHookPayload,
  resetNormalizerState,
  type ClaudeCodeHookPayload,
} from "../ingest/normalizer.js";
import { resetSequences } from "../ingest/sequence.js";

beforeEach(() => {
  resetSequences();
  resetNormalizerState();
});

describe("normalizeHookPayload", () => {
  it("1. SessionStart maps to session_start", () => {
    const hook: ClaudeCodeHookPayload = {
      session_id: "sess-1",
      type: "SessionStart",
      cwd: "/home/user/my-project",
    };
    const event = normalizeHookPayload(hook);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("session_start");
    expect(event!.level).toBe("info");
    expect(event!.sessionId).toBe("sess-1");
    expect(event!.agentId).toBe("sess-1");
    expect(event!.pipelineDefinitionId).toBe("my-project");
    expect(event!.payload).toEqual({ cwd: "/home/user/my-project" });
    expect(event!.meta).toMatchObject({ ingestion_source: "claude_code_hook" });
    expect(event!.id).toBeTruthy();
  });

  it("2. SessionEnd maps to session_end", () => {
    const hook: ClaudeCodeHookPayload = {
      session_id: "sess-2",
      type: "SessionEnd",
      duration_ms: 5000,
      total_cost_usd: 0.02,
      total_input_tokens: 100,
      total_output_tokens: 50,
    };
    const event = normalizeHookPayload(hook);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("session_end");
    expect(event!.level).toBe("info");
    expect(event!.payload).toEqual({
      durationMs: 5000,
      totalCost: 0.02,
      totalTokens: 150,
    });
  });

  it("3. PreToolUse maps to tool_call", () => {
    const hook: ClaudeCodeHookPayload = {
      session_id: "sess-3",
      type: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_use_id: "tool-abc",
    };
    const event = normalizeHookPayload(hook);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("tool_call");
    expect(event!.payload).toMatchObject({
      "gen_ai.tool.name": "Bash",
      "gen_ai.tool.call.id": "tool-abc",
      input: { command: "ls" },
    });
    expect(event!.meta).toMatchObject({ tool_use_id: "tool-abc" });
  });

  it("4. PostToolUse maps to tool_result with parentId linking to PreToolUse", () => {
    const preHook: ClaudeCodeHookPayload = {
      session_id: "sess-4",
      type: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_use_id: "tool-xyz",
    };
    const preEvent = normalizeHookPayload(preHook);
    expect(preEvent).not.toBeNull();

    const postHook: ClaudeCodeHookPayload = {
      session_id: "sess-4",
      type: "PostToolUse",
      tool_name: "Bash",
      tool_result: "file1\nfile2",
      tool_use_id: "tool-xyz",
      duration_ms: 200,
    };
    const postEvent = normalizeHookPayload(postHook);
    expect(postEvent).not.toBeNull();
    expect(postEvent!.type).toBe("tool_result");
    expect(postEvent!.parentId).toBe(preEvent!.id);
    expect(postEvent!.durationMs).toBe(200);
    expect(postEvent!.payload).toMatchObject({
      "gen_ai.tool.name": "Bash",
      "gen_ai.tool.call.id": "tool-xyz",
      output: "file1\nfile2",
    });
  });

  it("5. PostToolUseFailure maps to tool_error with level error", () => {
    const preHook: ClaudeCodeHookPayload = {
      session_id: "sess-5",
      type: "PreToolUse",
      tool_name: "Bash",
      tool_input: {},
      tool_use_id: "tool-err",
    };
    normalizeHookPayload(preHook);

    const postHook: ClaudeCodeHookPayload = {
      session_id: "sess-5",
      type: "PostToolUseFailure",
      tool_name: "Bash",
      tool_use_id: "tool-err",
      error: "command not found",
      stack: "Error: command not found\n  at ...",
    };
    const event = normalizeHookPayload(postHook);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("tool_error");
    expect(event!.level).toBe("error");
    expect(event!.payload).toMatchObject({
      error: "command not found",
      stack: "Error: command not found\n  at ...",
    });
  });

  it("6. UserPromptSubmit maps to user_prompt with promptLength, no prompt content", () => {
    const hook: ClaudeCodeHookPayload = {
      session_id: "sess-6",
      type: "UserPromptSubmit",
      prompt: "Hello, world!",
    };
    const event = normalizeHookPayload(hook);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("user_prompt");
    expect(event!.payload).toEqual({ promptLength: 13 });
    expect(JSON.stringify(event)).not.toContain("Hello, world!");
  });

  it("7. Stop maps to session_end", () => {
    const hook: ClaudeCodeHookPayload = {
      session_id: "sess-7",
      type: "Stop",
      duration_ms: 3000,
      total_cost_usd: 0.01,
      total_input_tokens: 50,
      total_output_tokens: 25,
    };
    const event = normalizeHookPayload(hook);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("session_end");
  });

  it("8. SubagentStop maps to agent_end with agent id/name from agent_id field", () => {
    const hook: ClaudeCodeHookPayload = {
      session_id: "sess-8",
      type: "SubagentStop",
      agent_id: "subagent-42",
    };
    const event = normalizeHookPayload(hook);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("agent_end");
    expect(event!.agentId).toBe("sess-8");
    expect(event!.payload).toMatchObject({
      "gen_ai.agent.id": "subagent-42",
      "gen_ai.agent.name": "subagent-42",
    });
  });

  it("9. PermissionRequest returns null", () => {
    const hook: ClaudeCodeHookPayload = {
      session_id: "sess-9",
      type: "PermissionRequest",
    };
    expect(normalizeHookPayload(hook)).toBeNull();
  });

  it("10. Notification returns null", () => {
    const hook: ClaudeCodeHookPayload = {
      session_id: "sess-10",
      type: "Notification",
    };
    expect(normalizeHookPayload(hook)).toBeNull();
  });

  it("11. Sequence auto-increments within a session", () => {
    const base: ClaudeCodeHookPayload = {
      session_id: "sess-seq",
      type: "SessionStart",
      cwd: "/a/b/c",
    };
    const e1 = normalizeHookPayload(base);
    const e2 = normalizeHookPayload({
      ...base,
      type: "UserPromptSubmit",
      prompt: "hi",
    });
    const e3 = normalizeHookPayload({ ...base, type: "Stop" });
    expect(e1!.sequence).toBe(1);
    expect(e2!.sequence).toBe(2);
    expect(e3!.sequence).toBe(3);
  });

  it("12. Sequence is per-session — different sessions each start at 1", () => {
    const e1 = normalizeHookPayload({
      session_id: "sess-a",
      type: "SessionStart",
      cwd: "/a/b",
    });
    const e2 = normalizeHookPayload({
      session_id: "sess-b",
      type: "SessionStart",
      cwd: "/a/b",
    });
    expect(e1!.sequence).toBe(1);
    expect(e2!.sequence).toBe(1);
  });

  it("13. UUID generation — id matches UUID v4 format", () => {
    const event = normalizeHookPayload({
      session_id: "sess-uuid",
      type: "SessionStart",
      cwd: "/foo/bar",
    });
    expect(event!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("14. Timestamp fallback — uses Date.now() when no timestamp provided", () => {
    const before = Date.now();
    const event = normalizeHookPayload({
      session_id: "sess-ts",
      type: "SessionStart",
      cwd: "/foo/bar",
    });
    const after = Date.now();
    expect(event!.timestamp).toBeGreaterThanOrEqual(before);
    expect(event!.timestamp).toBeLessThanOrEqual(after);
  });

  it("15. pipelineDefinitionId is derived from basename of cwd", () => {
    const event = normalizeHookPayload({
      session_id: "sess-pd",
      type: "SessionStart",
      cwd: "/a/b/c/project-name",
    });
    expect(event!.pipelineDefinitionId).toBe("project-name");
  });

  it("16. ingestion_source is present on every non-null event", () => {
    const types: ClaudeCodeHookPayload[] = [
      { session_id: "s", type: "SessionStart", cwd: "/foo/bar" },
      { session_id: "s", type: "SessionEnd" },
      {
        session_id: "s",
        type: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "t1",
      },
      { session_id: "s", type: "UserPromptSubmit", prompt: "hi" },
      { session_id: "s", type: "Stop" },
    ];
    for (const hook of types) {
      const event = normalizeHookPayload(hook);
      if (event !== null) {
        expect(event.meta).toMatchObject({
          ingestion_source: "claude_code_hook",
        });
      }
    }
  });
});
