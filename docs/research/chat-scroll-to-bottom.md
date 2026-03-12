# Chat Scroll-to-Bottom + Store Test Coverage

## Goal

Two deliverables in one branch:

1. **Fix scroll-to-bottom** — when a user opens or switches to a chat, the message panel scrolls to show the latest messages at the bottom. Currently broken for both fetch and cached paths.
2. **Store test coverage ≥ 95%** — the store (`store.ts`) is the backbone of the app. Current coverage is 63% lines / 51% branches. Bring it to ≥ 95% lines.

```
Success criteria:
  bun run typecheck                                                    # exits 0
  bun run test                                                         # exits 0
  bun run lint                                                         # exits 0
  cd apps/app && npx vitest run --coverage \
    --coverage.include='src/mainview/lib/store.ts' 2>&1 \
    | grep 'store.ts' | awk '{print $4}'                               # ≥ 95.0
  Playwright: open chat → distanceFromBottom < 50px
  Playwright: switch chat → distanceFromBottom < 50px
```

## Architecture

```
User clicks dialog
  → ChatSidebar.handleSelectChat(chatId)
    → store.openChatById(chatId)
      → found in lists? → store.openChat(chat)
      → not found?      → direct open by ID

store.openChat(chat):
  set({ selectedChatId })              ← React re-renders, messages = []
  CACHED: messagesByChat[id] exists → return (no loadingMessages toggle)
  FETCH:  set({ loadingMessages: true })
          await getMessages()
          set({ messagesByChat, isAtLatest: true, ... })
          set({ loadingMessages: false })        ← in finally block

MessagePanel (NEVER unmounts — persistent in ChatLayout.tsx:30):
  selectedChat   ← useChatStore(selectSelectedChat)    [memoized selector]
  messages       ← useChatStore(selectChatMessages)    [manually memoized]
  isAtLatest     ← useChatStore(s => s.isAtLatest[id] ?? true)
  loadingMessages ← useChatStore(s => s.loadingMessages)

  scrollContainerRef → <div data-testid="message-panel" overflow-y:auto>
```

### Constraints

- `MessagePanel` never unmounts — chat switches are purely state changes within a persisting component
- `selectChatMessages` has manual memoization (30+ `_prev*` module-level vars) — returns same reference when inputs match
- `loadingMessages` is a **global boolean**, not per-chat — switching to cached chat B while chat A fetches leaves `loadingMessages: true`
- `isAtLatest` defaults to `true` via `?? true` in the selector — UI can't distinguish "confirmed at latest" from "nothing loaded yet"
- Store has 4 code paths: `openChat` cached, `openChat` fetch, `openChatById` cached (delegates to `openChat`), `openChatById` fetch (own implementation)
- React 18 StrictMode enabled — suppresses console.log during double-render

## What's been done

### Chat list reordering — DONE, keep
- `store.ts`: Added `getChatOrder()` and `sortByOrder()` helpers (lines 166-172)
- Applied `sortByOrder()` in `chat_last_message`, `chat_position`, `chat_draft_message` handlers
- Chats reorder in sidebar when receiving new messages

### MessagePanel CSS fixes — DONE, keep
- Removed `mx-auto` from message container (line 225)
- Removed `sm:` responsive prefix from `justify-end` (line 237)

### Scroll code — BROKEN, needs replacement
- `MessagePanel.tsx` lines 64-115: store subscription approach that fails for cached path
- `tests/e2e/app.test.ts` lines 243-317: scroll test with extensive debug scaffolding

## Investigation notes (completed)

### Root cause: original scroll effect (on main)

```typescript
// Original code (lines 64-79 on main):
const prevIsAtLatestRef = useRef<boolean | undefined>(undefined);
useEffect(() => {
    const wasAtLatest = prevIsAtLatestRef.current;
    prevIsAtLatestRef.current = isAtLatest;
    if (!isAtLatest || messages.length === 0) return;
    if (wasAtLatest === undefined || wasAtLatest === false) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
}, [isAtLatest, messages]);
```

**Why it fails — FETCH PATH:**

| Render | `isAtLatest` | `messages` | `wasAtLatest` | Effect result |
|--------|-------------|------------|---------------|---------------|
| 1 (selectedChatId set) | `?? true` (default) | `[]` | `true` (prev chat) | `messages.length === 0` → **early return** |
| 2 (messagesByChat set) | `true` (explicit) | `[...msgs]` | `true` | `wasAtLatest === true` → **neither condition met → NO SCROLL** |

