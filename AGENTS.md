# AgentWatch — AI Agent Instructions

AgentWatch is an observability SDK and dashboard for AI agent pipelines. It is structured as a pnpm + Turborepo monorepo with four packages:

- `packages/types` (`@agentwatch/types`) — shared event schema
- `packages/sdk` (`agentwatch`) — instrumentation SDK
- `apps/server` (`agentwatch-dev`) — Fastify ingest server + SQLite store
- `apps/web` (`agentwatch-web`) — React dashboard (Vite)

## Conventions

- **Commits and PRs** follow [Conventional Commits](https://www.conventionalcommits.org/)
- **TypeScript** throughout — strict mode, ES2022 target, NodeNext resolution
- **Build order**: types → sdk → server/web (enforced by Turborepo `^build`)

## Skills

Agent skills live in `.agents/skills/`. Each skill has a `SKILL.md` with instructions.

| Skill | Path | Purpose |
|-------|------|---------|
| Code Review | `.agents/skills/code-review/SKILL.md` | PR review guidelines |
