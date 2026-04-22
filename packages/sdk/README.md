# agentwatch

The `agentwatch` SDK defines the `AgentWatchConfig` shape that
`agentwatch-dev` reads from each project's `agentwatch.config.json`.

## Config file

The server reads `agentwatch.config.json` from each project's `cwd` at
runtime:

```json
{
  "project": "my-app",
  "capturePromptContent": true
}
```

A fuller reference lives in
[`examples/agentwatch.config.json`](../../examples/agentwatch.config.json).

### defineConfig (authoring helper)

If you prefer to author the config in TypeScript and emit JSON from it,
`defineConfig()` is an identity helper that type-checks the object against
`AgentWatchConfig`:

```ts
import { defineConfig } from "agentwatch";

export default defineConfig({
  project: "my-app",
  capturePromptContent: true,
});
```

The runtime itself only reads the JSON form.

## Privacy — prompt content capture

By default, AgentWatch records only the **length** of each user prompt,
never the text itself. `UserPromptSubmit` payloads arrive at the server
with a full `prompt` field, but it is dropped at normalization time.

To opt in to full prompt text capture for a specific project, set
`capturePromptContent: true` in that project's
`agentwatch.config.json`:

```json
{
  "project": "my-app",
  "capturePromptContent": true
}
```

When the flag is on for a cwd, the server includes the raw prompt on
`user_prompt` events as `payload.promptText`, **capped at 8192 chars**.
The dashboard then shows the prompt text as each trace's headline
instead of the default "Prompt #N · K chars" fallback.

- The flag is **per project** (keyed by `cwd`). Different projects can
  opt in or out independently.
- Config changes are picked up within 60 seconds (in-memory cache TTL).
  Restart the server to force-reload.
- Disabling the flag after enabling it only affects **new events** —
  previously captured `promptText` remains in the SQLite store until
  purged manually.
- OTel-ingested traces are not affected by this flag in v1;
  `gen_ai.input.messages` capture is deferred.

## AgentWatchConfig

```ts
export interface AgentWatchConfig {
  project: string;
  tags?: string[];
  alerts?: AlertRule[];
  annotate?: AnnotationRule[];
  panels?: PanelDefinition[];
  capturePromptContent?: boolean;
}
```

The config file is read by the `agentwatch-dev` server on first event
per cwd and persisted to the local `project_configs` table.
