# AgentWatch

AgentWatch is an observability SDK and dashboard for AI agent pipelines. pnpm + Turborepo monorepo.

## Packages

- `packages/types` (`@agentwatch/types`) — shared event schema
- `packages/sdk` (`agentwatch`) — instrumentation SDK
- `apps/server` (`agentwatch-dev`) — Fastify ingest server + SQLite store
- `apps/web` (`agentwatch-web`) — React dashboard (Vite)

## Conventions

- **Commits and PRs** follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`
- Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`
- **TypeScript** throughout — strict mode, ES2022 target, NodeNext resolution
- **Build order**: types → sdk → server/web (enforced by Turborepo `^build`)
- Cross-package imports go through published exports, not relative paths
- Workspace dependencies use `workspace:*` protocol

## Code review guidelines

When reviewing pull requests:

- Check PR title follows conventional commits format
- Look for bugs, logic errors, and unhandled edge cases
- Flag `any` usage, missing types, and unsafe casts
- Ensure changes are minimal and focused — flag scope creep
- Be concise. Only flag real issues, not style preferences.
