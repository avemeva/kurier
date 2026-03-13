# Store Interface Cleanup

## Goal

Bundle `lib/store/`, `lib/types/`, `lib/telegram.ts`, and `hooks/useMessageMediaLoader.ts` into a coherent package with an explicit public interface. Components import only UI types, selectors, hooks, and action refs — never raw TDLib dicts, raw `Td.*` types, or internal converter functions.

Today 6 components reach past the boundary and read raw store internals. After cleanup, the package exposes a small, typed surface and its internal `CLAUDE.md` tells AI agents what the package owns and how to extend it correctly.

Success criteria:
```
# No component imports raw Td types
grep -r "type { Td }" apps/app/src/mainview/components/ → 0 matches

# No component imports converter functions
grep -r "toUIUser\|toUIChat\|toUIContent\|toUIMessage\|groupAndConvert\|hydrateMessage\|buildReplyPreview\|extractForwardName\|extractServiceText" apps/app/src/mainview/components/ → 0 matches

# No component reads raw store dicts for rendering
grep -r "s\.profilePhotos\|s\.thumbUrls\|s\.typingByChat\|s\.users\.\|s\.customEmojiUrls\|s\.chats\b\|s\.archivedChats\b\|s\.mediaUrls\|s\.replyPreviews\|s\.pinnedPreviews" apps/app/src/mainview/components/ → 0 matches

# No component imports from internal store modules
grep -r "from '@/lib/store/types'\|from '@/lib/store/store'\|from '@/lib/store/selectors'" apps/app/src/mainview/components/ → 0 matches

bun run typecheck → exits 0
bun run test → exits 0
bun run lint → exits 0
```

## Current boundary violations

Every import that crosses from components into store/types internals, verified by grep:

| File | What it imports | From where | Violation |
|---|---|---|---|
| ChatSidebar.tsx:342 | `s.profilePhotos` | `useChatStore(s => s.profilePhotos)` | Raw cache dict for chat avatars |
| ChatSidebar.tsx:343 | `s.thumbUrls` | `useChatStore(s => s.thumbUrls)` | Raw cache dict for last msg thumbs |
| ChatSidebar.tsx:344 | `s.typingByChat` | `useChatStore(s => s.typingByChat)` | Raw typing dict, builds text inline |
| ChatSidebar.tsx:345 | `s.users` | `useChatStore(s => s.users)` | Raw `Map<userId, Td.user>` for typing names |
| ChatSidebar.tsx:380 | `s.chats` / `s.archivedChats` | `useChatStore(s => s.chats)` | Raw `Td.chat[]` to drive loadProfilePhoto useEffect |
| ChatSidebar.tsx:31 | `actionLabel` | `from '@/lib/store'` | Internal formatter for `Td.ChatAction` |
| ChatHeader.tsx:15 | `s.users.get(userId)` | `useChatStore(s => s.users.get(...))` | Raw `Td.user` for emoji status |
| ChatHeader.tsx:18 | `s.profilePhotos[id]` | `useChatStore(s => s.profilePhotos[...])` | Raw cache dict for header avatar |
| ChatHeader.tsx:7 | `toUIUser` | `from '@/lib/types'` | Internal converter function |
| EmojiStatusBadge.tsx:6 | `s.customEmojiUrls[id]` | `useChatStore(s => s.customEmojiUrls[...])` | Raw cache dict for emoji sticker info |
| ChatLayout.test.tsx:3 | `type { Td }` | `from '@/lib/types'` | Raw TDLib namespace in test |
| useMessageMediaLoader.ts:3 | `type { ChatState }` | `from '@/lib/store/types'` | Internal store type, bypasses index |
| PureMessageRow.tsx:34 | 7 UI content types | `from '@/lib/types'` | OK — these are public UI types |
| PureFormattedText.tsx:3 | `UITextEntity` | `from '@/lib/types'` | OK — public UI type |
| PureAlbumGrid.tsx:11 | `UIAlbumItem` | `from '@/lib/types'` | OK — public UI type |
| ChatView.tsx:8 | `UIMessage` | `from '@/lib/types'` | OK — public UI type |
| ChatSidebar.tsx:37 | `PeerInfo, UIChat, UISearchResult` | `from '@/lib/types'` | OK — public UI types |

