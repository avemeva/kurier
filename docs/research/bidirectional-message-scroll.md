# Bidirectional Message Scroll

## Goal

The MessagePanel currently only supports loading older messages (scroll up). It cannot jump to an arbitrary message in history, load newer messages after jumping, or return to the latest position. This blocks any feature that needs to navigate to a specific message — reply links, search results, deep links, bookmarks, etc.

The chat needs a bidirectional message window with a navigation API.

### Success criteria

```
1. Scroll up → older messages load (preserved)
2. Navigate to any message by ID → message visible and centered
3. After jumping to an old message → scroll down → newer messages load
4. "Go to latest" → returns to most recent messages
5. At latest → incoming messages append at bottom
6. Not at latest → incoming messages don't disrupt current view
7. Scroll position stable on prepend (older) and append (newer)
8. A "scroll to bottom" button appears when not at latest
```

## Architecture

### Current state

```
  MessagePanel (scroll container, flex-1)
       │
       ├── scroll event → handleScroll()
       │     └── scrollTop < 200 → loadOlderMessages()  (ONE direction only)
       │
       ├── useEffect: scroll to bottom on initial load
       ├── useEffect: reset refs on chat change
       ├── useEffect: preserve scroll on prepend (runs every render, no deps)
       ├── useEffect: scroll to targetMessageId
       │
       └── renders: messages from selectChatMessages(store)

  Store
       │
       ├── messagesByChat: Record<chatId, Td.message[]>  (oldest-first, flat array)
       ├── hasMoreMessages: Record<chatId, boolean>       (older direction ONLY)
       │
       ├── openChat()          → getMessages() → reverse → store (newest 50)
       ├── loadOlderMessages() → getMessages(fromId) → reverse → prepend
       ├── new_message handler → append to end
       │
       └── goToNextUnread*()   → getMessagesAroundMessage() → REPLACES entire array

  telegram.ts
       │
       ├── getMessages(chatId, { fromMessageId, limit })
       │     getChatHistory with offset:0 → returns newest-first
       │
       └── getMessagesAroundMessage(chatId, messageId)
             two getChatHistory calls (before + after) → merge → sort ascending
```

### What's missing

| Gap | Impact |
|---|---|
| No `hasNewer` state | Can't know if there are newer messages to load |
| No `loadNewerMessages()` | Can't scroll forward after jumping back |
| No `isAtLatest` state | Can't show "back to bottom" button, can't decide whether to auto-append incoming |
| No general `loadMessagesAround(id)` | Window replacement is coupled to mention/reaction logic |
| Scroll preservation effect has no deps | Runs every render, misfires after window replacement |
| `new_message` always appends | After jumping to old messages, incoming messages corrupt the window |

### Target state

```
  MessagePanel
       │
       ├── useInfiniteScroll(scrollRef, { onTop, onBottom })
       │     onTop  → store.loadOlderMessages()
       │     onBottom → store.loadNewerMessages()
       │
       ├── scrollToMessage(element) — utility function
       │
       └── renders:
             messages from selectChatMessages(store)
             PureCornerButtonStack with PureCornerButton children
               └── "scroll to bottom" when !isAtLatest

  Store
       │
       ├── messagesByChat    — the loaded window (oldest-first)
       ├── hasOlder          — can load upward
       ├── hasNewer          — can load downward
       ├── isAtLatest        — window includes the newest messages
       │
       ├── openChat()             → load recent, isAtLatest=true, hasNewer=false
       ├── loadOlderMessages()    → prepend, update hasOlder
       ├── loadNewerMessages()    → append, update hasNewer, set isAtLatest when exhausted
       ├── loadMessagesAround(id) → replace window, hasOlder=true, hasNewer=true, isAtLatest=false
       ├── loadLatestMessages()   → replace window with recent, isAtLatest=true, hasNewer=false
       ├── new_message handler    → append ONLY when isAtLatest, otherwise ignore messagesByChat
       │
       └── searchNextUnreadMention/Reaction() → returns messageId (domain logic only)

  telegram.ts
       │
       ├── getMessages(chatId, { fromMessageId, limit })           — existing
       ├── getNewerMessages(chatId, { fromMessageId, limit })      — NEW
       └── getMessagesAroundMessage(chatId, messageId, limit)      — existing
```