The effect relies on `isAtLatest` transitioning `false/undefined → true`. But `isAtLatest` defaults to `true` when unset (line 49: `?? true`), so there is never a transition.

**Why it fails — CACHED PATH:**
Same issue. `isAtLatest` was `true` for the previous chat, stays `true` for the cached chat. No transition detected.

### Root cause: current subscription approach (in working tree)

```typescript
useChatStore.subscribe((state, prevState) => {
    const msgs = state.messagesByChat[chatId];
    const prevMsgs = prevState.messagesByChat[chatId];
    if (msgs && msgs !== prevMsgs && isLatest && needsScrollRef.current) { ... }
});
```

**Fetch path**: Works. `msgs` goes from `undefined` to `[...messages]`, so `msgs !== prevMsgs`.

**Cached path**: Fails. When only `selectedChatId` changes, `messagesByChat` isn't mutated. Both `state.messagesByChat[newId]` and `prevState.messagesByChat[newId]` are the **same array reference** → `msgs === prevMsgs` → no scroll.

### The correct approach

Detect "I need to scroll" via ref-based tracking in the render body. Single `useEffect` with `[messages, isAtLatest]` deps. Don't gate on `loadingMessages` (it's global, not per-chat — would delay cached chat scroll while another chat fetches).

```typescript
const selectedChatId = selectedChat?.id;
const prevChatIdRef = useRef<number | undefined>(undefined);
const prevIsAtLatestRef = useRef(isAtLatest);
const needsScrollRef = useRef(true);
const prevMsgCountRef = useRef(0);

// Chat switched → need scroll
if (prevChatIdRef.current !== selectedChatId) {
  needsScrollRef.current = true;
  prevChatIdRef.current = selectedChatId;
}
// "Scroll to latest" button (isAtLatest: false → true)
if (!prevIsAtLatestRef.current && isAtLatest) {
  needsScrollRef.current = true;
}
prevIsAtLatestRef.current = isAtLatest;

useEffect(() => {
  const prevCount = prevMsgCountRef.current;
  prevMsgCountRef.current = messages.length;
  if (messages.length === 0) return;

  const el = scrollContainerRef.current;
  if (!el) return;

  // Priority 1: initial scroll for chat open / loadLatestMessages
  if (needsScrollRef.current) {
    needsScrollRef.current = false;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return;
  }

  // Priority 2: auto-scroll on new messages when near bottom
  if (messages.length > prevCount && isAtLatest) {
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 600) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }
}, [messages, isAtLatest]);
```

**Why this works for all paths:**

| Scenario | `needsScrollRef` | Trigger | Result |
|----------|-----------------|---------|--------|
| Fetch: chat A selected | `true` | `messages` changes (empty → loaded) | Scrolls when messages arrive |
| Cached: switch to B | `true` | `messages` changes (selector recomputes, different chatId) | Scrolls immediately |
| Cached while A still loading | `true` | `messages` changes | Scrolls immediately (no `loadingMessages` gating) |
| "Scroll to latest" button | `true` (false→true) | `isAtLatest` + `messages` change | Scrolls |
| Incoming message, near bottom | `false` | `messages.length` increases | Auto-scrolls |
| Incoming message, scrolled up | `false` | `messages.length` increases | `distanceFromBottom > 600` → no scroll |

### Store test coverage gaps (current: 63% lines)

Untested areas identified via `--coverage`:

| Area | Lines | Why it matters |
|------|-------|----------------|
| `openChatById` fallback path | 677-708 | Untested fetch-by-ID when chat not in lists |
| `loadOlderMessages` full flow | 537-576 | Only partially covered |
| `send` chat preview update | 720-745 | Optimistic UI update untested |
| `handleUpdate: auth_state` | 862-870 | App init flow |
| `handleUpdate: user` | 872-882 | User object updates |
| `handleUpdate: message_send_succeeded` | 1118-1145 | Send confirmation |
| `handleUpdate: chat_online_member_count` | 1099-1103 | Online count |
| `react` remove path | 798-811 | Unchosen reaction |
| All search actions | 1398-1598 | `executeGlobalSearch`, `executeChatSearch`, etc. |
| Media actions | 1327-1364 | `loadMedia`, `clearMediaUrl`, `seedMedia` |
| UI list selectors | 1909-1965 | `selectUIChats`, `selectUIArchivedChats`, `selectUIUser` |
| `computeHeaderStatus` branches | 1813-1852 | last_seen variants |
| `sortByOrder` in handlers | 1186-1209 | Chat reordering |

