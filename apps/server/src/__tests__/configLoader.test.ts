import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SQLiteEventStore } from "../store.js";
import { createConfigLoader } from "../config/configLoader.js";

const ROOT = "/home/user";

describe("configLoader", () => {
  let store: SQLiteEventStore;

  beforeEach(() => {
    store = new SQLiteEventStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("returns config and upserts project_configs on first read", async () => {
    const readFile = vi.fn(async () =>
      JSON.stringify({ project: "p", capturePromptContent: true }),
    );
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    const config = await loader.loadConfigForCwd(`${ROOT}/proj`);

    expect(config).toEqual({ project: "p", capturePromptContent: true });
    expect(readFile).toHaveBeenCalledTimes(1);

    const row = store.getProjectConfig(`${ROOT}/proj`);
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.configJson)).toEqual({
      project: "p",
      capturePromptContent: true,
    });
  });

  it("returns null and caches the null when config file is missing", async () => {
    const readFile = vi.fn(async () => {
      const err = new Error("nope") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });

    expect(await loader.loadConfigForCwd(`${ROOT}/no-config`)).toBeNull();
    expect(await loader.loadConfigForCwd(`${ROOT}/no-config`)).toBeNull();
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON (not cached — next call retries)", async () => {
    let callCount = 0;
    const readFile = vi.fn(async () => {
      callCount += 1;
      return "{not json";
    });
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });

    await expect(loader.loadConfigForCwd(`${ROOT}/bad`)).rejects.toThrow();
    await expect(loader.loadConfigForCwd(`${ROOT}/bad`)).rejects.toThrow();
    expect(callCount).toBe(2);
  });

  it("caches successful reads for 60 seconds", async () => {
    let t = 1_000_000;
    const readFile = vi.fn(async () => JSON.stringify({ project: "p" }));
    const loader = createConfigLoader(store, {
      readFile,
      now: () => t,
      allowRoot: ROOT,
    });

    await loader.loadConfigForCwd(`${ROOT}/p`);
    t += 59_000;
    await loader.loadConfigForCwd(`${ROOT}/p`);
    expect(readFile).toHaveBeenCalledTimes(1);

    t += 2_000; // now 61s later
    await loader.loadConfigForCwd(`${ROOT}/p`);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it("concurrent calls for the same cwd share a single in-flight disk read", async () => {
    let resolve!: (raw: string) => void;
    const readFile = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });

    const p1 = loader.loadConfigForCwd(`${ROOT}/p`);
    const p2 = loader.loadConfigForCwd(`${ROOT}/p`);
    const p3 = loader.loadConfigForCwd(`${ROOT}/p`);
    expect(readFile).toHaveBeenCalledTimes(1);

    resolve(JSON.stringify({ project: "p" }));
    const [c1, c2, c3] = await Promise.all([p1, p2, p3]);
    expect(c1).toEqual({ project: "p" });
    expect(c2).toBe(c1);
    expect(c3).toBe(c1);
  });

  it("shouldCapturePromptContent reads warmed cache (cold → false, warm → flag value)", async () => {
    const readFile = vi.fn(async (path: string) => {
      if (path.includes("/yes/")) {
        return JSON.stringify({ project: "p", capturePromptContent: true });
      }
      if (path.includes("/no/")) {
        return JSON.stringify({ project: "p", capturePromptContent: false });
      }
      return JSON.stringify({ project: "p" });
    });
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });

    // Cold cache defaults to false (including for cwds outside allowRoot).
    expect(loader.shouldCapturePromptContent(`${ROOT}/yes/proj`)).toBe(false);
    expect(loader.shouldCapturePromptContent("/etc")).toBe(false);

    // Warm the cache via loadConfigForCwd.
    await loader.loadConfigForCwd(`${ROOT}/yes/proj`);
    await loader.loadConfigForCwd(`${ROOT}/no/proj`);
    await loader.loadConfigForCwd(`${ROOT}/absent/proj`);

    expect(loader.shouldCapturePromptContent(`${ROOT}/yes/proj`)).toBe(true);
    expect(loader.shouldCapturePromptContent(`${ROOT}/no/proj`)).toBe(false);
    expect(loader.shouldCapturePromptContent(`${ROOT}/absent/proj`)).toBe(
      false,
    );
  });

  it("shouldCapturePromptContent is safe on malformed JSON (never throws, returns false)", async () => {
    const readFile = vi.fn(async () => "{not json");
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    // The malformed config failed to cache, so shouldCapturePromptContent
    // sees a cold cache and returns false synchronously without throwing.
    await expect(loader.loadConfigForCwd(`${ROOT}/broken`)).rejects.toThrow();
    expect(() =>
      loader.shouldCapturePromptContent(`${ROOT}/broken`),
    ).not.toThrow();
    expect(loader.shouldCapturePromptContent(`${ROOT}/broken`)).toBe(false);
  });

  it("empty-string cwd returns null without reading disk", async () => {
    const readFile = vi.fn(async () => "{}");
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    expect(await loader.loadConfigForCwd("")).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects relative cwd (refuses to resolve against server cwd)", async () => {
    const readFile = vi.fn(async () => "{}");
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    expect(await loader.loadConfigForCwd("relative/path")).toBeNull();
    expect(await loader.loadConfigForCwd("./local")).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects relative path-traversal (caught by the isAbsolute guard)", async () => {
    const readFile = vi.fn(async () => "{}");
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    expect(await loader.loadConfigForCwd("../../../etc")).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects absolute paths that normalize out of the allow-root (e.g. /home/user/../../etc)", async () => {
    const readFile = vi.fn(async () => "{}");
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    // `/home/user/../../etc` normalizes to `/etc`, which the allow-root check rejects.
    expect(await loader.loadConfigForCwd(`${ROOT}/../../etc`)).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects absolute cwd outside the allow-root (e.g. /etc)", async () => {
    const readFile = vi.fn(async () => "{}");
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    expect(await loader.loadConfigForCwd("/etc")).toBeNull();
    expect(await loader.loadConfigForCwd("/var/log")).toBeNull();
    // Near-miss: prefix-sharing but different root (no trailing separator).
    expect(await loader.loadConfigForCwd("/home/userX/proj")).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects all cwds when allow-root is null (no HOME env)", async () => {
    const readFile = vi.fn(async () => "{}");
    const loader = createConfigLoader(store, {
      readFile,
      allowRoot: null,
    });
    expect(await loader.loadConfigForCwd("/home/user/proj")).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("normalizes absolute cwd before caching + upserting (reads disk only once for equivalent paths)", async () => {
    const readFile = vi.fn(async () => JSON.stringify({ project: "p" }));
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    await loader.loadConfigForCwd(`${ROOT}/proj`);
    await loader.loadConfigForCwd(`${ROOT}/./proj`);
    await loader.loadConfigForCwd(`${ROOT}/foo/../proj`);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(store.getProjectConfig(`${ROOT}/proj`)).not.toBeNull();
  });

  it("accepts the allow-root itself as a valid cwd", async () => {
    const readFile = vi.fn(async () => JSON.stringify({ project: "root" }));
    const loader = createConfigLoader(store, { readFile, allowRoot: ROOT });
    const config = await loader.loadConfigForCwd(ROOT);
    expect(config).toEqual({ project: "root" });
  });
});
