import { describe, it, expect } from "vitest";
import { createArrivalLogger } from "../ingest/arrivalLogger.js";

describe("createArrivalLogger", () => {
  it("logs a hook session once and deduplicates on repeat", () => {
    const lines: string[] = [];
    const logger = createArrivalLogger((m) => lines.push(m));

    logger.hook("sess-1", "/home/me/projects/agentwatch");
    logger.hook("sess-1", "/home/me/projects/agentwatch");
    logger.hook("sess-2", "/home/me/other");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("session sess-1");
    expect(lines[0]).toContain("project: agentwatch");
    expect(lines[1]).toContain("session sess-2");
    expect(lines[1]).toContain("project: other");
  });

  it("reports unknown project when cwd is missing", () => {
    const lines: string[] = [];
    const logger = createArrivalLogger((m) => lines.push(m));

    logger.hook("sess-x");

    expect(lines[0]).toContain("project: unknown");
  });

  it("logs OTLP service once and deduplicates on repeat", () => {
    const lines: string[] = [];
    const logger = createArrivalLogger((m) => lines.push(m));

    logger.otlp("svc-a", 3);
    logger.otlp("svc-a", 5);
    logger.otlp("svc-b", 1);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      '✓ Received OTLP trace from service "svc-a" (3 spans)',
    );
    expect(lines[1]).toBe(
      '✓ Received OTLP trace from service "svc-b" (1 span)',
    );
  });

  it("isolates hook and otlp dedup sets", () => {
    const lines: string[] = [];
    const logger = createArrivalLogger((m) => lines.push(m));

    logger.hook("shared-id");
    logger.otlp("shared-id", 1);

    expect(lines).toHaveLength(2);
  });
});