## Acceptance criteria

Every criterion is mechanically verifiable — an agent can run the check and get pass/fail.

| # | Criterion | Verification command | Pass condition |
|---|-----------|---------------------|----------------|
| A1 | Typecheck clean | `bun run typecheck` | exit 0 |
| A2 | Unit tests pass | `bun run test` | exit 0 |
| A3 | Lint clean | `bun run lint` | exit 0 |
| A4 | Store line coverage ≥ 95% | `cd apps/app && npx vitest run --coverage --coverage.include='src/mainview/lib/store.ts' 2>&1 \| grep 'store.ts'` | `% Lines` column ≥ 95.0 |
| A5 | Store branch coverage ≥ 85% | Same command as A4 | `% Branch` column ≥ 85.0 |
| A6 | No store subscription in MessagePanel | `grep -c 'useChatStore.subscribe' apps/app/src/mainview/components/chat/MessagePanel.tsx` | outputs `0` |
| A7 | No debug scaffolding in E2E test | `grep -c 'freshPage\|__scrollDebug\|__openChat\|storeCheck\|openChatDebug\|scrollDebug' apps/app/tests/e2e/app.test.ts` | outputs `0` |
| A8 | E2E scroll test passes | Start dev server (`bun run dev:hmr`), then `cd apps/app && bunx playwright test --project app -g "scrolls"` | exit 0 |
| A9 | All E2E tests pass | `cd apps/app && bunx playwright test --project app` | exit 0 |
| A10 | Scroll works for fetch path | E2E test: click chat with no cached messages → `distanceFromBottom < 50` | assert passes |
| A11 | Scroll works for cached path | E2E test: click previously opened chat → `distanceFromBottom < 50` | assert passes |

## TODO

### Step 1: Fix scroll-to-bottom in MessagePanel

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Replace lines 64-115 in `MessagePanel.tsx` with the ref-based approach from investigation notes above. Remove the store subscription entirely. Keep `messagesEndRef` (used by the DOM as end-of-messages marker). | `grep -c 'useChatStore.subscribe' apps/app/src/mainview/components/chat/MessagePanel.tsx` returns `0` | TODO |
| 1.2 | Typecheck passes | `bun run typecheck` exits 0 | TODO |
| 1.3 | Manual test: open fresh chat → scrolled to bottom | `bun run dev:hmr`, open in browser, click a chat | TODO |
| 1.4 | Manual test: switch between cached chats → each scrolled to bottom | Click 3 different chats, all show latest messages | TODO |

### Step 2: Clean up E2E scroll test

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Replace lines 243-317 in `app.test.ts` with a clean test: click dialog → wait for messages → check `distanceFromBottom < 50`. No `freshPage`, no `window.__` debug, no `storeCheck`. Use shared `page` from the test fixture. | `grep -c 'freshPage\|__scrollDebug\|__openChat\|storeCheck' apps/app/tests/e2e/app.test.ts` returns `0` | TODO |
| 2.2 | E2E test passes | Start dev server with `bun run dev:hmr` (background). Run `cd apps/app && bunx playwright test --project app -g "scrolls"`. Exits 0 | TODO |
| 2.3 | All other E2E tests still pass | `cd apps/app && bunx playwright test --project app` exits 0 | TODO |

### Step 3: Store test coverage — core actions

Add tests to `apps/app/src/mainview/lib/store.test.ts`.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | `openChatById` — chat found in main list (delegates to `openChat`) | Test exists, asserts `selectedChatId` set, `getMessages` called via `openChat` | TODO |
| 3.2 | `openChatById` — chat found in archived list | Test exists, asserts delegation to `openChat` | TODO |
| 3.3 | `openChatById` — chat NOT in lists, fetches by ID | Test exists, asserts `selectedChatId` set, `getMessages` called, `messagesByChat` populated | TODO |
| 3.4 | `openChatById` — uses cache when messages exist | Test exists, `getMessages` not called | TODO |
| 3.5 | `openChatById` — sets error on fetch failure | Test exists, `error` populated | TODO |
| 3.6 | `loadOlderMessages` — success: prepends older messages | Test exists | TODO |
| 3.7 | `loadOlderMessages` — empty batch: sets `hasOlder=false` | Test exists | TODO |
| 3.8 | `loadOlderMessages` — guards: no selectedChatId, already loading, no hasOlder | Tests exist, `getMessages` not called | TODO |
| 3.9 | `loadOlderMessages` — deduplicates by ID | Test exists | TODO |
| 3.10 | `send` — optimistic chat preview update (last_message changes) | Test exists, asserts `chats[0].last_message.content` updated | TODO |

