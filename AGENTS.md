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

## See also

- `CLAUDE.md` — project instructions for Claude Code and Claude PR reviews
