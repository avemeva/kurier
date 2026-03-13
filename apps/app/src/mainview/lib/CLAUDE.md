## Utilities

This directory contains presentation utilities (format, log, markdown, media-sizing, scroll, theme, utils). The data layer (store, types, telegram, session) has moved to `@/data` — see `data/CLAUDE.md`.

### Files

| File | Purpose |
|------|---------|
| `format.ts` | Time/date formatting (`formatTime`, `formatLastSeen`) |
| `log.ts` | Logger instances (`log`, `telegramLog`) |
| `markdown.ts` | Markdown stripping |
| `media-sizing.ts` | Media dimension calculations (`computeMediaSize`, `computeAlbumLayout`) |
| `scroll-to-message.ts` | Scroll-to-message utility |
| `theme.ts` | Theme store |
| `utils.ts` | General utils (`cn` for classnames) |

## Store Responsibilities (reference — store now lives in `data/store/`)

The store is the application state machine between TDLib and the UI.

| # | Responsibility | Description |
|---|---------------|-------------|
| 1 | **Hold raw state** | Store TDLib objects as received. No transformation, no UI concerns. The store is the single source of truth for what TDLib has told us. |
| 2 | **Orchestrate actions** | When the user does something (open chat, send message), coordinate the multi-step TDLib call sequence and update state atomically at each stage. |
| 3 | **Handle real-time events** | Receive TDLib push events and route them to the correct state mutations — append message, update unread count, set typing indicator, etc. |
| 4 | **Track async bookkeeping** | Maintain loading flags, pagination cursors, and window position state so the UI knows what's loaded, what's available, and where we are in the message history. |
| 5 | **Optimistic updates** | For latency-sensitive actions (send, react), update state immediately before TDLib confirms, and reconcile or rollback on response. |
| 6 | **Deduplication & caching** | Prevent redundant TDLib calls — cached messages skip fetching, requested photos/media/thumbnails are tracked to avoid double-fetches. |
| 7 | **Make transitions explicit** | Every state change that the UI might need to react to must be a visible, unambiguous state transition — not a silent default or a stale leftover from a previous session. |
| 8 | **Resolve missing references** | When loaded data references entities we don't have yet (unknown users in messages, reply targets, forward sources), lazily fetch and backfill them so the UI can render complete information. |
| 9 | **Transform at the read boundary** | Selectors convert raw TDLib types into TG-facing types. The UI never sees TDLib objects — only clean, pre-computed view models. |
| 10 | **Manage ephemeral UI state** | Search queries, search results, typing timers, online status expiry timers — transient state that isn't persisted but drives UI rendering. |
