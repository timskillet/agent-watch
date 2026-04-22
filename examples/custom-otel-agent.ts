/**
 * Manual OpenTelemetry instrumentation pointed at AgentWatch.
 *
 * Emits a small agent trace (chat → tool → tool → chat) using the
 * `gen_ai.*` semantic conventions that AgentWatch recognises. Every span
 * is translated into dashboard events; `gen_ai.conversation.id` groups
 * spans into a single session.
 *
 * Prereqs — from this folder:
 *   npm install
 *   (AgentWatch server running on port 4318)
 *
 * Run:
 *   npx tsx custom-otel-agent.ts
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { trace, SpanStatusCode } from "@opentelemetry/api";

const SERVICE_NAME = "custom-otel-agent-demo";
const CONVERSATION_ID = `demo-conv-${Date.now()}`;

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
  }),
  spanProcessor: new SimpleSpanProcessor(
    new OTLPTraceExporter({
      url: "http://localhost:4318/v1/traces",
    }),
  ),
});

sdk.start();

const tracer = trace.getTracer(SERVICE_NAME);

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function chatSpan(model: string, inputTokens: number, outputTokens: number): Promise<void> {
  const span = tracer.startSpan("gen_ai.chat");
  span.setAttributes({
    "gen_ai.operation.name": "chat",
    "gen_ai.conversation.id": CONVERSATION_ID,
    "gen_ai.request.model": model,
    "gen_ai.usage.input_tokens": inputTokens,
    "gen_ai.usage.output_tokens": outputTokens,
  });
  await sleep(120);
  span.end();
}

async function toolSpan(toolName: string, input: string, output: string): Promise<void> {
  const span = tracer.startSpan(`gen_ai.execute_tool.${toolName}`);
  span.setAttributes({
    "gen_ai.operation.name": "execute_tool",
    "gen_ai.conversation.id": CONVERSATION_ID,
    "gen_ai.tool.name": toolName,
    "gen_ai.tool.call.id": `call-${Math.random().toString(36).slice(2, 10)}`,
    "gen_ai.tool.input": input,
    "gen_ai.tool.output": output,
  });
  await sleep(45);
  span.end();
}

async function failingToolSpan(toolName: string): Promise<void> {
  const span = tracer.startSpan(`gen_ai.execute_tool.${toolName}`);
  span.setAttributes({
    "gen_ai.operation.name": "execute_tool",
    "gen_ai.conversation.id": CONVERSATION_ID,
    "gen_ai.tool.name": toolName,
    "gen_ai.tool.call.id": `call-${Math.random().toString(36).slice(2, 10)}`,
  });
  await sleep(25);
  span.setStatus({ code: SpanStatusCode.ERROR, message: "permission denied" });
  span.recordException(new Error("permission denied"));
  span.end();
}

async function main(): Promise<void> {
  console.log(`Sending trace for conversation ${CONVERSATION_ID} → http://localhost:4318/v1/traces`);

  await chatSpan("gpt-4o-mini", 420, 88);
  await toolSpan("search_docs", '{"q":"claude code hooks"}', '{"results":3}');
  await failingToolSpan("write_file");
  await chatSpan("gpt-4o-mini", 510, 140);

  // Flush exporter before exit.
  await sdk.shutdown();
  console.log(`Done. Open http://localhost:5173 and look for conversation ${CONVERSATION_ID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
