import { readFileSync } from "fs";
import { isAbsolute, join, normalize, sep } from "path";
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
    const safeCwd = safeResolveCwd(cwd);
    if (safeCwd === null) return null;
    const t = now();
    const hit = cache.get(safeCwd);
    if (hit !== undefined && t - hit.loadedAt < TTL_MS) return hit.config;

    const filePath = join(safeCwd, CONFIG_FILENAME);
    let config: ProjectConfig | null = null;
    try {
      const raw = readFile(filePath);
      config = JSON.parse(raw) as ProjectConfig;
      store.upsertProjectConfig(safeCwd, raw, t);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    cache.set(safeCwd, { config, loadedAt: t });
    return config;
  }

  function shouldCapturePromptContent(cwd: string): boolean {
    // Swallow malformed-JSON / unexpected errors so a broken config in one
    // project doesn't 500 the hooks endpoint for every subsequent event.
    // `loadConfigForCwd` still throws (tests verify retry-on-parse-error); the
    // re-throw is intentional for direct callers that want to surface it.
    try {
      return loadConfigForCwd(cwd)?.capturePromptContent === true;
    } catch {
      return false;
    }
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

/**
 * `cwd` comes from the hook payload (HTTP body), so we treat it as untrusted
 * and refuse anything that isn't an absolute, normalized path. Relative paths
 * (which would resolve against the server's cwd) and paths that still contain
 * `..` after normalization are rejected.
 */
function safeResolveCwd(cwd: string): string | null {
  if (!cwd || typeof cwd !== "string") return null;
  if (!isAbsolute(cwd)) return null;
  const normalized = normalize(cwd);
  if (normalized.split(sep).includes("..")) return null;
  return normalized;
}
