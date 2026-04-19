import { readFile as fsReadFile } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, join, normalize, relative } from "path";
import type { SQLiteEventStore } from "../store.js";

/**
 * Minimal shape used by the server — the full `AgentWatchConfig` is owned by
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
  /**
   * Async — reads disk on cache miss. Concurrent calls for the same cwd
   * share a single in-flight promise. Throws on malformed JSON (callers
   * must handle). Returns `null` for unsafe cwds and missing config files.
   */
  loadConfigForCwd(cwd: string): Promise<ProjectConfig | null>;
  /**
   * Sync — reads the already-populated cache only. Returns `false` for a
   * cold cache; callers that need the correct value should `await
   * loadConfigForCwd(cwd)` first to warm it.
   */
  shouldCapturePromptContent(cwd: string): boolean;
  /** Test hook — forget cached entries so subsequent calls re-read disk. */
  resetCache(): void;
}

export interface ConfigLoaderOptions {
  now?: () => number;
  readFile?: (path: string) => Promise<string>;
  /** Override the allow-root (defaults to `os.homedir()`). Tests can point this anywhere. */
  allowRoot?: string | null;
}

export function createConfigLoader(
  store: SQLiteEventStore,
  opts: ConfigLoaderOptions = {},
): ConfigLoader {
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<ProjectConfig | null>>();
  const now = opts.now ?? Date.now;
  const readFile =
    opts.readFile ?? ((p: string) => fsReadFile(p, { encoding: "utf8" }));
  const allowRoot = opts.allowRoot === undefined ? homedir() : opts.allowRoot;

  async function loadConfigForCwd(cwd: string): Promise<ProjectConfig | null> {
    const safeCwd = safeResolveCwd(cwd, allowRoot);
    if (safeCwd === null) return null;
    const t = now();
    const hit = cache.get(safeCwd);
    if (hit !== undefined && t - hit.loadedAt < TTL_MS) return hit.config;

    const existing = inFlight.get(safeCwd);
    if (existing !== undefined) return existing;

    const promise = (async () => {
      try {
        const filePath = join(safeCwd, CONFIG_FILENAME);
        const raw = await readFile(filePath);
        const config = JSON.parse(raw) as ProjectConfig;
        store.upsertProjectConfig(safeCwd, raw, t);
        cache.set(safeCwd, { config, loadedAt: t });
        return config;
      } catch (err) {
        if (isEnoent(err)) {
          cache.set(safeCwd, { config: null, loadedAt: t });
          return null;
        }
        // Malformed JSON etc. — do NOT cache so the next call retries.
        throw err;
      } finally {
        inFlight.delete(safeCwd);
      }
    })();
    inFlight.set(safeCwd, promise);
    return promise;
  }

  function shouldCapturePromptContent(cwd: string): boolean {
    const safeCwd = safeResolveCwd(cwd, allowRoot);
    if (safeCwd === null) return false;
    const hit = cache.get(safeCwd);
    if (hit === undefined) return false;
    return hit.config?.capturePromptContent === true;
  }

  function resetCache(): void {
    cache.clear();
    inFlight.clear();
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
 * `cwd` comes from the hook payload (HTTP body), so we treat it as untrusted.
 * Reject anything that isn't (a) a non-empty string, (b) an absolute path, and
 * (c) contained within the allow-root (defaults to the server-process user's
 * home directory). `path.normalize` on an absolute path fully resolves any
 * `..` segments, so the allow-root check catches both literal `/etc` and
 * `/home/user/../../etc` (which normalizes to `/etc`).
 */
function safeResolveCwd(cwd: string, allowRoot: string | null): string | null {
  if (!cwd || typeof cwd !== "string") return null;
  if (!isAbsolute(cwd)) return null;
  if (allowRoot === null || allowRoot === "") return null;
  const normalized = normalize(cwd);
  const rel = relative(allowRoot, normalized);
  // `relative` returns "" when paths are equal, and a path starting with
  // `..` (or an absolute path on Windows) when `normalized` isn't under root.
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return normalized;
  }
  return null;
}
