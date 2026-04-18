import type { AgentWatchEvent } from "@agentwatch/types";

export interface DerivedLabel {
  /** Main headline, e.g. "pytest tests/foo.py" */
  primary: string;
  /** Optional muted subtitle, e.g. a file's dirname or a URL path */
  secondary?: string;
  /** Optional short auto-tag, e.g. "git", "pytest", ".ts" */
  chip?: string;
}

function getInput(event: AgentWatchEvent): Record<string, unknown> | null {
  if (event.type !== "tool_call") return null;
  const payload = event.payload as {
    "gen_ai.tool.name": string;
    input?: unknown;
  };
  if (
    payload.input === null ||
    typeof payload.input !== "object" ||
    Array.isArray(payload.input)
  ) {
    return null;
  }
  return payload.input as Record<string, unknown>;
}

function getToolName(event: AgentWatchEvent): string {
  if (event.type !== "tool_call") return "";
  return (event.payload as { "gen_ai.tool.name": string })["gen_ai.tool.name"];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function firstStringValue(input: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(input)) {
    const s = str(input[key]);
    if (s !== undefined) return s;
  }
  return undefined;
}

function basename(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}

function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return "";
  return normalized.slice(0, idx);
}

function extname(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx <= 0) return "";
  return filename.slice(dotIdx);
}

function handleBash(input: Record<string, unknown> | null): DerivedLabel {
  const command = str(input?.["command"]);
  if (!command) {
    return { primary: "Bash" };
  }
  const trimmed = command.trimStart();
  const primary = trimmed.length > 80 ? trimmed.slice(0, 79) + "…" : trimmed;
  const firstToken = trimmed.split(/\s/)[0];
  const chip = firstToken || undefined;
  const description = str(input?.["description"]);
  return {
    primary,
    ...(description ? { secondary: description } : {}),
    ...(chip ? { chip } : {}),
  };
}

function handleFileTool(input: Record<string, unknown> | null): DerivedLabel {
  const filePath = str(input?.["file_path"]);
  if (!filePath) return { primary: "" };
  const base = basename(filePath);
  const dir = dirname(filePath);
  const ext = extname(base);
  const hasIntermediateSegment = dir.length > 0 && dir !== "/";
  return {
    primary: base,
    ...(hasIntermediateSegment ? { secondary: dir } : {}),
    ...(ext ? { chip: ext } : {}),
  };
}

function handleGrep(input: Record<string, unknown> | null): DerivedLabel {
  const pattern = str(input?.["pattern"]) ?? "";
  const glob = str(input?.["glob"]);
  return {
    primary: pattern,
    ...(glob ? { secondary: `in \`${glob}\`` } : {}),
  };
}

function handleGlob(input: Record<string, unknown> | null): DerivedLabel {
  return { primary: str(input?.["pattern"]) ?? "" };
}

function handleWebFetch(input: Record<string, unknown> | null): DerivedLabel {
  const url = str(input?.["url"]) ?? "";
  try {
    const parsed = new URL(url);
    const secondary = parsed.pathname !== "/" ? parsed.pathname : undefined;
    return { primary: parsed.hostname, ...(secondary ? { secondary } : {}) };
  } catch {
    return { primary: url };
  }
}

function handleTask(input: Record<string, unknown> | null): DerivedLabel {
  const subagentType = str(input?.["subagent_type"]) ?? "";
  const description = str(input?.["description"]) ?? "";
  return { primary: `${subagentType}: ${description}`, chip: subagentType };
}

function handleMcp(
  toolName: string,
  input: Record<string, unknown> | null,
): DerivedLabel {
  // mcp__{server}__{fn}
  const parts = toolName.split("__");
  const server = parts[1] ?? "";
  const fn = parts.slice(2).join("__");
  const firstString = input ? firstStringValue(input) : undefined;
  return {
    primary: firstString ?? fn,
    secondary: `${server} / ${fn}`,
    chip: server,
  };
}

function handleTodoWrite(input: Record<string, unknown> | null): DerivedLabel {
  const todos = input?.["todos"];
  const count = Array.isArray(todos) ? todos.length : 0;
  return { primary: `${count} todos updated` };
}

function handleGeneric(
  toolName: string,
  input: Record<string, unknown> | null,
): DerivedLabel {
  if (input) {
    const first = firstStringValue(input);
    if (first !== undefined) return { primary: first };
  }
  return { primary: toolName };
}

export function deriveToolCallLabel(event: AgentWatchEvent): DerivedLabel {
  const toolName = getToolName(event);
  if (!toolName) return { primary: "" };

  const input = getInput(event);

  if (toolName === "Bash") return handleBash(input);
  if (toolName === "Read" || toolName === "Edit" || toolName === "Write") {
    return handleFileTool(input);
  }
  if (toolName === "Grep") return handleGrep(input);
  if (toolName === "Glob") return handleGlob(input);
  if (toolName === "WebFetch") return handleWebFetch(input);
  if (toolName === "Task") return handleTask(input);
  if (toolName === "TodoWrite") return handleTodoWrite(input);
  if (toolName.startsWith("mcp__")) return handleMcp(toolName, input);
  return handleGeneric(toolName, input);
}
