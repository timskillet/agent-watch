import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const HOOK_URL = "http://localhost:4318/hooks";

interface HookEntry {
  type: string;
  url: string;
  async?: boolean;
}

interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}

type HooksConfig = Record<string, HookGroup[]>;

interface SettingsJson {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

const AGENTWATCH_HOOKS: Record<string, HookGroup> = {
  PreToolUse: { hooks: [{ type: "http", url: HOOK_URL, async: true }] },
  PostToolUse: { hooks: [{ type: "http", url: HOOK_URL, async: true }] },
  PostToolUseFailure: {
    hooks: [{ type: "http", url: HOOK_URL, async: true }],
  },
  SessionStart: { hooks: [{ type: "http", url: HOOK_URL }] },
  SessionEnd: { hooks: [{ type: "http", url: HOOK_URL }] },
  UserPromptSubmit: { hooks: [{ type: "http", url: HOOK_URL, async: true }] },
  Stop: { hooks: [{ type: "http", url: HOOK_URL, async: true }] },
  SubagentStop: { hooks: [{ type: "http", url: HOOK_URL, async: true }] },
};

function hasAgentwatchHook(groups: HookGroup[]): boolean {
  return groups.some((group) =>
    group.hooks.some((h) => h.type === "http" && h.url === HOOK_URL),
  );
}

export function mergeHookConfig(settingsPath: string): void {
  let settings: SettingsJson = {};
  try {
    const raw = readFileSync(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // File does not exist or invalid JSON -- start fresh
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const [eventName, hookGroup] of Object.entries(AGENTWATCH_HOOKS)) {
    if (!settings.hooks[eventName]) {
      settings.hooks[eventName] = [];
    }

    if (!hasAgentwatchHook(settings.hooks[eventName])) {
      settings.hooks[eventName].push(hookGroup);
    }
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

const SYNC_EVENTS = new Set(["SessionStart", "SessionEnd"]);

export function runInit(): void {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
  const settingsPath = `${home}/.claude/settings.json`;

  mergeHookConfig(settingsPath);

  console.log("AgentWatch hooks written to ~/.claude/settings.json");
  console.log("");
  console.log("Registered hooks:");
  for (const event of Object.keys(AGENTWATCH_HOOKS)) {
    const isAsync = !SYNC_EVENTS.has(event);
    console.log(`  ${event}${isAsync ? " (async)" : ""}`);
  }
  console.log("");
  console.log(
    "All new Claude Code sessions will now send telemetry to AgentWatch.",
  );
  console.log("Start the server: npx agentwatch-dev");
}
