import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mergeHookConfig, runInit } from "../init.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `agentwatch-init-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("mergeHookConfig", () => {
  it("creates settings.json if it does not exist", () => {
    const settingsPath = join(tmpDir, "settings.json");

    mergeHookConfig(settingsPath);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].url).toBe(
      "http://localhost:4318/hooks",
    );
  });

  it("preserves existing settings when merging", () => {
    const settingsPath = join(tmpDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        permissions: { allow: ["Read", "Write"] },
        env: { DEBUG: "true" },
      }),
    );

    mergeHookConfig(settingsPath);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.permissions).toEqual({ allow: ["Read", "Write"] });
    expect(settings.env).toEqual({ DEBUG: "true" });
    expect(settings.hooks).toBeDefined();
  });

  it("appends to existing hooks without clobbering", () => {
    const settingsPath = join(tmpDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo pre-tool" }],
            },
          ],
        },
      }),
    );

    mergeHookConfig(settingsPath);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("echo pre-tool");
    expect(settings.hooks.PreToolUse[1].hooks[0].url).toBe(
      "http://localhost:4318/hooks",
    );
  });

  it("does not duplicate if agentwatch hook already exists", () => {
    const settingsPath = join(tmpDir, "settings.json");

    mergeHookConfig(settingsPath);
    mergeHookConfig(settingsPath);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks.PreToolUse).toHaveLength(1);
  });

  it("registers all expected hook event types", () => {
    const settingsPath = join(tmpDir, "settings.json");

    mergeHookConfig(settingsPath);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const expectedEvents = [
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "SessionStart",
      "SessionEnd",
      "UserPromptSubmit",
      "Stop",
      "SubagentStop",
    ];
    for (const event of expectedEvents) {
      expect(settings.hooks[event]).toBeDefined();
      expect(settings.hooks[event].length).toBeGreaterThan(0);
    }
  });

  it("sets async on non-session-boundary events only", () => {
    const settingsPath = join(tmpDir, "settings.json");

    mergeHookConfig(settingsPath);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks.SessionStart[0].hooks[0].async).toBeUndefined();
    expect(settings.hooks.SessionEnd[0].hooks[0].async).toBeUndefined();
    expect(settings.hooks.PreToolUse[0].hooks[0].async).toBe(true);
    expect(settings.hooks.PostToolUse[0].hooks[0].async).toBe(true);
    expect(settings.hooks.Stop[0].hooks[0].async).toBe(true);
  });

  it("throws on corrupt JSON instead of silently overwriting", () => {
    const settingsPath = join(tmpDir, "settings.json");
    writeFileSync(settingsPath, "{ invalid json");

    expect(() => mergeHookConfig(settingsPath)).toThrow();
  });
});

describe("runInit output", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it("prints the spec confirmation block including the hook URL and next-steps", () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });

    runInit();

    spy.mockRestore();

    const joined = logs.join("\n");
    expect(logs[0]).toBe(
      "✓ Wrote Claude Code hook config to ~/.claude/settings.json",
    );
    expect(joined).toContain("Hooks configured:");
    expect(joined).toContain("PreToolUse");
    expect(joined).toContain("SessionStart");
    expect(joined).toContain("Target: http://localhost:4318/hooks");
    expect(joined).toContain("Start the server with: npx agentwatch-dev");
    expect(joined).toContain(
      "Then use Claude Code normally — events will appear in the dashboard.",
    );
  });
});