### Step 4: Store test coverage — handleUpdate events

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | `auth_state` — authorizationStateReady triggers `loadDialogs` | Test exists | TODO |
| 4.2 | `user` — adds user to `users` Map | Test exists | TODO |
| 4.3 | `user` — populates initial `userStatuses` from user.status | Test exists | TODO |
| 4.4 | `message_send_succeeded` — replaces old message by ID | Test exists | TODO |
| 4.5 | `message_send_succeeded` — appends when old ID not found | Test exists | TODO |
| 4.6 | `message_send_succeeded` — clears matching pending | Test exists | TODO |
| 4.7 | `chat_online_member_count` — updates count | Test exists | TODO |
| 4.8 | `chat_last_message` — `sortByOrder` reorders chats | Test exists, asserts order changed after position update | TODO |
| 4.9 | `chat_position` — `sortByOrder` reorders chats | Test exists | TODO |
| 4.10 | `chat_draft_message` — `sortByOrder` reorders chats, updates positions | Test exists | TODO |

### Step 5: Store test coverage — search actions

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | `openGlobalSearch` / `closeGlobalSearch` — sets/clears search mode | Test exists | TODO |
| 5.2 | `executeGlobalSearch` — success: populates results | Test exists, mock `searchGlobal` | TODO |
| 5.3 | `executeGlobalSearch` — empty query: clears results | Test exists | TODO |
| 5.4 | `executeGlobalSearch` — stale query guard (query changed during fetch) | Test exists | TODO |
| 5.5 | `loadMoreGlobalResults` — appends results | Test exists | TODO |
| 5.6 | `loadMoreGlobalResults` — guards: loading, no hasMore, no cursor | Test exists | TODO |
| 5.7 | `openChatSearch` / `closeChatSearch` — sets/clears state | Test exists | TODO |
| 5.8 | `executeChatSearch` — success: populates results | Test exists, mock `searchInChat` | TODO |
| 5.9 | `loadMoreChatResults` — appends results | Test exists | TODO |
| 5.10 | `chatSearchNext` / `chatSearchPrev` — increment/decrement index, guard bounds | Tests exist | TODO |

### Step 6: Store test coverage — remaining gaps

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | `react` — remove reaction (chosen=true path, count decrements or removes) | Test exists | TODO |
| 6.2 | `react` — increment existing reaction (not first add) | Test exists | TODO |
| 6.3 | `loadMedia` — calls `downloadMedia`, stores URL, deduplicates | Test exists | TODO |
| 6.4 | `clearMediaUrl` — removes from `mediaUrls` and `mediaRequested` | Test exists | TODO |
| 6.5 | `seedMedia` — merges URLs into `mediaUrls` | Test exists | TODO |
| 6.6 | `selectUIChats` — converts chats to UIChat array, memoizes | Test exists | TODO |
| 6.7 | `selectUIArchivedChats` — same for archived | Test exists | TODO |
| 6.8 | `selectUIUser` — returns UIUser or null, memoizes | Test exists | TODO |
| 6.9 | `selectHeaderStatus` — last_seen recently/week/month variants | Tests exist | TODO |
| 6.10 | `executeContactSearch` — success, empty query, stale guard | Tests exist | TODO |

