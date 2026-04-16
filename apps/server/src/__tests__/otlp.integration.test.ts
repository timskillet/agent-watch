import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { SQLiteEventStore } from "../store.js";
import { registerOtlpRoute } from "../ingest/otlp.js";
import { registerHooksRoute } from "../ingest/hooks.js";
import { resetSequences } from "../ingest/sequence.js";
import { resetNormalizerState } from "../ingest/normalizer.js";

let app: ReturnType<typeof Fastify>;
let store: SQLiteEventStore;

beforeAll(async () => {
  store = new SQLiteEventStore(":memory:");
  app = Fastify();
  registerOtlpRoute(app, store);
  registerHooksRoute(app, store);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  store.close();
});

beforeEach(() => {
  resetSequences();
  resetNormalizerState();
});

function makeOtlpTracePayload(spans: object[], serviceName = "test-service") {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "test-scope" },
            spans,
          },
        ],
      },
    ],
  };
}

describe("POST /v1/traces", () => {
  it("accepts OTLP JSON and stores events in SQLite", async () => {
    const payload = makeOtlpTracePayload([
      {
        traceId: "int-trace-001",
        spanId: "int-span-001",
        name: "gen_ai.chat",
        startTimeUnixNano: "1700000000000000000",
        endTimeUnixNano: "1700000001000000000",
        attributes: [
          {
            key: "gen_ai.operation.name",
            value: { stringValue: "chat" },
          },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "claude-3" },
          },
          { key: "gen_ai.usage.input_tokens", value: { intValue: 200 } },
          { key: "gen_ai.usage.output_tokens", value: { intValue: 80 } },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "otlp-session-1" },
          },
        ],
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/v1/traces",
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ partialSuccess: {} });

    const events = store.getEvents({ sessionId: "otlp-session-1" });
    expect(events).toHaveLength(2);

    const llmCall = events.find((e) => e.type === "llm_call");
    const llmResponse = events.find((e) => e.type === "llm_response");
    expect(llmCall).toBeDefined();
    expect(llmResponse).toBeDefined();
    expect(llmCall!.pipelineDefinitionId).toBe("test-service");
  });

  it("returns 200 with partialSuccess for empty resourceSpans", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/traces",
      payload: { resourceSpans: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ partialSuccess: {} });
  });

  it("OTLP events coexist with hook events in the same DB", async () => {
    // Insert a hook event
    await app.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        type: "SessionStart",
        session_id: "hook-sess-coexist",
        cwd: "/app/my-project",
        timestamp: 1700000000000,
      },
    });

    // Insert an OTLP event
    const otlpPayload = makeOtlpTracePayload([
      {
        traceId: "coexist-trace",
        spanId: "coexist-span",
        name: "gen_ai.chat",
        startTimeUnixNano: "1700000000000000000",
        endTimeUnixNano: "1700000001000000000",
        attributes: [
          {
            key: "gen_ai.operation.name",
            value: { stringValue: "chat" },
          },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "otlp-sess-coexist" },
          },
        ],
      },
    ]);
    await app.inject({
      method: "POST",
      url: "/v1/traces",
      payload: otlpPayload,
    });

    // Query hook events
    const hookEvents = store.getEvents({ sessionId: "hook-sess-coexist" });
    expect(hookEvents).toHaveLength(1);
    expect(hookEvents[0].meta).toMatchObject({
      ingestion_source: "claude_code_hook",
    });

    // Query OTLP events
    const otlpEvents = store.getEvents({
      sessionId: "otlp-sess-coexist",
    });
    expect(otlpEvents.length).toBeGreaterThan(0);
    expect(otlpEvents[0].meta).toMatchObject({ ingestion_source: "otlp" });

    // Query by ingestion source filter
    const allOtlp = store.getEvents({ ingestionSource: "otlp" });
    expect(allOtlp.length).toBeGreaterThan(0);
  });
});
