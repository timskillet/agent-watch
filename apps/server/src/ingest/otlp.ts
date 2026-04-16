import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import type { AgentWatchEvent } from "@agentwatch/types";
import type { SQLiteEventStore } from "../store.js";
import { nextSequence } from "./sequence.js";

// ---------------------------------------------------------------------------
// OTLP JSON wire-format types (stable spec — defined locally to avoid
// depending on @opentelemetry/otlp-transformer's internal/experimental exports)
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

export function normalizeOtelSpan(
  span: OtlpSpan,
  resource: OtlpResource | undefined,
): AgentWatchEvent[] {
  const operationName = getAttr(span.attributes, "gen_ai.operation.name");
  const resourceAttrs = resource?.attributes;

  const sessionId =
    getAttr(span.attributes, "gen_ai.conversation.id") ?? span.traceId;
  const agentId =
    getAttr(span.attributes, "gen_ai.agent.name") ??
    getAttr(resourceAttrs, "service.name") ??
    "unknown";
  const pipelineDefinitionId = getAttr(resourceAttrs, "service.name");

  const startNano = BigInt(span.startTimeUnixNano);
  const endNano = BigInt(span.endTimeUnixNano);
  const timestamp = Number(startNano / 1_000_000n);
  const durationMs = Number((endNano - startNano) / 1_000_000n);

  const isError = span.status?.code === 2;

  const baseMeta: Record<string, unknown> = {
    ingestion_source: "otlp",
    otel_trace_id: span.traceId,
    otel_span_id: span.spanId,
  };

  function base(
    overrides?: Partial<AgentWatchEvent>,
  ): Omit<AgentWatchEvent, "type" | "payload"> {
    return {
      id: randomUUID(),
      agentId,
      sessionId,
      pipelineDefinitionId,
      sequence: nextSequence(sessionId),
      level: isError ? "error" : "info",
      timestamp,
      durationMs,
      meta: { ...baseMeta },
      ...overrides,
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

    return [
      {
        ...base(),
        type: "error",
        payload: { message: errorMsg, stack: errorStack },
      } as AgentWatchEvent,
    ];
  }

  switch (operationName) {
    case "chat": {
      const model = getAttr(span.attributes, "gen_ai.request.model") ?? "";
      const inputTokens =
        getNumAttr(span.attributes, "gen_ai.usage.input_tokens") ?? 0;
      const outputTokens =
        getNumAttr(span.attributes, "gen_ai.usage.output_tokens") ?? 0;

      return [
        {
          ...base(),
          type: "llm_call",
          payload: { "gen_ai.request.model": model },
        } as AgentWatchEvent,
        {
          ...base(),
          type: "llm_response",
          payload: {
            "gen_ai.response.model": model,
            "gen_ai.usage.input_tokens": inputTokens,
            "gen_ai.usage.output_tokens": outputTokens,
          },
        } as AgentWatchEvent,
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
          {
            ...base(),
            type: "tool_call",
            payload: {
              "gen_ai.tool.name": toolName,
              "gen_ai.tool.call.id": toolCallId,
            },
          } as AgentWatchEvent,
          {
            ...base({ level: "error" }),
            type: "tool_error",
            payload: {
              "gen_ai.tool.name": toolName,
              "gen_ai.tool.call.id": toolCallId,
              error: errorMsg,
              stack: errorStack,
            },
          } as AgentWatchEvent,
        ];
      }

      const toolInput = getAttr(span.attributes, "gen_ai.tool.input");
      const toolOutput = getAttr(span.attributes, "gen_ai.tool.output");

      return [
        {
          ...base(),
          type: "tool_call",
          payload: {
            "gen_ai.tool.name": toolName,
            "gen_ai.tool.call.id": toolCallId,
            input: toolInput,
          },
        } as AgentWatchEvent,
        {
          ...base(),
          type: "tool_result",
          payload: {
            "gen_ai.tool.name": toolName,
            "gen_ai.tool.call.id": toolCallId,
            output: toolOutput,
          },
        } as AgentWatchEvent,
      ];
    }

    case "invoke_agent": {
      const agentName =
        getAttr(span.attributes, "gen_ai.agent.name") ?? agentId;
      const agentIdAttr =
        getAttr(span.attributes, "gen_ai.agent.id") ?? agentName;

      return [
        {
          ...base(),
          type: "agent_start",
          payload: {
            "gen_ai.agent.name": agentName,
            "gen_ai.agent.id": agentIdAttr,
          },
        } as AgentWatchEvent,
        {
          ...base(),
          type: "agent_end",
          payload: {
            "gen_ai.agent.name": agentName,
            "gen_ai.agent.id": agentIdAttr,
          },
        } as AgentWatchEvent,
      ];
    }

    case "create_agent": {
      const agentName =
        getAttr(span.attributes, "gen_ai.agent.name") ?? agentId;
      const agentIdAttr =
        getAttr(span.attributes, "gen_ai.agent.id") ?? agentName;

      return [
        {
          ...base(),
          type: "agent_start",
          payload: {
            "gen_ai.agent.name": agentName,
            "gen_ai.agent.id": agentIdAttr,
          },
        } as AgentWatchEvent,
      ];
    }

    default: {
      // Unknown operation → trace event with all attributes
      const allAttrs = collectAttrs(span.attributes);
      return [
        {
          ...base(),
          type: "trace",
          payload: { message: span.name, data: allAttrs },
        } as AgentWatchEvent,
      ];
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
      }

      return reply.send({ partialSuccess: {} });
    },
  );
}