## Architecture

### Current: scattered, no boundary

```
components/
  ├─ ChatSidebar  ──→ @/lib/store (selectors + 7 raw dict reads)
  │                ──→ @/lib/store (actionLabel internal fn)
  ├─ ChatHeader   ──→ @/lib/store (selectors + 2 raw dict reads)
  │                ──→ @/lib/types (toUIUser converter)
  ├─ ChatView     ──→ @/lib/store (selectors + scalar state + actions) ✓ clean
  │                ──→ @/hooks/useMessageMediaLoader ✓ clean
  ├─ EmojiStatus  ──→ @/lib/store (1 raw dict read + action)
  ├─ ComposeSearch──→ @/lib/store (scalar state + actions) ✓ clean
  ├─ ChatLayout   ──→ @/lib/store (scalar state + actions) ✓ clean
  ├─ PureMessageRow──→ @/lib/types (UI content types) ✓ clean
  └─ AuthScreen   ──→ @/lib/telegram (auth functions) — separate concern
```

### Target: explicit package boundary

```
@/data/                              ← the package
  ├─ index.ts                        ← public API: selectors, hooks, UI types, action types
  ├─ CLAUDE.md                       ← package responsibilities + rules for AI
  ├─ store/                          ← internal: Zustand store, actions, request-tracker
  ├─ types/                          ← internal: UI type defs, converters, fixtures
  ├─ telegram.ts                     ← internal: TDLib client wrapper
  └─ hooks/                          ← internal: useMessageMediaLoader, useSidebarPhotoLoader

components/
  ├─ ChatSidebar  ──→ @/data (selectUIChats, useSidebarPhotoLoader, UIChat)
  ├─ ChatHeader   ──→ @/data (selectSelectedChat, selectHeaderStatus, UIChat)
  ├─ ChatView     ──→ @/data (selectChatMessages, useChatMessageLoader, UIMessage)
  ├─ EmojiStatus  ──→ @/data (useEmojiStatus hook or stays as exception)
  ├─ PureMessageRow──→ @/data (UIMessage, UIContent, etc. — type-only imports)
  └─ AuthScreen   ──→ @/data (auth functions — or separate @/auth package)
```

### What the index.ts exposes

```typescript
// === Hook ===
export { useChatStore } from './store/store'

// === Selectors (state → UI types) ===
export { selectChatMessages }        // → UIMessage[]
export { selectSelectedChat }        // → UIChat | null
export { selectHeaderStatus }        // → HeaderStatus | null
export { selectUIChats }             // → UIChat[]
export { selectUIArchivedChats }     // → UIChat[]
export { selectSearchResults }       // → UISearchResult[]

// === Loading hooks ===
export { useChatMessageLoader }      // triggers media loads for visible messages
export { useSidebarPhotoLoader }     // triggers avatar loads for visible chats (new)

// === UI types (type-only exports) ===
export type { UIMessage, UIMessageBase, UIServiceMessage, UIPendingMessage }
export type { UIContent, UITextContent, UIPhotoContent, UIVideoContent, ... }
export type { UIChat, UISearchResult, UIUser, UIReplyPreview }
export type { UIMedia, UICaption, UIForward, UIReplyTo, UISender, UIWebPreview }
export type { UIAlbumItem, UIAlbumContent }
export type { UITextEntity, UIReaction, UIKeyboardRow, UIKeyboardButton }
export type { HeaderStatus }
export type { PeerInfo }
export type { MessageContentKind, ChatKind, TextEntityKind }

// === Render helpers (pure functions, no store dependency) ===
export { computeMessageState }       // UIMessage → MessageRenderState
export type { MessageRenderState, ... }

// === Auth (separate concern, could split later) ===
export { initialize, isAuthorized, logout }
export { onAuthUpdate, submitPhone, submitCode, submitPassword }
export type { AuthEvent, AuthStep }

// === Test-only ===
export { _resetForTests }
```

