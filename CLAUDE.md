# Telegram AI v2

Bun monorepo. Workspaces: `packages/*`, `apps/*`.

## Architecture

```
TDLib (C++) → daemon (HTTP+SSE) → cli | app | web
```

The daemon is the **only** process that talks to TDLib. Everything else is an HTTP client.

## Daemon Responsibility

The daemon is a **thin transport layer** between TDLib and its HTTP clients. It:

1. **Owns the TDLib client** — single persistent connection, manages lifecycle
2. **Exposes TDLib over HTTP** — translates commands to `client.invoke()` calls
3. **Streams updates over SSE** — bridges `client.on('update')` to EventSource
4. **Serves media files** — returns files that TDLib has already downloaded
5. **Manages its own process** — PID files, idle timeout, graceful shutdown

The daemon does NOT:

- **Cache TDLib data** — TDLib has its own database; `getUser`/`getChat` are instant local lookups
- **Make policy decisions** — no auto-download, no "download if small", no prefetching
- **Transform data for UI** — it returns raw TDLib responses; clients transform as needed
- **Handle authentication UI** — it reports auth state; the UI/app drives the auth flow
- **Contain business logic** — commands are thin wrappers around TDLib API calls

If a behavior could live in the client, it belongs in the client. The daemon stays dumb.

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

## Commits

When lint/type/test errors block a commit: understand the root cause, fix it properly. No `// @ts-ignore`, no `any` casts, no disabling lint rules, no skipping tests to unblock a commit.

## Conventions

- **Runtime:** Bun
- **Linter/formatter:** Biome
- **Types:** strict TypeScript, no `any`
- **Styling:** Tailwind v4, OKLCH color space
- **State:** Zustand
- **Components:** pure where possible (props → JSX, no hooks)
- **Tests:** Vitest
