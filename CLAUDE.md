# Telegram AI v2

Bun monorepo. Workspaces: `packages/*`, `apps/*`.

## Architecture

```
TDLib (C++) → daemon (HTTP+SSE) → cli | app | web
```

Daemon is the **only** process that talks to TDLib. Everything else is an HTTP client.

Daemon does NOT: cache TDLib data, make policy decisions, transform data for UI, handle auth UI, contain business logic. If it could live in the client, it belongs in the client.

## Packages

| Package | Purpose |
|---------|---------|
| `@tg/types` | Shared TypeScript types (protocol, updates, errors) |
| `@tg/logger` | Structured logging with pluggable transports |
| `@tg/protocol` | HTTP/SSE client for daemon communication |
| `@tg/ui` | Pure React components (no data fetching) |
| `@tg/store` | Zustand state management |

## Apps

| App | Purpose |
|-----|---------|
| `daemon` | TDLib ↔ HTTP bridge |
| `cli` | Terminal client (no auth — that's the UI's job) |
| `app` | Electrobun desktop app |
| `web` | Vite web app |

## TDLib Types

Source of truth: `node_modules/@prebuilt-tdlib/types/tdlib-types.d.ts`
Always grep that file — do not search across `node_modules`.

## Conventions

- **Runtime:** Bun
- **Linter/formatter:** Biome
- **Types:** strict TypeScript, no `any`
- **Styling:** Tailwind v4, OKLCH color space
- **State:** Zustand
- **Components:** pure where possible (props → JSX, no hooks)
- **Tests:** Vitest

## Certainty Labels

ALWAYS label statements with certainty level when explaining, reporting findings, diagnosing issues, or making architectural assessments:
- `[fact]` — verified from code, docs, or output
- `[assumption]` — educated guess, not yet verified
- `[inference]` — logical conclusion derived from facts

No exceptions. Every claim gets a label.
