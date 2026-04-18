import { describe, it, expect } from "vitest";
import type { AgentWatchEvent } from "@agentwatch/types";
import { deriveToolCallLabel } from "./deriveToolCallLabel";

function makeToolCall(name: string, input?: unknown): AgentWatchEvent {
  return {
    id: "t1",
    agentId: "a",
    sessionId: "s",
    sequence: 1,
    type: "tool_call",
    level: "info",
    timestamp: 0,
    payload: {
      "gen_ai.tool.name": name,
      ...(input !== undefined ? { input } : {}),
    },
  } as AgentWatchEvent;
}

describe("Bash", () => {
  it("returns command as primary and first token as chip", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Bash", { command: "git status" }),
    );
    expect(result.primary).toBe("git status");
    expect(result.chip).toBe("git");
  });

  it("truncates long commands to 80 chars with ellipsis", () => {
    const long = "x".repeat(100);
    const result = deriveToolCallLabel(makeToolCall("Bash", { command: long }));
    expect(result.primary).toHaveLength(80);
    expect(result.primary.endsWith("…")).toBe(true);
  });

  it("trims leading whitespace before chip extraction", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Bash", { command: "  git status" }),
    );
    expect(result.chip).toBe("git");
  });

  it("uses description as secondary when present", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Bash", { command: "npm test", description: "Run tests" }),
    );
    expect(result.secondary).toBe("Run tests");
  });
});

describe("Read / Edit / Write", () => {
  it("Read: returns basename, dirname as secondary, extension as chip", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Read", { file_path: "/src/components/Foo.ts" }),
    );
    expect(result.primary).toBe("Foo.ts");
    expect(result.secondary).toBe("/src/components");
    expect(result.chip).toBe(".ts");
  });

  it("Edit: single-segment path has no secondary", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Edit", { file_path: "index.ts" }),
    );
    expect(result.primary).toBe("index.ts");
    expect(result.secondary).toBeUndefined();
    expect(result.chip).toBe(".ts");
  });

  it("Write: unknown extension chip includes the extension as-is", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Write", { file_path: "/tmp/data.myext" }),
    );
    expect(result.chip).toBe(".myext");
  });
});

describe("Grep", () => {
  it("pattern only — no secondary, no chip", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Grep", { pattern: "foo.*bar" }),
    );
    expect(result.primary).toBe("foo.*bar");
    expect(result.secondary).toBeUndefined();
    expect(result.chip).toBeUndefined();
  });

  it("pattern + glob → secondary includes glob value", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Grep", { pattern: "TODO", glob: "**/*.ts" }),
    );
    expect(result.primary).toBe("TODO");
    expect(result.secondary).toBe("in `**/*.ts`");
  });
});

describe("Glob", () => {
  it("returns pattern as primary", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Glob", { pattern: "**/*.tsx" }),
    );
    expect(result.primary).toBe("**/*.tsx");
    expect(result.secondary).toBeUndefined();
    expect(result.chip).toBeUndefined();
  });
});

describe("WebFetch", () => {
  it("valid URL → hostname as primary, pathname as secondary", () => {
    const result = deriveToolCallLabel(
      makeToolCall("WebFetch", { url: "https://example.com/docs/api" }),
    );
    expect(result.primary).toBe("example.com");
    expect(result.secondary).toBe("/docs/api");
  });

  it("invalid URL → raw string as primary, no secondary, no chip", () => {
    const result = deriveToolCallLabel(
      makeToolCall("WebFetch", { url: "not-a-url" }),
    );
    expect(result.primary).toBe("not-a-url");
    expect(result.secondary).toBeUndefined();
    expect(result.chip).toBeUndefined();
  });
});

describe("Task", () => {
  it("combines subagent_type and description, uses subagent_type as chip", () => {
    const result = deriveToolCallLabel(
      makeToolCall("Task", {
        subagent_type: "claude",
        description: "Do something",
      }),
    );
    expect(result.primary).toBe("claude: Do something");
    expect(result.chip).toBe("claude");
  });
});

describe("MCP tools", () => {
  it("mcp__playwright__browser_click with input → server chip, server/fn secondary", () => {
    const result = deriveToolCallLabel(
      makeToolCall("mcp__playwright__browser_click", { selector: "#submit" }),
    );
    expect(result.primary).toBe("#submit");
    expect(result.secondary).toBe("playwright / browser_click");
    expect(result.chip).toBe("playwright");
  });

  it("MCP with no inputs → primary = fn name", () => {
    const result = deriveToolCallLabel(
      makeToolCall("mcp__github__list_repos", {}),
    );
    expect(result.primary).toBe("list_repos");
    expect(result.secondary).toBe("github / list_repos");
    expect(result.chip).toBe("github");
  });
});

describe("TodoWrite", () => {
  it("count from array length", () => {
    const result = deriveToolCallLabel(
      makeToolCall("TodoWrite", {
        todos: [{ id: 1 }, { id: 2 }, { id: 3 }],
      }),
    );
    expect(result.primary).toBe("3 todos updated");
  });

  it("non-array todos → 0 todos updated", () => {
    const result = deriveToolCallLabel(
      makeToolCall("TodoWrite", { todos: "bad" }),
    );
    expect(result.primary).toBe("0 todos updated");
  });
});

describe("Unknown tool", () => {
  it("first string input → primary = that value", () => {
    const result = deriveToolCallLabel(
      makeToolCall("SpecialTool", { action: "run", target: "foo" }),
    );
    expect(result.primary).toBe("run");
  });

  it("no inputs → primary = tool name", () => {
    const result = deriveToolCallLabel(makeToolCall("SpecialTool", {}));
    expect(result.primary).toBe("SpecialTool");
  });
});

describe("Edge cases", () => {
  it("missing payload.input entirely → no throw, primary = tool name", () => {
    const result = deriveToolCallLabel(makeToolCall("Bash"));
    expect(result.primary).toBe("Bash");
  });
});
