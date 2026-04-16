import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeOtelSpan,
  type OtlpSpan,
  type OtlpResource,
} from "../ingest/otlp.js";
import { resetSequences } from "../ingest/sequence.js";

beforeEach(() => {
  resetSequences();
});

function makeResource(serviceName: string): OtlpResource {
  return {
    attributes: [{ key: "service.name", value: { stringValue: serviceName } }],
  };
}

function makeSpan(overrides: Partial<OtlpSpan> = {}): OtlpSpan {
  return {
    traceId: "abc123def456",
    spanId: "span001",
    name: "test-span",
    startTimeUnixNano: "1700000000000000000",
    endTimeUnixNano: "1700000001500000000",
    attributes: [],
    ...overrides,
  };
}

const defaultResource = makeResource("my-langchain-app");

describe("normalizeOtelSpan", () => {
  describe("chat spans", () => {
    it("maps gen_ai.chat to llm_call + llm_response", () => {
      const span = makeSpan({
        name: "gen_ai.chat",
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
          { key: "gen_ai.usage.input_tokens", value: { intValue: 100 } },
          { key: "gen_ai.usage.output_tokens", value: { intValue: 50 } },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-42" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events).toHaveLength(2);

      const llmCall = events.find((e) => e.type === "llm_call");
      const llmResponse = events.find((e) => e.type === "llm_response");

      expect(llmCall).toBeDefined();
      expect(llmCall!.sessionId).toBe("conv-42");
      expect(llmCall!.pipelineDefinitionId).toBe("my-langchain-app");
      expect(llmCall!.level).toBe("info");
      expect(llmCall!.timestamp).toBe(1700000000000);
      expect(llmCall!.durationMs).toBe(1500);
      expect(llmCall!.payload).toMatchObject({
        "gen_ai.request.model": "gpt-4o",
      });
      expect(llmCall!.meta).toMatchObject({
        ingestion_source: "otlp",
        otel_trace_id: "abc123def456",
        otel_span_id: "span001",
      });

      expect(llmResponse).toBeDefined();
      expect(llmResponse!.sessionId).toBe("conv-42");
      expect(llmResponse!.payload).toMatchObject({
        "gen_ai.response.model": "gpt-4o",
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.output_tokens": 50,
      });
    });
  });

  describe("execute_tool spans", () => {
    it("maps execute_tool to tool_call + tool_result", () => {
      const span = makeSpan({
        name: "gen_ai.execute_tool",
        attributes: [
          {
            key: "gen_ai.operation.name",
            value: { stringValue: "execute_tool" },
          },
          {
            key: "gen_ai.tool.name",
            value: { stringValue: "web_search" },
          },
          {
            key: "gen_ai.tool.call.id",
            value: { stringValue: "call-99" },
          },
          {
            key: "gen_ai.tool.input",
            value: { stringValue: '{"query":"test"}' },
          },
          {
            key: "gen_ai.tool.output",
            value: { stringValue: "result data" },
          },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-1" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events).toHaveLength(2);

      const toolCall = events.find((e) => e.type === "tool_call");
      const toolResult = events.find((e) => e.type === "tool_result");

      expect(toolCall!.payload).toMatchObject({
        "gen_ai.tool.name": "web_search",
        "gen_ai.tool.call.id": "call-99",
        input: '{"query":"test"}',
      });
      expect(toolResult!.payload).toMatchObject({
        "gen_ai.tool.name": "web_search",
        output: "result data",
      });
    });

    it("maps execute_tool with ERROR status to tool_call + tool_error", () => {
      const span = makeSpan({
        name: "gen_ai.execute_tool",
        attributes: [
          {
            key: "gen_ai.operation.name",
            value: { stringValue: "execute_tool" },
          },
          {
            key: "gen_ai.tool.name",
            value: { stringValue: "web_search" },
          },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-1" },
          },
        ],
        status: { code: 2, message: "tool failed" },
        events: [
          {
            timeUnixNano: "1700000001000000000",
            name: "exception",
            attributes: [
              {
                key: "exception.message",
                value: { stringValue: "Connection refused" },
              },
              {
                key: "exception.stacktrace",
                value: {
                  stringValue: "Error: Connection refused\n  at ...",
                },
              },
            ],
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events).toHaveLength(2);

      const toolCall = events.find((e) => e.type === "tool_call");
      const toolError = events.find((e) => e.type === "tool_error");
      expect(toolCall).toBeDefined();
      expect(toolError!.level).toBe("error");
      expect(toolError!.payload).toMatchObject({
        error: "Connection refused",
        stack: "Error: Connection refused\n  at ...",
      });
    });
  });

  describe("agent spans", () => {
    it("maps invoke_agent to agent_start + agent_end", () => {
      const span = makeSpan({
        name: "gen_ai.invoke_agent",
        attributes: [
          {
            key: "gen_ai.operation.name",
            value: { stringValue: "invoke_agent" },
          },
          {
            key: "gen_ai.agent.name",
            value: { stringValue: "ResearchAgent" },
          },
          { key: "gen_ai.agent.id", value: { stringValue: "agent-7" } },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-1" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("agent_start");
      expect(events[1].type).toBe("agent_end");
      expect(events[0].payload).toMatchObject({
        "gen_ai.agent.name": "ResearchAgent",
        "gen_ai.agent.id": "agent-7",
      });
    });

    it("maps create_agent to agent_start only", () => {
      const span = makeSpan({
        name: "gen_ai.create_agent",
        attributes: [
          {
            key: "gen_ai.operation.name",
            value: { stringValue: "create_agent" },
          },
          {
            key: "gen_ai.agent.name",
            value: { stringValue: "PlannerAgent" },
          },
          { key: "gen_ai.agent.id", value: { stringValue: "agent-8" } },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-1" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("agent_start");
    });
  });

  describe("error spans", () => {
    it("maps non-tool ERROR span to error event", () => {
      const span = makeSpan({
        name: "some.operation",
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-1" },
          },
        ],
        status: { code: 2, message: "Internal error" },
        events: [
          {
            timeUnixNano: "1700000001000000000",
            name: "exception",
            attributes: [
              {
                key: "exception.message",
                value: { stringValue: "Model timeout" },
              },
              {
                key: "exception.stacktrace",
                value: { stringValue: "Error: Model timeout\n  at ..." },
              },
            ],
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      expect(events[0].level).toBe("error");
      expect(events[0].payload).toMatchObject({
        message: "Model timeout",
        stack: "Error: Model timeout\n  at ...",
      });
    });
  });

  describe("unknown spans", () => {
    it("maps span with no gen_ai.operation.name to trace event", () => {
      const span = makeSpan({
        name: "custom.span",
        attributes: [
          { key: "custom.attr", value: { stringValue: "value" } },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-1" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("trace");
      expect(events[0].payload).toMatchObject({
        message: "custom.span",
        data: {
          "custom.attr": "value",
          "gen_ai.conversation.id": "conv-1",
        },
      });
    });
  });

  describe("identity and metadata", () => {
    it("sessionId falls back to traceId when no conversation.id", () => {
      const span = makeSpan({
        traceId: "trace-fallback-id",
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events[0].sessionId).toBe("trace-fallback-id");
    });

    it("agentId falls back to service.name when no gen_ai.agent.name", () => {
      const span = makeSpan({
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-1" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, makeResource("my-service"));
      expect(events[0].agentId).toBe("my-service");
    });

    it("pipelineDefinitionId is derived from resource service.name", () => {
      const span = makeSpan({
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "conv-1" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, makeResource("pipeline-abc"));
      expect(events[0].pipelineDefinitionId).toBe("pipeline-abc");
    });

    it("durationMs is computed from span timestamps", () => {
      const span = makeSpan({
        startTimeUnixNano: "1700000000000000000",
        endTimeUnixNano: "1700000002500000000",
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events[0].durationMs).toBe(2500);
    });

    it("ingestion_source is 'otlp' on all events", () => {
      const span = makeSpan({
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      for (const event of events) {
        expect(event.meta).toMatchObject({ ingestion_source: "otlp" });
      }
    });

    it("otel_trace_id and otel_span_id are preserved in meta", () => {
      const span = makeSpan({
        traceId: "t-id-123",
        spanId: "s-id-456",
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      for (const event of events) {
        expect(event.meta).toMatchObject({
          otel_trace_id: "t-id-123",
          otel_span_id: "s-id-456",
        });
      }
    });

    it("sequence auto-increments within a session", () => {
      const span1 = makeSpan({
        attributes: [
          {
            key: "gen_ai.operation.name",
            value: { stringValue: "invoke_agent" },
          },
          { key: "gen_ai.agent.name", value: { stringValue: "A" } },
          { key: "gen_ai.agent.id", value: { stringValue: "a1" } },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "seq-session" },
          },
        ],
      });

      const events1 = normalizeOtelSpan(span1, defaultResource);
      // invoke_agent produces 2 events → sequences 1 and 2
      expect(events1[0].sequence).toBe(1);
      expect(events1[1].sequence).toBe(2);

      const span2 = makeSpan({
        attributes: [
          {
            key: "gen_ai.operation.name",
            value: { stringValue: "create_agent" },
          },
          { key: "gen_ai.agent.name", value: { stringValue: "B" } },
          { key: "gen_ai.agent.id", value: { stringValue: "b1" } },
          {
            key: "gen_ai.conversation.id",
            value: { stringValue: "seq-session" },
          },
        ],
      });

      const events2 = normalizeOtelSpan(span2, defaultResource);
      // Next event in same session → sequence 3
      expect(events2[0].sequence).toBe(3);
    });

    it("skips spans with malformed timestamps", () => {
      const span = makeSpan({
        startTimeUnixNano: "not-a-number",
        endTimeUnixNano: "1700000001500000000",
        attributes: [
          { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
          {
            key: "gen_ai.request.model",
            value: { stringValue: "gpt-4o" },
          },
        ],
      });

      const events = normalizeOtelSpan(span, defaultResource);
      expect(events).toHaveLength(0);
    });
  });
});