**NOT exported** (internal implementation details):
- `toUIUser`, `toUIChat`, `toUIContent`, `toUIMessage`, `groupAndConvert`, `hydrateMessage`
- `buildReplyPreview`, `extractForwardName`, `extractServiceText`, `extractText`
- `actionLabel`
- `selectSelectedDialog` (dead)
- `selectUIUser` (dead)
- `ChatState` type (internal)
- `createSelector` (internal)
- `request-tracker`, `timer-registry` (internal)
- Raw `Td` namespace re-export

## What's been done

- Message pipeline is clean: `selectChatMessages` → `UIMessage[]` → `useChatMessageLoader` → ChatView → PureMessageRow
- `computeMessageState` is a pure function, no store dependency
- All Pure* components have zero store access
- ChatView, ComposeSearch, ChatLayout only use selectors + scalar state + actions (clean)

## TODO

### Step 1: Hydrate `UIChat` with avatar, thumb, typing

Add fields so components stop reading raw dicts.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Add `avatarUrl: string \| undefined` to `UIChat` in `ui.ts` | `grep "avatarUrl" apps/app/src/mainview/lib/types/ui.ts` returns match | TODO |
| 1.2 | Add `lastMessageThumbUrl: string \| null` to `UIChat` | `grep "lastMessageThumbUrl" apps/app/src/mainview/lib/types/ui.ts` returns match | TODO |
| 1.3 | Add `typingText: string \| null` to `UIChat` — pre-formatted typing indicator | `grep "typingText" apps/app/src/mainview/lib/types/ui.ts` returns match | TODO |
| 1.4 | Update `selectUIChats`/`selectUIArchivedChats` to hydrate these from `profilePhotos`, `thumbUrls`, `typingByChat` + `users`. Move `actionLabel` formatting into the selector. | `bun run typecheck` exits 0 | TODO |
| 1.5 | Update `selectSelectedChat` to hydrate `avatarUrl` from `profilePhotos` | code inspection | TODO |
| 1.6 | `UIChat.user` already has `emojiStatusId` and `isPremium` — verify ChatHeader can get these from `selectedChat.user` instead of raw `s.users.get()` + `toUIUser()` | code inspection | TODO |
| 1.7 | `bun run typecheck` exits 0 | run command | TODO |

### Step 2: Create sidebar photo loading hook

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Create `useSidebarPhotoLoader(chats: UIChat[])` — iterates chats, calls `loadProfilePhoto(chat.id)` for those with `avatarUrl === undefined`. Uses `useChatStore.getState()` (imperative, not subscription). | hook exists in `hooks/` | TODO |
| 2.2 | `bun run typecheck` exits 0 | run command | TODO |

### Step 3: Update ChatSidebar — remove all raw state reads

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Replace `profilePhotos` dict read with `chat.avatarUrl` | `grep "s\.profilePhotos\|profilePhotos\[" apps/app/src/mainview/components/chat/ChatSidebar.tsx` → 0 | TODO |
| 3.2 | Replace `thumbUrls` dict read with `chat.lastMessageThumbUrl` | `grep "s\.thumbUrls\|thumbUrls\[" apps/app/src/mainview/components/chat/ChatSidebar.tsx` → 0 | TODO |
| 3.3 | Replace `typingByChat` + `users` + `actionLabel` with `chat.typingText` | `grep "typingByChat\|actionLabel\|s\.users" apps/app/src/mainview/components/chat/ChatSidebar.tsx` → 0 | TODO |
| 3.4 | Replace `rawChats` useEffect with `useSidebarPhotoLoader(chats)` | `grep "rawChats\|s\.chats\b\|s\.archivedChats\b" apps/app/src/mainview/components/chat/ChatSidebar.tsx` → 0 | TODO |
| 3.5 | `bun run typecheck` exits 0 | run command | TODO |
| 3.6 | `bun run test` exits 0 | run command | TODO |

