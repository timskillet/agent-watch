import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import type {
  AgentWatchEvent,
  AgentWatchEventBase,
  EventLevel,
} from "@agentwatch/types";
import type { SQLiteEventStore } from "../store.js";
import { nextSequence, evictSession } from "./sequence.js";

// ---------------------------------------------------------------------------
// OTLP JSON wire-format types (stable spec, defined locally)
// ---------------------------------------------------------------------------

export interface OtlpExportTraceRequest {
  resourceSpans?: OtlpResourceSpans[];
}

export interface OtlpResourceSpans {
  resource?: OtlpResource;
  scopeSpans?: OtlpScopeSpans[];
}

export interface OtlpResource {
  attributes?: OtlpKeyValue[];
}

export interface OtlpScopeSpans {
  scope?: { name?: string; version?: string };
  spans?: OtlpSpan[];
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: OtlpKeyValue[];
  status?: { code?: number; message?: string };
  events?: OtlpSpanEvent[];
}

export interface OtlpSpanEvent {
  timeUnixNano: string;
  name: string;
  attributes?: OtlpKeyValue[];
}

export interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

export interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values?: OtlpAnyValue[] };
  kvlistValue?: { values?: OtlpKeyValue[] };
  bytesValue?: string;
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

function getAttr(
  attrs: OtlpKeyValue[] | undefined,
  key: string,
): string | undefined {
  const kv = attrs?.find((a) => a.key === key);
  if (!kv) return undefined;
  if (kv.value.stringValue != null) return kv.value.stringValue;
  if (kv.value.intValue != null) return String(kv.value.intValue);
  if (kv.value.doubleValue != null) return String(kv.value.doubleValue);
  if (kv.value.boolValue != null) return String(kv.value.boolValue);
  return undefined;
}