### Constraints

- TDLib `getChatHistory` returns newest-first, supports negative `offset` for fetching newer messages
- Messages stored as flat `Td.message[]` — no virtualization
- `selectChatMessages` assumes oldest-first ordering, does not sort
- Album grouping depends on adjacent messages having the same `mediaAlbumId`

## Entities

### Pure Components

| Component | Props | Responsibility |
|---|---|---|
| **PureCornerButton** | `icon: ReactNode, count?: number, onClick: () => void` | Round button with icon slot, optional count badge. Knows nothing about what it's for. |
| **PureCornerButtonStack** | `children: ReactNode` | Vertical stack, sticky bottom-right of scroll container. Just layout. |

### Hook

| Hook | Input | Output | Responsibility |
|---|---|---|---|
| **useInfiniteScroll** | `scrollRef, { onTop, onBottom, hasOlder, hasNewer }` | `void` (side effect) | Attaches scroll listener. Near top edge → `onTop()`. Near bottom edge → `onBottom()`. Debounces to prevent cascading loads. Does not re-fire until user scrolls away and returns. Generic — knows nothing about messages. |

### Utility

| Function | Signature | Responsibility |
|---|---|---|
| **scrollToMessage** | `(container: HTMLElement, messageId: number) => void` | Finds `#msg-{id}` element, scrolls to it centered, adds highlight class, removes after 2s. Pure DOM — no store, no domain knowledge. |

### Store actions

| Action | Signature | Responsibility |
|---|---|---|
| **loadOlderMessages** | `() => Promise<void>` | Fetch older messages, prepend to window, update `hasOlder`. Existing — needs minor refactor to use `hasOlder` instead of `hasMoreMessages`. |
| **loadNewerMessages** | `() => Promise<void>` | Fetch newer messages, append to window, update `hasNewer`. Set `isAtLatest = true` when no more newer messages. **NEW.** |
| **loadMessagesAround** | `(messageId: number) => Promise<void>` | Replace window with messages centered on messageId. Set `hasOlder`, `hasNewer` based on batch sizes. Set `isAtLatest = false`. **NEW.** |
| **loadLatestMessages** | `() => Promise<void>` | Replace window with most recent messages. Set `isAtLatest = true`, `hasNewer = false`. **NEW.** |

### Store state

| State | Type | Responsibility |
|---|---|---|
| **messagesByChat** | `Record<number, Td.message[]>` | The loaded message window per chat (oldest-first). Existing. |
| **hasOlder** | `Record<number, boolean>` | Whether older messages can be loaded. Replaces `hasMoreMessages`. |
| **hasNewer** | `Record<number, boolean>` | Whether newer messages can be loaded. **NEW.** |
| **isAtLatest** | `Record<number, boolean>` | Whether the window includes the most recent messages. **NEW.** |

### telegram.ts functions

| Function | Signature | Responsibility |
|---|---|---|
| **getMessages** | `(chatId, { fromMessageId?, limit? }) → { messages, hasMore }` | Fetch messages before a cursor. Existing. |
| **getNewerMessages** | `(chatId, { fromMessageId, limit? }) → { messages, hasMore }` | Fetch messages after a cursor using negative offset. **NEW.** |
| **getMessagesAroundMessage** | `(chatId, messageId, limit?) → { messages, hasOlder, hasNewer }` | Fetch messages centered on a message. Existing — needs to return `hasOlder` AND `hasNewer`. |

## Acceptance Criteria

### Store: openChat

| # | Criterion | Test | Verify |
|---|---|---|---|
| 1 | Loads recent messages oldest-first | store unit | `messagesByChat[chatId][0].id < messagesByChat[chatId].at(-1).id` |
| 2 | Sets `isAtLatest[chatId]` to `true` | store unit | `getState().isAtLatest[chatId] === true` |
| 3 | Sets `hasOlder[chatId]` based on batch size | store unit | Mock 50 returned → `true`. Mock 10 returned → `false` |
| 4 | Sets `hasNewer[chatId]` to `false` | store unit | `getState().hasNewer[chatId] === false` |
| 5 | Cached messages: does not refetch | store unit | Call twice → `getMessages` called once |
| 6 | Switching chats preserves other chat's messages | store unit | Open A, open B → `messagesByChat[A]` still exists |