### Step 4: Update ChatHeader — remove raw state reads

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Remove `s.users.get(userId)` + `toUIUser()` — use `selectedChat.user` directly | `grep "s\.users\|toUIUser" apps/app/src/mainview/components/chat/ChatHeader.tsx` → 0 | TODO |
| 4.2 | Remove `s.profilePhotos[avatarId]` — use `selectedChat.avatarUrl` | `grep "s\.profilePhotos\|profilePhotos\[" apps/app/src/mainview/components/chat/ChatHeader.tsx` → 0 | TODO |
| 4.3 | `bun run typecheck` exits 0 | run command | TODO |

### Step 5: Handle EmojiStatusBadge

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | EmojiStatusBadge reads `s.customEmojiUrls[documentId]` and calls `loadCustomEmojiUrl`. Decision: keep as-is (it's a lazy-load component like an image loader — the hook pattern doesn't apply to single-entity lookups) OR create a `useEmojiStatus(id)` hook that encapsulates both. | decision documented in code comment | TODO |
| 5.2 | `bun run typecheck` exits 0 | run command | TODO |

### Step 6: Create package index with explicit exports

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Decide package location: keep `@/lib/` with tighter index, or move to `@/data/`. Renaming is optional — the key is the index controls the boundary. | decision documented | TODO |
| 6.2 | Create/update `index.ts` with explicit exports matching the "What the index.ts exposes" list above | file exists | TODO |
| 6.3 | Move `useChatMessageLoader` + `computeMessageState` exports through the package index so components import from one place | `grep "from '@/hooks/useMessage'" apps/app/src/mainview/components/` → 0 (imports from package instead) | TODO |
| 6.4 | Remove dead exports: `selectSelectedDialog`, `selectUIUser`, `actionLabel`, `PendingMessage` type | `grep "selectSelectedDialog\|selectUIUser\|actionLabel" apps/app/src/mainview/lib/store/index.ts` → 0 | TODO |
| 6.5 | `bun run typecheck` exits 0 | run command | TODO |

### Step 7: Write package CLAUDE.md

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | Write `CLAUDE.md` inside the package directory defining: responsibilities, anti-responsibilities, public interface contract, how to add new UI types, how to add new selectors, how to add new media loading | file exists, contains all sections | TODO |
| 7.2 | Content must include the concrete export list so AI agents know what is public | `grep "selectChatMessages\|selectUIChats\|useChatMessageLoader" <package>/CLAUDE.md` returns matches | TODO |