function getNumAttr(
  attrs: OtlpKeyValue[] | undefined,
  key: string,
): number | undefined {
  const kv = attrs?.find((a) => a.key === key);
  if (!kv) return undefined;
  if (kv.value.intValue != null) return Number(kv.value.intValue);
  if (kv.value.doubleValue != null) return kv.value.doubleValue;
  if (kv.value.stringValue != null) {
    const n = Number(kv.value.stringValue);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function collectAttrs(
  attrs: OtlpKeyValue[] | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!attrs) return result;
  for (const kv of attrs) {
    result[kv.key] =
      kv.value.stringValue ??
      kv.value.intValue ??
      kv.value.doubleValue ??
      kv.value.boolValue;
  }
  return result;
}

// ---------------------------------------------------------------------------
// normalizeOtelSpan
// ---------------------------------------------------------------------------

function parseNanos(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function event(
  base: AgentWatchEventBase,
  type: AgentWatchEvent["type"],
  payload: AgentWatchEvent["payload"],
): AgentWatchEvent {
  return { ...base, type, payload } as AgentWatchEvent;
}

export function normalizeOtelSpan(
  span: OtlpSpan,
  resource: OtlpResource | undefined,
): AgentWatchEvent[] {
  const startNano = parseNanos(span.startTimeUnixNano);
  const endNano = parseNanos(span.endTimeUnixNano);
  if (startNano === null || endNano === null) {
    return [];
  }

  const operationName = getAttr(span.attributes, "gen_ai.operation.name");
  const resourceAttrs = resource?.attributes;

  const sessionId =
    getAttr(span.attributes, "gen_ai.conversation.id") ?? span.traceId;
  const agentId =
    getAttr(span.attributes, "gen_ai.agent.name") ??
    getAttr(resourceAttrs, "service.name") ??
    "unknown";
  const pipelineDefinitionId = getAttr(resourceAttrs, "service.name");

  const timestamp = Number(startNano / 1_000_000n);
  const durationMs = Number((endNano - startNano) / 1_000_000n);

  const isError = span.status?.code === 2;
  const level: EventLevel = isError ? "error" : "info";

  const baseMeta: Record<string, unknown> = {
    ingestion_source: "otlp",
    otel_trace_id: span.traceId,
    otel_span_id: span.spanId,
  };

  function base(levelOverride?: EventLevel): AgentWatchEventBase {
    return {
      id: randomUUID(),
      agentId,
      sessionId,
      pipelineDefinitionId,
      sequence: nextSequence(sessionId),
      level: levelOverride ?? level,
      timestamp,
      durationMs,
      meta: { ...baseMeta },
    };
  }

  // ERROR spans — handle before operation-specific mapping
  if (isError && operationName !== "execute_tool") {
    const exceptionEvent = span.events?.find((e) => e.name === "exception");
    const errorMsg =
      getAttr(exceptionEvent?.attributes, "exception.message") ??
      span.status?.message ??
      span.name;
    const errorStack = getAttr(
      exceptionEvent?.attributes,
      "exception.stacktrace",
    );

    return [event(base(), "error", { message: errorMsg, stack: errorStack })];
  }

  switch (operationName) {
    case "chat": {
      const model = getAttr(span.attributes, "gen_ai.request.model") ?? "";
      const inputTokens =
        getNumAttr(span.attributes, "gen_ai.usage.input_tokens") ?? 0;
      const outputTokens =
        getNumAttr(span.attributes, "gen_ai.usage.output_tokens") ?? 0;

      return [
        event(base(), "llm_call", { "gen_ai.request.model": model }),
        event(base(), "llm_response", {
          "gen_ai.response.model": model,
          "gen_ai.usage.input_tokens": inputTokens,
          "gen_ai.usage.output_tokens": outputTokens,
        }),
      ];
    }

    case "execute_tool": {
      const toolName =
        getAttr(span.attributes, "gen_ai.tool.name") ?? span.name;
      const toolCallId = getAttr(span.attributes, "gen_ai.tool.call.id");

      if (isError) {
        const exceptionEvent = span.events?.find((e) => e.name === "exception");
        const errorMsg =
          getAttr(exceptionEvent?.attributes, "exception.message") ??
          span.status?.message ??
          "";
        const errorStack = getAttr(
          exceptionEvent?.attributes,
          "exception.stacktrace",
        );

        return [
          event(base(), "tool_call", {
            "gen_ai.tool.name": toolName,
            "gen_ai.tool.call.id": toolCallId,
          }),
          event(base("error"), "tool_error", {
            "gen_ai.tool.name": toolName,
            "gen_ai.tool.call.id": toolCallId,
            error: errorMsg,
            stack: errorStack,
          }),
        ];
      }

      const toolInput = getAttr(span.attributes, "gen_ai.tool.input");
      const toolOutput = getAttr(span.attributes, "gen_ai.tool.output");

      return [
        event(base(), "tool_call", {
          "gen_ai.tool.name": toolName,
          "gen_ai.tool.call.id": toolCallId,
          input: toolInput,
        }),
        event(base(), "tool_result", {
          "gen_ai.tool.name": toolName,
          "gen_ai.tool.call.id": toolCallId,
          output: toolOutput,
        }),
      ];
    }

    case "invoke_agent": {
      const agentName =
        getAttr(span.attributes, "gen_ai.agent.name") ?? agentId;
      const agentIdAttr =
        getAttr(span.attributes, "gen_ai.agent.id") ?? agentName;
      const agentPayload = {
        "gen_ai.agent.name": agentName,
        "gen_ai.agent.id": agentIdAttr,
      };

      return [
        event(base(), "agent_start", agentPayload),
        event(base(), "agent_end", agentPayload),
      ];
    }

    case "create_agent": {
      const agentName =
        getAttr(span.attributes, "gen_ai.agent.name") ?? agentId;
      const agentIdAttr =
        getAttr(span.attributes, "gen_ai.agent.id") ?? agentName;

      return [
        event(base(), "agent_start", {
          "gen_ai.agent.name": agentName,
          "gen_ai.agent.id": agentIdAttr,
        }),
      ];
    }

    default: {
      const allAttrs = collectAttrs(span.attributes);
      return [event(base(), "trace", { message: span.name, data: allAttrs })];
    }
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export function registerOtlpRoute(
  app: FastifyInstance,
  store: SQLiteEventStore,
): void {
  app.post<{ Body: OtlpExportTraceRequest }>(
    "/v1/traces",
    async (req, reply) => {
      const body = req.body;

      if (!body?.resourceSpans?.length) {
        return reply.send({ partialSuccess: {} });
      }

      const events: AgentWatchEvent[] = [];
      for (const rs of body.resourceSpans) {
        for (const ss of rs.scopeSpans ?? []) {
          for (const span of ss.spans ?? []) {
            events.push(...normalizeOtelSpan(span, rs.resource));
          }
        }
      }

      if (events.length > 0) {
        store.insert(events);

        // Evict sequence counters for sessions in this batch.
        // OTLP traces arrive as complete batches so counters aren't
        // needed beyond this request — prevents unbounded Map growth.
        const sessionIds = new Set(events.map((e) => e.sessionId));
        for (const sid of sessionIds) {
          evictSession(sid);
        }
      }

      return reply.send({ partialSuccess: {} });
    },
  );
}
