import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

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
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      // File does not exist — start fresh
    } else {
      throw err;
    }
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

export function runInit(): void {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
  const settingsPath = join(home, ".claude", "settings.json");

  mergeHookConfig(settingsPath);

  const hookNames = Object.keys(AGENTWATCH_HOOKS).join(", ");

  console.log("✓ Wrote Claude Code hook config to ~/.claude/settings.json");
  console.log(`  Hooks configured: ${hookNames}`);
  console.log(`  Target: ${HOOK_URL}`);
  console.log("");
  console.log("  Start the server with: npx agentwatch-dev");
  console.log(
    "  Then use Claude Code normally — events will appear in the dashboard.",
  );
}
