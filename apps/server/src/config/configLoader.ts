import { readFileSync } from "fs";
import { join } from "path";
import type { SQLiteEventStore } from "../store.js";

/**
 * Minimal shape used by the server — the full `ProjectConfig` is owned by
 * the SDK package. We only care about `capturePromptContent` here.
 */
export interface ProjectConfig {
  capturePromptContent?: boolean;
  [key: string]: unknown;
}

const TTL_MS = 60_000;
const CONFIG_FILENAME = "agentwatch.config.json";

interface CacheEntry {
  config: ProjectConfig | null;
  loadedAt: number;
}

export interface ConfigLoader {
  loadConfigForCwd(cwd: string): ProjectConfig | null;
  shouldCapturePromptContent(cwd: string): boolean;
  /** Test hook — forget cached entries so subsequent calls re-read disk. */
  resetCache(): void;
}

export function createConfigLoader(
  store: SQLiteEventStore,
  opts: {
    now?: () => number;
    readFile?: (path: string) => string;
  } = {},
): ConfigLoader {
  const cache = new Map<string, CacheEntry>();
  const now = opts.now ?? Date.now;
  const readFile = opts.readFile ?? ((p: string) => readFileSync(p, "utf8"));

  function loadConfigForCwd(cwd: string): ProjectConfig | null {
    if (!cwd) return null;
    const t = now();
    const hit = cache.get(cwd);
    if (hit !== undefined && t - hit.loadedAt < TTL_MS) return hit.config;

    const filePath = join(cwd, CONFIG_FILENAME);
    let config: ProjectConfig | null = null;
    try {
      const raw = readFile(filePath);
      config = JSON.parse(raw) as ProjectConfig;
      store.upsertProjectConfig(cwd, raw, t);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    cache.set(cwd, { config, loadedAt: t });
    return config;
  }

  function shouldCapturePromptContent(cwd: string): boolean {
    return loadConfigForCwd(cwd)?.capturePromptContent === true;
  }

  function resetCache(): void {
    cache.clear();
  }

  return { loadConfigForCwd, shouldCapturePromptContent, resetCache };
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
