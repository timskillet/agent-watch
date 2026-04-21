# Claude Code demo — zero-config capture

Five minutes from clone to "I can see my session in the dashboard".

## 1. Install and build

```bash
git clone https://github.com/timskillet/agent-watch.git
cd agent-watch
pnpm install
pnpm build
```

## 2. Start the server and dashboard

Two terminals:

```bash
# terminal 1 — ingest server on port 4318
node apps/server/dist/index.js
```

```bash
# terminal 2 — dashboard on port 5173
pnpm --filter agentwatch-web dev
```

The server terminal should print a banner with both endpoints
(`POST /hooks`, `POST /v1/traces`) and the dashboard URL.

## 3. Wire up Claude Code hooks

```bash
node apps/server/dist/index.js init
```

This merges an AgentWatch HTTP hook into `~/.claude/settings.json` for each
Claude Code event (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, …).
Existing hooks are preserved.

Expected output:

```
✓ Wrote Claude Code hook config to ~/.claude/settings.json
  Hooks configured: PreToolUse, PostToolUse, PostToolUseFailure, SessionStart, SessionEnd, UserPromptSubmit, Stop, SubagentStop
  Target: http://localhost:4318/hooks

  Start the server with: npx agentwatch-dev
  Then use Claude Code normally — events will appear in the dashboard.
```

## 4. Use Claude Code

Open any project, start a Claude Code session, and ask it to do something
real — edit a file, run a test, search the codebase. Whenever an event
fires, Claude Code POSTs to `http://localhost:4318/hooks`; the server
stores it in `~/.agentwatch/events.db`.

The first event from a new session prints a single line in the server
terminal:

```
✓ Received hook event from Claude Code session <id> (project: <name>)
```

Further events from the same session are silent.

## 5. Open the dashboard

Visit `http://localhost:5173`. You should see:

- **Runs Table** — your session as a row. Click to open Run Detail.
- **Session Waterfall** — timeline of tool calls + LLM activity.
- **Tool Breakdown** — counts and latency by tool name.

Things worth noticing:

- Each tool run renders as a `PreToolUse → PostToolUse` pair with
  correlated durations.
- `PostToolUseFailure` events surface as red entries with the error message
  and stack trace.
- If you submit multiple prompts in one session, the trace view
  (`/runs/:pipelineId/agent/:agentId`) slices them per-prompt using
  `UserPromptSubmit → Stop` as boundaries.

## Opting into prompt content capture

By default, only the **length** of a user prompt is recorded. To capture the
text itself for a specific project, drop this into that project's
`agentwatch.config.json`:

```json
{
  "project": "my-app",
  "capturePromptContent": true
}
```

Changes are picked up within 60 seconds of the next event for that `cwd`.

## Reset

To stop AgentWatch, kill the two processes. To remove the hooks, edit
`~/.claude/settings.json` and delete the blocks whose URL is
`http://localhost:4318/hooks`. The event DB lives at
`~/.agentwatch/events.db` and can be deleted to start fresh.