### Store: loadOlderMessages

| # | Criterion | Test | Verify |
|---|---|---|---|
| 7 | Prepends older messages to array | store unit | `messagesByChat[chatId][0].id` decreases |
| 8 | Deduplicates by ID | store unit | Duplicate ID → array length unchanged |
| 9 | Sets `hasOlder = false` when empty batch | store unit | Mock returns 0 → `hasOlder === false` |
| 10 | Guards against concurrent calls | store unit | `loadingOlderMessages = true` → no fetch |
| 11 | Guards when `hasOlder` is `false` | store unit | `hasOlder = false` → no fetch |

### Store: loadNewerMessages

| # | Criterion | Test | Verify |
|---|---|---|---|
| 12 | Appends newer messages to array | store unit | `messagesByChat[chatId].at(-1).id` increases |
| 13 | Deduplicates by ID | store unit | Duplicate ID → array length unchanged |
| 14 | Sets `hasNewer = false` when empty batch | store unit | Mock returns 0 → `hasNewer === false` |
| 15 | Sets `isAtLatest = true` when `hasNewer` becomes `false` | store unit | Empty batch → `isAtLatest === true` |
| 16 | Guards against concurrent calls | store unit | `loadingNewerMessages = true` → no fetch |
| 17 | Guards when `hasNewer` is `false` | store unit | `hasNewer = false` → no fetch |
| 18 | No-op when `isAtLatest` is `true` | store unit | Call → no fetch |

### Store: loadMessagesAround

| # | Criterion | Test | Verify |
|---|---|---|---|
| 19 | Replaces `messagesByChat[chatId]` | store unit | Old messages gone, new window present |
| 20 | Messages in ascending ID order | store unit | `messages[i].id < messages[i+1].id` for all i |
| 21 | Target message included in window | store unit | `messages.some(m => m.id === messageId)` |
| 22 | `hasOlder` set based on before-batch | store unit | Full batch → `true` |
| 23 | `hasNewer` set based on after-batch | store unit | Full batch → `true` |
| 24 | `isAtLatest` set to `false` | store unit | `isAtLatest[chatId] === false` |

### Store: loadLatestMessages

| # | Criterion | Test | Verify |
|---|---|---|---|
| 25 | Replaces window with recent messages | store unit | Same result as fresh `openChat` |
| 26 | `isAtLatest` set to `true` | store unit | `isAtLatest[chatId] === true` |
| 27 | `hasNewer` set to `false` | store unit | `hasNewer[chatId] === false` |
| 28 | `hasOlder` set based on batch size | store unit | Full batch → `true` |

### Store: new_message handler

| # | Criterion | Test | Verify |
|---|---|---|---|
| 29 | `isAtLatest === true`: appends to `messagesByChat` | store unit | Message at end of array |
| 30 | `isAtLatest === false`: does NOT modify `messagesByChat` | store unit | Array reference unchanged |
| 31 | `isAtLatest === false`: chat still bumps to top of list | store unit | Chat order updated |
| 32 | `isAtLatest === false`: unread count still increments | store unit | `chat.unread_count` increases |

### Hook: useInfiniteScroll

| # | Criterion | Test | Verify |
|---|---|---|---|
| 33 | Fires `onTop` when scrollTop < threshold | hook unit | Mock scroll container, set scrollTop = 100, fire scroll → `onTop` called |
| 34 | Fires `onBottom` when near bottom edge | hook unit | scrollTop near scrollHeight - clientHeight → `onBottom` called |
| 35 | Does not re-fire until user scrolls away and returns | hook unit | Fire → scroll to middle → scroll back → fires again. Not twice in a row. |
| 36 | `onBottom` not called when `hasNewer` is `false` | hook unit | Scroll to bottom → not called |
| 37 | `onTop` not called when `hasOlder` is `false` | hook unit | Scroll to top → not called |

### Utility: scrollToMessage

