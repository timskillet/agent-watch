import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SQLiteEventStore } from "../store.js";
import { createConfigLoader } from "../config/configLoader.js";

describe("configLoader", () => {
  let store: SQLiteEventStore;

  beforeEach(() => {
    store = new SQLiteEventStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("returns config and upserts project_configs on first read", () => {
    const readFile = vi.fn(() =>
      JSON.stringify({ project: "p", capturePromptContent: true }),
    );
    const loader = createConfigLoader(store, { readFile });
    const config = loader.loadConfigForCwd("/tmp/proj");

    expect(config).toEqual({ project: "p", capturePromptContent: true });
    expect(readFile).toHaveBeenCalledTimes(1);

    const row = store.getProjectConfig("/tmp/proj");
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.configJson)).toEqual({
      project: "p",
      capturePromptContent: true,
    });
  });

  it("returns null and caches the null when config file is missing", () => {
    const readFile = vi.fn(() => {
      const err = new Error("nope") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });
    const loader = createConfigLoader(store, { readFile });

    expect(loader.loadConfigForCwd("/tmp/no-config")).toBeNull();
    expect(loader.loadConfigForCwd("/tmp/no-config")).toBeNull();
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("throws on malformed JSON and does NOT cache (next call retries)", () => {
    let callCount = 0;
    const readFile = vi.fn(() => {
      callCount += 1;
      return "{not json";
    });
    const loader = createConfigLoader(store, { readFile });

    expect(() => loader.loadConfigForCwd("/tmp/bad")).toThrow();
    expect(() => loader.loadConfigForCwd("/tmp/bad")).toThrow();
    expect(callCount).toBe(2);
  });

  it("caches successful reads for 60 seconds", () => {
    let t = 1_000_000;
    const readFile = vi.fn(() => JSON.stringify({ project: "p" }));
    const loader = createConfigLoader(store, { readFile, now: () => t });

    loader.loadConfigForCwd("/tmp/p");
    t += 59_000;
    loader.loadConfigForCwd("/tmp/p");
    expect(readFile).toHaveBeenCalledTimes(1);

    t += 2_000; // now 61s later
    loader.loadConfigForCwd("/tmp/p");
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it("shouldCapturePromptContent: true only when flag set in config", () => {
    const readFile = vi.fn((path: string) => {
      if (path.includes("/yes/")) {
        return JSON.stringify({ project: "p", capturePromptContent: true });
      }
      if (path.includes("/no/")) {
        return JSON.stringify({ project: "p", capturePromptContent: false });
      }
      if (path.includes("/absent/")) {
        return JSON.stringify({ project: "p" });
      }
      const err = new Error("nope") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });
    const loader = createConfigLoader(store, { readFile });

    expect(loader.shouldCapturePromptContent("/yes/proj")).toBe(true);
    expect(loader.shouldCapturePromptContent("/no/proj")).toBe(false);
    expect(loader.shouldCapturePromptContent("/absent/proj")).toBe(false);
    expect(loader.shouldCapturePromptContent("/missing/proj")).toBe(false);
  });

  it("empty-string cwd returns null without reading disk", () => {
    const readFile = vi.fn(() => "{}");
    const loader = createConfigLoader(store, { readFile });
    expect(loader.loadConfigForCwd("")).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("shouldCapturePromptContent swallows malformed-JSON errors (returns false)", () => {
    const readFile = vi.fn(() => "{not json");
    const loader = createConfigLoader(store, { readFile });
    expect(loader.shouldCapturePromptContent("/tmp/broken")).toBe(false);
  });

  it("rejects relative cwd (refuses to resolve against server cwd)", () => {
    const readFile = vi.fn(() => "{}");
    const loader = createConfigLoader(store, { readFile });
    expect(loader.loadConfigForCwd("relative/path")).toBeNull();
    expect(loader.loadConfigForCwd("./local")).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects cwd containing path-traversal segments", () => {
    const readFile = vi.fn(() => "{}");
    const loader = createConfigLoader(store, { readFile });
    // `path.normalize` collapses interior `..`, but a path that begins with
    // `..` (relative) or ends up with `..` still left after normalization must
    // be rejected.
    expect(loader.loadConfigForCwd("../../../etc")).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("normalizes absolute cwd before caching + upserting (reads disk only once for equivalent paths)", () => {
    const readFile = vi.fn(() => JSON.stringify({ project: "p" }));
    const loader = createConfigLoader(store, { readFile });
    loader.loadConfigForCwd("/opt/proj");
    loader.loadConfigForCwd("/opt/./proj");
    loader.loadConfigForCwd("/opt/foo/../proj");
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(store.getProjectConfig("/opt/proj")).not.toBeNull();
  });
});
