## Store Responsibilities

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
| 9 | **Transform at the read boundary** | Selectors convert raw TDLib types into UI-facing types. The UI never sees TDLib objects — only clean, pre-computed view models. |
| 10 | **Manage ephemeral UI state** | Search queries, search results, typing timers, online status expiry timers — transient state that isn't persisted but drives UI rendering. |

## Store Anti-Responsibilities

Things the store must NOT own. When you see these in the store, they are tech debt to be extracted — not patterns to follow.

| # | Anti-Responsibility | What it looks like today | Where it belongs |
|---|--------------------|--------------------------| ----------------|
| 1 | **Scroll position / scroll-to-bottom** | The store does not manage scroll, but `isAtLatest` defaults to `true` via `?? true` in the MessagePanel selector (line 49). This silent default violates responsibility #7 (explicit transitions) — the UI can't distinguish "we confirmed we're at latest" from "we haven't loaded anything yet." | `isAtLatest` should only be `true` when explicitly set by `openChat`, `loadLatestMessages`, or `loadNewerMessages`. The selector should default to `false`, not `true`. Scroll logic lives in the Panel (UI concern). |
| 2 | ~~**Side effects inside selectors**~~ | **RESOLVED.** Selectors are now pure. Side effects (media loading, reply resolution) are triggered from ChatView's useEffects, gated by IntersectionObserver visibility. | N/A |
| 3 | **Presentation text formatting** | `computeHeaderStatus` (lines 1773–1854) produces user-facing strings like `"150 members, 12 online"`. `actionLabel` (lines 1740–1771) maps `ChatAction` discriminants to display text. `formatCount` (line 274) does singular/plural formatting. | The store should expose raw data (`{ memberCount: 150, onlineCount: 12 }`). Components or a formatting utility layer produce display strings. |
| 4 | **Global scalar `loadingMessages`** | `loadingMessages` is a single `boolean`, not per-chat. Switching to a cached chat B while chat A is mid-fetch incorrectly gates UI on A's loading state. | Should be `loadingMessages: Record<number, boolean>` keyed by chatId. Or: only gate UI on `messages.length === 0`, not on `loadingMessages`. |
| 5 | **Duplicated fetch-messages code** | `openChat` (lines 516–534) and `openChatById` (lines 690–707) have near-identical fetch → reverse → set → fetchMissingUsers → markAsRead sequences. | Extract a shared `fetchAndSetMessages(chatId)` helper. `openChatById` should only resolve the chat object, then delegate to `openChat`. |
| 6 | **Module-level mutable memoization** | 30+ `_prev*` variables (lines 1603–1611, 1689–1693, 1732–1738, 1891–1896) for hand-rolled selector memoization. Fragile, hard to test, impossible to reset without `_resetForTests`. | Use Zustand's `useStore(selector, shallow)` or a proper `createSelector` utility. Memoization state should not leak into module scope. |
| 7 | **Module-level imperative timers** | `typingTimers` and `statusTimers` are `Map`s managed via `setTimeout`/`clearTimeout` in `handleUpdate`. These survive store resets and can't be tested without real time. | Timer lifecycle should be co-located with the state it manages — either inside the store's `set()` callbacks with a timer registry that `_resetForTests` can clear, or in a dedicated side-effect layer. |
| 8 | **Module-level dedup Sets** | `photoRequested`, `mediaRequested`, `thumbRequested`, `customEmojiRequested`, `userFetchRequested`, `replyPreviewRequested` — six `Set`s outside the store, partially cleared in `_resetForTests`. | Move into store state or into a dedicated `RequestTracker` that the store owns and can fully reset. |
| 9 | **Converting to UI types in actions** | `executeGlobalSearch` converts results to `UISearchResult[]` in the action (line 1417). This means `searchResults` stores UI types, not raw TDLib types — breaking responsibility #1 (hold raw state) and #9 (transform at the read boundary). | Store raw `Td.message[]` from search. Add a `selectSearchResults` selector that converts to `UISearchResult[]`. |