| # | Criterion | Test | Verify |
|---|---|---|---|
| 38 | Scrolls element into view centered | unit | Assert `scrollIntoView({ behavior: 'smooth', block: 'center' })` called |
| 39 | Adds `highlight-message` class | unit | Assert `classList.add` called |
| 40 | Removes highlight after 2 seconds | unit | Advance timers 2000ms → `classList.remove` called |
| 41 | No-op when element not found | unit | Nonexistent ID → no error |

### Integration: MessagePanel

| # | Criterion | Test | Verify |
|---|---|---|---|
| 42 | Scroll up triggers `loadOlderMessages` | component | Simulate scroll to top → store action called |
| 43 | Scroll down triggers `loadNewerMessages` when `hasNewer` | component | Simulate scroll to bottom → store action called |
| 44 | Scroll down does NOT trigger load when `isAtLatest` | component | `isAtLatest=true`, scroll bottom → not called |
| 45 | "Scroll to bottom" button visible when `isAtLatest === false` | component | `queryByLabelText('Scroll to bottom')` exists |
| 46 | "Scroll to bottom" button hidden when `isAtLatest === true` | component | Button not in DOM |
| 47 | Clicking "scroll to bottom" calls `loadLatestMessages` | component | Click → store action called |
| 48 | Scroll position stable on older prepend | component | Visible messages unchanged after prepend |
| 49 | Scroll position stable on newer append | component | Visible messages unchanged after append |

### Build

| # | Criterion | Test | Verify |
|---|---|---|---|
| 50 | Typecheck passes | build | `bun run typecheck` exits 0 |
| 51 | All existing tests pass | build | `bun test` exits 0 |
| 52 | No regressions in chat behavior | build | Open chat, scroll up, send, receive — all work |

## What's Been Done

The mention/reaction sidebar badges and floating button UI already exist in this worktree (`worktree-humble-snuggling-falcon`), but the navigation (`goToNextUnread*`) is broken because it replaces the message window without bidirectional scroll support. That code should be refactored to use `loadMessagesAround` + `scrollToMessage` once this infrastructure lands.

## TODO

### Step 1: telegram.ts — Add `getNewerMessages`, fix `getMessagesAroundMessage`

| # | What | How to verify | Status |
|---|---|---|---|
| 1.1 | `getNewerMessages(chatId, { fromMessageId, limit })` using `getChatHistory` with negative offset | Unit test: returns messages newer than `fromMessageId` in oldest-first order | TODO |
| 1.2 | `getMessagesAroundMessage` returns `{ messages, hasOlder, hasNewer }` instead of `{ messages, hasMore }` | Unit test: `hasOlder` and `hasNewer` both reflect batch sizes | TODO |

### Step 2: Store — New state fields

