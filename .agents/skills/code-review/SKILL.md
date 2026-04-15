# Code Review Skill

You are reviewing a pull request for the AgentWatch monorepo.

## Review checklist

1. **Conventional commits** — PR title must follow `type(scope): description` format. Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`. Scope is optional but encouraged (e.g., `sdk`, `server`, `web`, `types`).

2. **Correctness** — Look for bugs, logic errors, race conditions, and unhandled edge cases. Flag anything that could fail at runtime.

3. **TypeScript** — Strict mode is enforced. Check for `any` usage, missing types, and unsafe casts. Shared types belong in `@agentwatch/types`.

4. **Monorepo hygiene** — Cross-package imports must go through published exports, not relative paths. Workspace dependencies use `workspace:*` protocol.

5. **Scope** — Changes should be minimal and focused. Flag unrelated modifications, unnecessary refactors, or scope creep.

## Review format

- Be concise. Only flag real issues, not style preferences.
- For each issue, state what's wrong, why it matters, and suggest a fix.
- If the PR looks good, say so briefly. Don't pad with praise.
