# Data Package

Single import point for all Telegram data access. Components import selectors, hooks, UI types, and action refs from `@/data` — never raw TDLib types, internal converter functions, or cache dicts.

## Package Structure

```
data/
├── index.ts          # Public API — the only import point for components
├── telegram.ts       # TDLib client wrapper (auth, fetch, media, SSE)
├── session.ts        # Session storage (RPC or HTTP)
├── store/            # Zustand store, selectors, types
│   ├── index.ts      # Re-exports for store internals
│   ├── store.ts      # Zustand store implementation
│   ├── selectors.ts  # Memoized selectors (raw → UI)
│   ├── types.ts      # ChatState interface, initial state
│   ├── create-selector.ts
│   ├── request-tracker.ts
│   └── timer-registry.ts
├── types/            # UI type definitions, converters
│   ├── index.ts      # Re-exports all UI types + converters
│   ├── ui.ts         # UI type definitions
│   └── convert.ts    # TDLib → UI type converters
└── hooks/            # Data-loading hooks (not UI hooks)
    ├── useMessageMediaLoader.ts
    └── useSidebarPhotoLoader.ts
```

## Responsibilities

1. Hold raw TDLib state (chats, messages, users)
2. Orchestrate actions (open chat, send message, search)
3. Handle real-time TDLib push events
4. Track async bookkeeping (loading flags, pagination cursors)
5. Optimistic updates (send, react)
6. Deduplication and caching (photos, media, thumbnails)
7. Transform at the read boundary via selectors (raw TDLib -> UI types)

## Anti-Responsibilities

- No scroll position management (UI concern)
- No presentation text formatting beyond what selectors produce
- No component-level rendering logic

## Public Interface

Components may only import from `@/data`. Everything else is internal.

### Selectors

| Export | Returns |
|--------|---------|
| `selectChatMessages` | `UIMessage[]` for the selected chat |
| `selectSelectedChat` | `UIChat \| null` for the selected chat |
| `selectHeaderStatus` | `HeaderStatus \| null` |
| `selectUIChats` | `UIChat[]` main chat list with hydrated avatarUrl, lastMessageThumbUrl, typingText |
| `selectUIArchivedChats` | `UIChat[]` archived chat list |
| `selectSearchResults` | `UISearchResult[]` |

### Loading Hooks

| Export | Purpose |
|--------|---------|
| `useChatMessageLoader(messages, visibleIds)` | Triggers media loads for visible messages |
| `useSidebarPhotoLoader(chats)` | Triggers avatar loads for chats without photos |

### Render Helpers

| Export | Purpose |
|--------|---------|
| `computeMessageState(msg, context)` | Pure function: UIMessage -> MessageRenderState |

### Store Hook

| Export | Purpose |
|--------|---------|
| `useChatStore` | Zustand store hook for subscribing to state and calling actions |
| `_resetForTests` | Reset store + selector caches (test-only) |

### Types

| Export | Purpose |
|--------|---------|
| `ChatState` | Full store state interface (for hooks that need imperative access) |
| `HeaderStatus` | Status union for chat header |
| `MessageRenderState` and variants | Return types from `computeMessageState` |

## How to Add New UI Types

1. Define the type in `data/types/ui.ts`
2. Export it from `data/types/index.ts`
3. If components need it, also re-export from `data/index.ts`

## How to Add New Selectors

1. Create the selector in `data/store/selectors.ts` using `createSelector`
2. Export from `data/store/index.ts`
3. Add `selector.reset()` call to `resetSelectors()`
4. The selector should return UI types, not raw TDLib types

## How to Add New Media Loading

1. Add the loading logic to `data/hooks/useMessageMediaLoader.ts` (for per-message media)
2. Or create a new hook in `data/hooks/` for bulk loading patterns (like `useSidebarPhotoLoader`)
3. Export through `data/store/index.ts` and `data/index.ts`
4. Use imperative `useChatStore.getState()` to avoid re-render cycles

## Rules

- Components never import from `@/data/store/types`, `@/data/store/store`, or `@/data/store/selectors` directly
- Components never import converter functions (`toUIUser`, `toUIChat`, etc.)
- Components never read raw cache dicts (`s.profilePhotos`, `s.thumbUrls`, `s.typingByChat`, `s.users`)
- Test files may import internals directly — the boundary is for production component code
- `EmojiStatusBadge` is an accepted exception: it reads `s.customEmojiUrls[documentId]` because it's a lazy-load leaf component