| # | What | How to verify | Status |
|---|---|---|---|
| 2.1 | Replace `hasMoreMessages` with `hasOlder: Record<number, boolean>` | `bun run typecheck` exits 0, all references updated | TODO |
| 2.2 | Add `hasNewer: Record<number, boolean>` | Typecheck passes | TODO |
| 2.3 | Add `isAtLatest: Record<number, boolean>` | Typecheck passes | TODO |
| 2.4 | Add `loadingNewerMessages: boolean` | Typecheck passes | TODO |
| 2.5 | Remove `targetMessageId` from store (scroll is not store's job) | Typecheck passes | TODO |

### Step 3: Store — Refactor `openChat`

| # | What | How to verify | Status |
|---|---|---|---|
| 3.1 | Set `isAtLatest[chatId] = true` on open | Acceptance criteria #2 | TODO |
| 3.2 | Set `hasNewer[chatId] = false` on open | Acceptance criteria #4 | TODO |
| 3.3 | Set `hasOlder[chatId]` from batch size | Acceptance criteria #3 | TODO |

### Step 4: Store — `loadNewerMessages`

| # | What | How to verify | Status |
|---|---|---|---|
| 4.1 | Implement action: fetches via `getNewerMessages`, appends, deduplicates | Acceptance criteria #12-18 | TODO |
| 4.2 | Sets `isAtLatest = true` when no more newer messages | Acceptance criteria #15 | TODO |

### Step 5: Store — `loadMessagesAround`

| # | What | How to verify | Status |
|---|---|---|---|
| 5.1 | Implement action: replaces window via `getMessagesAroundMessage` | Acceptance criteria #19-24 | TODO |
| 5.2 | Sets `isAtLatest = false`, `hasOlder`/`hasNewer` from batches | Acceptance criteria #24 | TODO |
| 5.3 | Fetches missing users for the new window | Existing pattern from `openChat` | TODO |

### Step 6: Store — `loadLatestMessages`

| # | What | How to verify | Status |
|---|---|---|---|
| 6.1 | Implement action: replaces window with recent messages | Acceptance criteria #25-28 | TODO |
| 6.2 | Same logic as `openChat` initial load but without chat-switching side effects | Acceptance criteria #26-27 | TODO |

### Step 7: Store — Fix `new_message` handler

| # | What | How to verify | Status |
|---|---|---|---|
| 7.1 | Only append to `messagesByChat` when `isAtLatest[chatId]` is `true` | Acceptance criteria #29-30 | TODO |
| 7.2 | Chat list updates (bump to top, unread count) happen regardless | Acceptance criteria #31-32 | TODO |

### Step 8: Hook — `useInfiniteScroll`

| # | What | How to verify | Status |
|---|---|---|---|
| 8.1 | Extract scroll edge detection into `useInfiniteScroll(scrollRef, { onTop, onBottom, hasOlder, hasNewer })` | Acceptance criteria #33-37 | TODO |
| 8.2 | Debounce: don't re-fire until user scrolls away from edge and returns | Acceptance criteria #35 | TODO |

### Step 9: Utility — `scrollToMessage`

| # | What | How to verify | Status |
|---|---|---|---|
| 9.1 | Extract into standalone function `scrollToMessage(container, messageId)` | Acceptance criteria #38-41 | TODO |
| 9.2 | Finds `#msg-{id}`, scrolls centered, highlights 2s | Acceptance criteria #38-40 | TODO |

### Step 10: Pure components — `PureCornerButton`, `PureCornerButtonStack`

| # | What | How to verify | Status |
|---|---|---|---|
| 10.1 | `PureCornerButton`: round button, icon slot, optional count badge, onClick | Render test: icon visible, badge shows count, click fires callback | TODO |
| 10.2 | `PureCornerButtonStack`: vertical flex stack, sticky bottom-right, pointer-events pass-through | Render test: children visible, positioned correctly | TODO |

### Step 11: MessagePanel — Integration

| # | What | How to verify | Status |
|---|---|---|---|
| 11.1 | Replace scroll logic with `useInfiniteScroll` hook | Acceptance criteria #42-44 | TODO |
| 11.2 | Remove all scroll preservation useEffects, let `useInfiniteScroll` handle debounce | Acceptance criteria #48-49 | TODO |
| 11.3 | Render `PureCornerButtonStack` with "scroll to bottom" `PureCornerButton` when `!isAtLatest` | Acceptance criteria #45-47 | TODO |
| 11.4 | Wire `loadLatestMessages` to scroll-to-bottom button onClick | Acceptance criteria #47 | TODO |

### Step 12: Store tests

| # | What | How to verify | Status |
|---|---|---|---|
| 12.1 | Tests for `loadNewerMessages` | Acceptance criteria #12-18, `bun test` passes | TODO |
| 12.2 | Tests for `loadMessagesAround` | Acceptance criteria #19-24, `bun test` passes | TODO |
| 12.3 | Tests for `loadLatestMessages` | Acceptance criteria #25-28, `bun test` passes | TODO |
| 12.4 | Tests for `new_message` with `isAtLatest` flag | Acceptance criteria #29-32, `bun test` passes | TODO |
| 12.5 | Update existing `openChat` tests for new state fields | `bun test` passes | TODO |
| 12.6 | Update existing `loadOlderMessages` tests for `hasOlder` rename | `bun test` passes | TODO |

### Step 13: Hook + utility tests

| # | What | How to verify | Status |
|---|---|---|---|
| 13.1 | Tests for `useInfiniteScroll` | Acceptance criteria #33-37, `bun test` passes | TODO |
| 13.2 | Tests for `scrollToMessage` | Acceptance criteria #38-41, `bun test` passes | TODO |

### Step 14: Final build check

| # | What | How to verify | Status |
|---|---|---|---|
| 14.1 | Typecheck | `bun run typecheck` exits 0 | TODO |
| 14.2 | All tests pass | `bun test` exits 0 | TODO |

## Context for Future Agents

### Instructions for agents

- Do not ask questions — figure it out yourself. If you need user input or manual tasks (browser login, UI verification, etc.), use chrome extension MCP tools or agent-browser to do it yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- **Read every file listed in "Key files" FULLY before making any changes.** Do not skim or assume — the current implementation has subtle patterns (message ordering, memoized selectors, manual scroll preservation) that break if you don't understand them.
- TDLib `getChatHistory` returns messages in **newest-first** order. The store keeps them **oldest-first**. Always reverse/sort after fetching.
- The `selectChatMessages` selector does NOT sort. It assumes `messagesByChat[chatId]` is already in ascending ID order. If you break this invariant, rendering and album grouping will break silently.
- Run `bun run typecheck` after every step. Run `bun test` after steps 12-14.

### Key files

Read these FULLY (not just grep) before starting:

| File | Why | Lines |
|------|-----|-------|
| `apps/app/src/mainview/components/chat/MessagePanel.tsx` | The scroll container, all effects, render logic | ~270 |
| `apps/app/src/mainview/components/chat/ChatLayout.tsx` | Parent layout — how MessagePanel fits in flex | ~47 |
| `apps/app/src/mainview/lib/store.ts` | Zustand store — all message state, actions, selectors, event handlers | ~1460 |
| `apps/app/src/mainview/lib/store.test.ts` | Existing store tests — patterns to follow | ~900 |
| `apps/app/src/mainview/lib/telegram.ts` | TDLib API layer — `getMessages`, `getMessagesAroundMessage`, `getChatHistory` usage | ~1070 |
| `apps/app/src/mainview/lib/types/ui.ts` | `UIMessage`, `UIChat`, `UIMessageItem` types | ~160 |
| `apps/app/src/mainview/lib/types/convert.ts` | `toUIMessage`, `groupUIMessages` — conversion and grouping | ~540 |
| `apps/app/src/mainview/lib/types/index.ts` | `TelegramUpdateEvent` union, `TelegramEvent` | ~160 |
| `apps/app/src/mainview/components/CLAUDE.md` | Component architecture rules — Pure, Bubble, Message, Panel types | ~22 |

### Reference implementations

| Source | What to take |
|--------|-------------|
| tdesktop `history_view_corner_buttons.cpp` | How Telegram stacks corner buttons (down, mentions, reactions), 150ms animation, 4px gap |
| tdesktop `history_inner_widget.cpp` lines 1137-1200 | Viewport visibility detection pattern for marking messages as read |
| tdesktop `history_view_list_widget.cpp` | Bidirectional message loading — `preloadAroundMessage`, scroll position restoration |
| Existing `loadOlderMessages` in store.ts | Pattern for guards, deduplication, state updates — replicate for `loadNewerMessages` |

### Lessons learned

1. `getChatHistory` with `offset: 0` returns messages **before** `from_message_id` (older). With negative offset like `offset: -N`, it shifts the window N messages newer. The result is always newest-first.
2. The scroll preservation effect (no deps, runs every render) is fragile. It assumes message count increases = prepended older messages. After window replacement + incoming new_message, it overshoots. The new `useInfiniteScroll` hook must handle preservation properly.
3. `canLoadRef` debounce pattern: after initial load or prepend, loads are blocked until user scrolls past 500px from top. This prevents cascade loads. Replicate this in `useInfiniteScroll` for both directions.
4. `selectChatMessages` uses manual memoization (not `useMemo`). It caches on 5 values: `real`, `pending`, `users`, `lastReadOutboxId`, `replyPreviews`. Changing `messagesByChat` reference triggers recomputation.
5. `new_message` handler currently always appends. After the refactor it must check `isAtLatest` — otherwise jumping to an old message and receiving a new message corrupts the window (a message with a much higher ID appears at the end of an old-message window).