### Step 7: Final verification

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | Typecheck | `bun run typecheck` exits 0 | TODO |
| 7.2 | Unit tests pass | `bun run test` exits 0 | TODO |
| 7.3 | Lint | `bun run lint` exits 0 | TODO |
| 7.4 | Store coverage ≥ 95% lines | `cd apps/app && npx vitest run --coverage --coverage.include='src/mainview/lib/store.ts' 2>&1 \| grep 'store.ts' \| awk '{print $4}'` shows ≥ 95.0 | TODO |
| 7.5 | E2E scroll test passes | Start dev server, `cd apps/app && bunx playwright test --project app -g "scrolls"` exits 0 | TODO |
| 7.6 | All E2E tests pass | `cd apps/app && bunx playwright test --project app` exits 0 | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself. Use browser MCP tools or agent-browser for manual verification.
- Do not stop until all TODOs are done.
- **Step 1 is the priority** — fix the scroll bug first, then test coverage.
- Run the dev server with `bun run dev:hmr` (from repo root, not apps/app) before running e2e tests. Long-running — use `run_in_background`.
- Use `data-testid` attributes for Playwright selectors — never CSS classes or tag names.
- `bun run test` uses vitest. Always `bun run test`, never bare `bun test`.
- Read `CLAUDE.md` files in any directory before editing files there.
- Run `bun run scripts/symbols.ts .` before coding to understand exports.
- The store test file already has `makeChat()`, `makeMessage()`, `textContent()` factories and mocks for `./telegram` — use them.
- Mock `searchGlobal` and `searchInChat` are already declared in the mock block — just add `vi.mocked()` calls.
- `_resetForTests()` is called in `beforeEach` — store state is clean between tests.
- For search tests, you'll need to add `searchContacts` to the telegram mock if not already there.
- Coverage: install `@vitest/coverage-v8` as devDep if not present. Run from `apps/app` dir. If esbuild EPIPE errors occur, do `trash node_modules && bun install` to fix.
- Output COMPLETE when ALL steps are finished.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/components/chat/MessagePanel.tsx` | Scroll container, all scroll logic. Lines 64-115 need replacement. |
| `apps/app/src/mainview/lib/store.ts` | All app state. 2047 lines. Actions, handleUpdate, selectors. |
| `apps/app/src/mainview/lib/store.test.ts` | Store unit tests. 1357 lines, 82 tests. Add ~60 more tests. |
| `apps/app/src/mainview/components/chat/ChatLayout.tsx` | Mounts MessagePanel (line 30), never unmounts it. |
| `apps/app/src/mainview/hooks/useInfiniteScroll.ts` | Passive scroll listener — read only, do not modify. |
| `apps/app/src/mainview/lib/scrollToMessage.ts` | Reply-click scroll utility — do not modify. |
| `apps/app/tests/e2e/app.test.ts` | E2E tests — scroll test at lines 243-317 needs cleanup. |
| `apps/app/src/mainview/lib/CLAUDE.md` | Store responsibilities and anti-responsibilities. Read before editing store. |
| `apps/app/src/mainview/components/CLAUDE.md` | Component type definitions (Pure/Bubble/Message/Panel). |
| `apps/app/vitest.config.ts` | Test config: happy-dom env, `@` alias to `./src/mainview`. |

### Lessons learned

1. **MessagePanel never unmounts** — persistent across chat switches. All ref-based state persists. Handle chat switches explicitly via ref comparison in render body.
2. **`isAtLatest` defaults to `true`** — the selector uses `?? true` (line 49). This means the UI can't detect "confirmed at latest" vs "nothing loaded yet". The scroll fix must NOT rely on isAtLatest transitions for initial load.
3. **`loadingMessages` is global** — not per-chat. Don't gate scroll on it. Gate on `messages.length > 0` instead.
4. **`selectChatMessages` memoization is safe for chat switches** — when `selectedChatId` changes, `messagesByChat[selectedChatId]` is a different value, so the selector recomputes. The `messages` dep DOES change on chat switch.
5. **Store subscription fails for cached path** — `state.messagesByChat[newId]` and `prevState.messagesByChat[newId]` are the same reference when only `selectedChatId` changed. Don't use store subscriptions for scroll detection.
6. **`el.scrollTop = el.scrollHeight` works** — proven via `page.evaluate`. The DOM is fine. The problem was always timing/triggering.
7. **`scrollIntoView` is less reliable** — prefer direct `scrollTop` assignment inside `requestAnimationFrame`.
8. **Chat list reordering (sortByOrder) is done** — don't touch `sortByOrder`, `getChatOrder`, or the three handlers that call them. But DO add tests for the reordering behavior.
9. **`send` function** optimistically updates `pendingByChat` and `last_message`. Pending messages are merged into `selectChatMessages` result — auto-scroll for new messages covers sent messages too.
10. **esbuild EPIPE** — installing `@vitest/coverage-v8` can corrupt esbuild's native module. If tests fail with "service was stopped", nuke `node_modules` and reinstall.
