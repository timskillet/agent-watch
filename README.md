# AgentWatch

Local-first observability for AI agent pipelines. AgentWatch ingests events
from two sources — Claude Code hooks and any OpenTelemetry-compatible
framework — into a local SQLite store, and renders them in a dashboard at
`http://localhost:5173`.

Everything runs on your machine. No accounts, no cloud, no egress.

## Quick start — Claude Code

```bash
git clone https://github.com/timskillet/agent-watch.git
cd agent-watch
pnpm install
pnpm build

# 1. Point Claude Code at AgentWatch (writes to ~/.claude/settings.json)
node apps/server/dist/index.js init

# 2. Run the ingest server + dashboard (two terminals)
node apps/server/dist/index.js    # terminal 1 — port 4318
pnpm --filter agentwatch-web dev  # terminal 2 — Vite on 5173
```

Use Claude Code normally. Open `http://localhost:5173` to see the session
render as it runs — tools, LLM calls, errors, retries, prompt boundaries.

## Quick start — OTLP

Any OpenTelemetry exporter pointed at `http://localhost:4318/v1/traces` will
ingest. No SDK required.

```ts
// your agent code
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  }),
});
sdk.start();
```

Spans carrying `gen_ai.*` attributes are mapped onto the dashboard's LLM/tool
event types; other spans render as generic traces. See
[`examples/langchain-demo.ts`](./examples/langchain-demo.ts) and
[`examples/custom-otel-agent.ts`](./examples/custom-otel-agent.ts) for
runnable end-to-end examples.

## Optional: per-project config

AgentWatch reads an optional `agentwatch.config.json` from each project's
working directory (the hook event's `cwd`). Today the only supported flag is
opt-in prompt content capture — off by default.

```json
{
  "project": "my-app",
  "capturePromptContent": true
}
```

See [`packages/sdk/README.md`](./packages/sdk/README.md) for details on the
privacy model and cache TTL.

## Dashboard

- **Runs Table** — all recent pipeline runs, filterable by project / time
  range. Select two rows to open the comparison view.
- **Session Waterfall** — per-session timeline; toggle between Events and
  Traces grouping.
- **Tool Breakdown** — tool-call frequency and latency distribution, with
  drilldown into individual calls.
- **Cost Trend** — token/cost over time, groupable by day/session/project.
- **Run Detail** (`/runs/:pipelineId`) — full trace tree, LLM activity,
  prompt preview.
- **Trace View** (`/runs/:pipelineId/agent/:agentId`) — a single prompt's
  execution bounded by `UserPromptSubmit` → `Stop`.
- **Compare** (`/compare?a=…&b=…`) — side-by-side diff of two runs.

## Architecture

Events flow `ingest → normalize → SQLite → query API → React dashboard`.
Two ingestion paths feed the same event schema:

- **`POST /hooks`** — Claude Code fires HTTP hooks (registered by
  `agentwatch-dev init`); `apps/server/src/ingest/normalizer.ts` maps each
  payload to one or more `AgentWatchEvent`s (`tool_call` / `tool_result`
  correlated by `tool_use_id`, `session_start` / `session_end`, etc.).
- **`POST /v1/traces`** — any OpenTelemetry exporter; spans with
  `gen_ai.*` attributes are translated into the same event types, while
  unrecognised spans land as generic `trace` events.

The event shape lives in `packages/types/src/index.ts`. Prompt-bounded
traces (one `UserPromptSubmit` → `Stop` window) are derived on read by
`apps/server/src/trace/buildTraces.ts` and memoised per `(pipelineId,
eventCount)`.

## Development

```bash
pnpm install              # install workspaces
pnpm build                # Turbo: types → sdk → server + web
pnpm dev                  # run server + Vite in parallel
pnpm test                 # vitest across all packages
pnpm typecheck            # tsc --noEmit
pnpm lint                 # eslint
```

### Packages

- `packages/types` — shared event schema
- `packages/sdk` — `defineConfig()` + config types (local, not published)
- `apps/server` — Fastify ingest server, SQLite store, query API
- `apps/web` — React + Vite dashboard

Cross-package imports go through published exports; workspace deps use the
`workspace:*` protocol. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description`.

## License

See [LICENSE](./LICENSE).
