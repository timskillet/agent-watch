# AgentWatch examples

Runnable demonstrations of both ingestion paths. Dependencies are isolated
from the workspace — install from **this folder**, not the repo root.

```bash
cd examples
npm install
```

Make sure the AgentWatch server is running in another terminal:

```bash
# from the repo root
node apps/server/dist/index.js
```

Then pick a demo:

| File | What it shows |
|------|---------------|
| [`claude-code-demo.md`](./claude-code-demo.md) | Start-to-finish walkthrough for the Claude Code hook path — no code to run, just follow along. |
| [`langchain-demo.ts`](./langchain-demo.ts) | A `retrieve → chat → parse` chain emitted as the same span shape LangChain + OTel auto-instrumentation produces. `npx tsx langchain-demo.ts` |
| [`custom-otel-agent.ts`](./custom-otel-agent.ts) | Manual `@opentelemetry/sdk-node` setup emitting `gen_ai.*` spans directly. `npx tsx custom-otel-agent.ts` |
| [`agentwatch.config.json`](./agentwatch.config.json) | Reference per-project config file (see `packages/sdk/README.md`). |

After running either TS demo, open `http://localhost:5173` — the runs
table should show the new service; click through to inspect the trace.