### Step 8: Final verification

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 8.1 | No component imports raw Td types | `grep -r "type { Td }" apps/app/src/mainview/components/` → 0 | TODO |
| 8.2 | No component imports converter functions | `grep -r "toUIUser\|toUIChat\|groupAndConvert\|hydrateMessage" apps/app/src/mainview/components/` → 0 | TODO |
| 8.3 | No component reads raw store dicts for rendering | `grep -r "s\.profilePhotos\|s\.thumbUrls\|s\.typingByChat\|s\.users\.\|s\.customEmojiUrls\|s\.chats\b\|s\.archivedChats\b" apps/app/src/mainview/components/ --include="*.tsx"` → 0 (except EmojiStatusBadge if exempted) | TODO |
| 8.4 | No component imports from internal store modules | `grep -r "from '@/lib/store/types'\|from '@/lib/store/store'\|from '@/lib/store/selectors'" apps/app/src/mainview/components/` → 0 | TODO |
| 8.5 | Types pass | `bun run typecheck` exits 0 | TODO |
| 8.6 | Tests pass | `bun run test` exits 0 | TODO |
| 8.7 | Lint passes | `bun run lint` exits 0 | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- Run `bun run scripts/symbols.ts .` before starting to orient on the codebase.
- Read `CLAUDE.md` files in any directory before editing files there.
- Use `bun run`, not bare `bun test`.
- Steps must be executed in order (1→2→3→...→8). Each step depends on the previous.
- After each step, run `bun run typecheck` to verify no type errors were introduced.
- The sidebar's `selectUIChats` will re-run when `profilePhotos`, `thumbUrls`, or `typingByChat` change. This is acceptable — same trade-off as `selectChatMessages` subscribing to `mediaUrls`.
- `typingByChat` changes frequently. The selector must format `typingText` as a string so components compare by reference via React.memo, not deep-compare the typing dict.
- `ChatLayout.test.tsx` imports `type { Td }` for test fixture construction. This is acceptable in tests — the boundary is for production component code.
- `useChatStore.setState({ selectedChatId: null })` in ChatHeader back button is fine — it's a simple state write, not a raw dict subscription.
- `useChatStore.getState()` in ComposeSearch callbacks is fine — imperative action access in event handlers.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/lib/types/ui.ts` | `UIChat` type — needs `avatarUrl`, `lastMessageThumbUrl`, `typingText` |
| `apps/app/src/mainview/lib/types/convert.ts` | `toUIChat` — may need additional context params for hydration |
| `apps/app/src/mainview/lib/store/selectors.ts` | `selectUIChats`, `selectUIArchivedChats`, `selectSelectedChat` — must hydrate new fields |
| `apps/app/src/mainview/lib/store/index.ts` | Current public API — will be replaced or tightened |
| `apps/app/src/mainview/lib/types/index.ts` | Current type re-exports — will be absorbed into package index |
| `apps/app/src/mainview/components/chat/ChatSidebar.tsx` | Worst violator: 7 raw dict reads, `actionLabel`, raw `Td.chat[]` subscription |
| `apps/app/src/mainview/components/chat/ChatHeader.tsx` | 2 raw dict reads + `toUIUser` converter import |
| `apps/app/src/mainview/components/chat/EmojiStatusBadge.tsx` | 1 raw dict read — may stay as acceptable exception |
| `apps/app/src/mainview/hooks/useMessageMediaLoader.ts` | Imports `ChatState` from internal `store/types` — should go through package index |
| `apps/app/src/mainview/hooks/useMessage.ts` | `computeMessageState` — pure function, should be exported through package |

### Lessons learned

1. `profilePhotos` is dual-keyed: `profilePhotos[chatId]` for avatars, `profilePhotos[userId]` for sender photos in messages. The sidebar uses chatId keys. The selector must use the right key.
2. The sidebar reads raw `s.chats` to drive a `useEffect` that calls `loadProfilePhoto(c.id)`. This exists to avoid a cycle: photo loads → profilePhotos changes → selectUIChats recomputes → useEffect fires → repeat. Fix: dedicated loading hook that uses `useChatStore.getState()` (imperative, no subscription) — same pattern as `useChatMessageLoader`.
3. `actionLabel` is used by ChatSidebar to format typing actions inline. Moving it into the selector means `UIChat.typingText` arrives pre-formatted.
4. ChatHeader calls `toUIUser(rawUser)` to get `emojiStatusId` and `isPremium`. But `UIChat` already has a `.user: UIUser | null` field that carries both. The raw user read + converter call is redundant — `selectSelectedChat` already populates `user` when it's a private chat.
5. `EmojiStatusBadge` is a leaf component that lazy-loads a single custom emoji by documentId. This is analogous to an `<img>` tag with lazy loading — the component IS the loader. Forcing this through a selector would mean the selector returns all emoji statuses for all visible chats, which is wasteful. Best left as-is or wrapped in a tiny `useEmojiStatus(id)` hook.
6. `ChatLayout.test.tsx` uses `type { Td }` for constructing test fixtures (`Td.message`, `Td.chat`). This is acceptable — test files operate below the abstraction boundary. The rule is for production component code.
