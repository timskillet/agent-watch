import { basename } from "node:path";

export interface ArrivalLogger {
  hook(sessionId: string, cwd?: string): void;
  otlp(serviceName: string, spanCount: number): void;
}

export function createArrivalLogger(
  out: (msg: string) => void = console.log,
): ArrivalLogger {
  const seenHookSessions = new Set<string>();
  const seenOtlpServices = new Set<string>();

  return {
    hook(sessionId, cwd) {
      if (seenHookSessions.has(sessionId)) return;
      seenHookSessions.add(sessionId);
      const project = cwd ? basename(cwd) : "unknown";
      out(
        `✓ Received hook event from Claude Code session ${sessionId} (project: ${project})`,
      );
    },
    otlp(serviceName, spanCount) {
      if (seenOtlpServices.has(serviceName)) return;
      seenOtlpServices.add(serviceName);
      const spanWord = spanCount === 1 ? "span" : "spans";
      out(
        `✓ Received OTLP trace from service "${serviceName}" (${spanCount} ${spanWord})`,
      );
    },
  };
}
