# Kurier

Bun monorepo. Workspaces: `packages/*`, `apps/*`.

## Architecture

```
TDLib (C++) → daemon (HTTP+SSE) → cli | app
```

Daemon is the **only** process that talks to TDLib. Everything else is an HTTP client.

Daemon does NOT: cache TDLib data, make policy decisions, transform data for UI, handle auth UI, contain business logic. If it could live in the client, it belongs in the client.

## Packages

| Package | Purpose |
|---------|---------|
| `@tg/protocol` | HTTP/SSE client for daemon communication |

## Apps

| App | Purpose |
|-----|---------|
| `daemon` | TDLib ↔ HTTP bridge |
| `cli` | Terminal client (no auth — that's the UI's job) |
| `app` | Electrobun desktop app (React, Vite, Zustand) |

## TDLib Types

Source of truth: `node_modules/@prebuilt-tdlib/types/tdlib-types.d.ts`
Always grep that file — do not search across `node_modules`.

## Dev

```sh
bun run dev:daemon   # daemon with --watch
bun run dev:app      # vite dev server
bun run cli          # run CLI (pass args after --)
```

## Linting

Biome, not ESLint. Auto-fix first, then check:

```sh
bun run lint:fix
bun run lint
```

## Testing

```sh
bun run test         # all workspace tests
bun run test:e2e     # cli e2e tests
bun run test:perf    # app perf tests (Playwright)
bun run typecheck    # all workspace type checks
```

## Conventions

- **Runtime:** Bun
- **Linter/formatter:** Biome
- **Types:** strict TypeScript, no `any`
- **Styling:** Tailwind v4, OKLCH color space
- **State:** Zustand
- **Components:** pure where possible (props → JSX, no hooks)
- **Tests:** `bun test` (daemon, cli), Vitest (app)

## Git Commits

Use conventional prefixes in commit messages: `[fix]`, `[bug]`, `[feat]`.

## Certainty Labels

ALWAYS label statements with certainty level when explaining, reporting findings, diagnosing issues, or making architectural assessments:
- `[fact]` — verified from code, docs, or output
- `[assumption]` — educated guess, not yet verified
- `[inference]` — logical conclusion derived from facts

No exceptions. Every claim gets a label.
