/**
 * LangChain-style OTLP emission pointed at AgentWatch.
 *
 * To stay runnable without API keys or heavy deps, this file emits the same
 * span shape LangChain's OTel auto-instrumentation (e.g. OpenLLMetry,
 * Traceloop) produces for a simple RAG chain: `retrieve → chat → parse`.
 * Swap the span emission for a real `ChatOpenAI` call once you've wired
 * auto-instrumentation into your chain.
 *
 * Prereqs — from this folder:
 *   npm install
 *   (AgentWatch server running on port 4318)
 *
 * Run:
 *   npx tsx langchain-demo.ts
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { trace, context } from "@opentelemetry/api";

const SERVICE_NAME = "langchain-rag-demo";
const CONVERSATION_ID = `lc-conv-${Date.now()}`;
const QUESTION = "How does AgentWatch correlate Pre/Post tool events?";

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

async function runChain(): Promise<void> {
  const rootSpan = tracer.startSpan("langchain.chain.rag");
  rootSpan.setAttributes({
    "gen_ai.conversation.id": CONVERSATION_ID,
    "langchain.chain.name": "ConversationalRetrievalChain",
  });

  await context.with(trace.setSpan(context.active(), rootSpan), async () => {
    const retrieveSpan = tracer.startSpan("gen_ai.execute_tool.vector_search");
    retrieveSpan.setAttributes({
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.conversation.id": CONVERSATION_ID,
      "gen_ai.tool.name": "vector_search",
      "gen_ai.tool.call.id": "retrieve-1",
      "gen_ai.tool.input": QUESTION,
      "gen_ai.tool.output":
        '[{"doc":"hooks.md","chunk":"Pre/Post share a tool_use_id"}]',
    });
    await sleep(60);
    retrieveSpan.end();

    const chatSpan = tracer.startSpan("gen_ai.chat");
    chatSpan.setAttributes({
      "gen_ai.operation.name": "chat",
      "gen_ai.conversation.id": CONVERSATION_ID,
      "gen_ai.request.model": "gpt-4o-mini",
      "gen_ai.usage.input_tokens": 780,
      "gen_ai.usage.output_tokens": 210,
    });
    await sleep(180);
    chatSpan.end();

    const parseSpan = tracer.startSpan("gen_ai.execute_tool.output_parser");
    parseSpan.setAttributes({
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.conversation.id": CONVERSATION_ID,
      "gen_ai.tool.name": "output_parser",
      "gen_ai.tool.call.id": "parse-1",
      "gen_ai.tool.input": "<raw model output>",
      "gen_ai.tool.output": '{"answer":"tool_use_id correlates the pair"}',
    });
    await sleep(20);
    parseSpan.end();
  });

  rootSpan.end();
}

async function main(): Promise<void> {
  console.log(
    `Emitting LangChain-style trace for conversation ${CONVERSATION_ID} → http://localhost:4318/v1/traces`,
  );
  await runChain();
  await sdk.shutdown();
  console.log(
    `Done. Open http://localhost:5173 and look for service "${SERVICE_NAME}".`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
