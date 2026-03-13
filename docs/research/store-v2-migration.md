# Store v2 Migration

## Goal

Replace the monolithic `store.ts` (2189 lines) with the new `store-v2/` module (6 files, 1816 lines). The new store fixes: module-level mutable memoization (35 `_prev*` variables), side effects inside selectors, scattered dedup Sets, incomplete `_resetForTests`, and duplicated fetch logic. After migration, no file in the codebase imports from `@/lib/store` — only from `@/lib/store-v2`.

## Acceptance Criteria

Every criterion is mechanically verifiable. An agent runs the command, checks the output, pass/fail.

### Build & lint (no regressions)

| # | Criterion | Command | Expected |
|---|-----------|---------|----------|
| AC-1 | TypeScript compiles with zero errors | `bun run typecheck` | Exit code 0 |
| AC-2 | Linter passes | `bun run lint` | Exit code 0 |

### Old store fully removed

| # | Criterion | Command | Expected |
|---|-----------|---------|----------|
| AC-3 | Old store file deleted | `test -f apps/app/src/mainview/lib/store.ts && echo EXISTS \|\| echo GONE` | `GONE` |
| AC-4 | No imports reference old store path | `grep -rn "from ['\"]@/lib/store['\"]" apps/app/src --include='*.ts' --include='*.tsx' \| wc -l` | `0` |
| AC-5 | No relative imports to old store | `grep -rn "from ['\"]\\./store['\"]" apps/app/src/mainview/lib/ --include='*.ts' \| grep -v store-v2 \| wc -l` | `0` |

### All 231 store unit tests pass against new store

| # | Criterion | Command | Expected |
|---|-----------|---------|----------|
| AC-6 | Store unit tests pass | `bun run test -- store` | All 231 test cases pass, exit 0 |
| AC-7 | ChatLayout integration tests pass | `bun run test -- ChatLayout` | All 7 test cases pass, exit 0 |
| AC-8 | Full test suite passes | `bun run test` | Exit 0, no failures |

### Selector purity (the core architectural fix)

| # | Criterion | Command | Expected |
|---|-----------|---------|----------|
| AC-9 | `selectChatMessages` has no side effects | `grep -n 'loadReplyThumb\|resolveReplyPreview\|resolvePinnedPreview\|fetchMessage\|downloadThumbnail' apps/app/src/mainview/lib/store-v2/selectors.ts \| wc -l` | `0` |
| AC-10 | No module-level `_prev` variables | `grep -n '^let _prev' apps/app/src/mainview/lib/store-v2/*.ts \| wc -l` | `0` |
| AC-11 | No module-level dedup Sets outside request-tracker | `grep -n '^const.*= new Set' apps/app/src/mainview/lib/store-v2/store.ts \| wc -l` | `0` |

### Side effects moved to components

| # | Criterion | Command | Expected |
|---|-----------|---------|----------|
| AC-12 | MessagePanel has useEffect for unresolved replies | `grep -c 'selectUnresolvedReplies\|selectUnresolvedPinnedPreviews' apps/app/src/mainview/components/chat/MessagePanel.tsx` | `2` or more |
| AC-13 | MessagePanel calls resolveReplyPreview in useEffect | `grep -A5 'unresolvedReplies' apps/app/src/mainview/components/chat/MessagePanel.tsx \| grep -c 'resolveReplyPreview'` | `1` or more |

### _resetForTests is complete

| # | Criterion | Command | Expected |
|---|-----------|---------|----------|
| AC-14 | _resetForTests calls all three subsystem resets | `grep -c 'requests.resetAll\|timers.resetAll\|resetSelectors' apps/app/src/mainview/lib/store-v2/store.ts` | `3` |
| AC-15 | No mutable module state left uncleared | `grep -c '^let ' apps/app/src/mainview/lib/store-v2/store.ts` | `1` (only `tempIdCounter`, which IS cleared in _resetForTests) |

## Architecture

```
Before:
  store.ts (2189 lines — state, actions, selectors, memoization, dedup, timers, side effects)
      ↑
  14 consumer files (components, hooks, pages, tests)

After:
  store-v2/
  ├── index.ts            (15 lines — re-exports)
  ├── types.ts            (210 lines — ChatState, INITIAL_STATE)
  ├── store.ts            (1126 lines — Zustand store, actions, handleUpdate)
  ├── selectors.ts        (352 lines — pure selectors, no side effects)
  ├── create-selector.ts  (33 lines — memoization utility)
  ├── request-tracker.ts  (46 lines — centralized dedup)
  └── timer-registry.ts   (34 lines — centralized timer lifecycle)
      ↑
  14 consumer files (unchanged imports, just path swap)
  + MessagePanel.tsx gets useEffect for reply/pinned resolution
```

Key behavioral change: `selectChatMessages` no longer fires `resolveReplyPreview` / `loadReplyThumb` / `resolvePinnedPreview` as side effects. Instead, two new selectors (`selectUnresolvedReplies`, `selectUnresolvedPinnedPreviews`) expose what needs fetching, and `MessagePanel.tsx` triggers those fetches in a `useEffect`.

Other behavioral change: `searchResults` stores raw `Td.message[]` instead of `UISearchResult[]`. Any consumer of `searchResults` must apply `toUISearchResult` at the read boundary.

## What's been done

The store-v2 module is fully written and typechecks:

| File | Status |
|------|--------|
| `apps/app/src/mainview/lib/store-v2/create-selector.ts` | Written, typechecks |
| `apps/app/src/mainview/lib/store-v2/request-tracker.ts` | Written, typechecks |
| `apps/app/src/mainview/lib/store-v2/timer-registry.ts` | Written, typechecks |
| `apps/app/src/mainview/lib/store-v2/types.ts` | Written, typechecks |
| `apps/app/src/mainview/lib/store-v2/selectors.ts` | Written, typechecks |
| `apps/app/src/mainview/lib/store-v2/store.ts` | Written, typechecks |
| `apps/app/src/mainview/lib/store-v2/index.ts` | Written, typechecks |

## TODO

### Step 1: Swap imports in all consumer files

Pure mechanical find-and-replace. The store-v2 `index.ts` re-exports the same symbols with the same names.

| # | File | Import change | How to verify | Status |
|---|------|---------------|---------------|--------|
| 1.1 | `components/chat/MessagePanel.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.2 | `components/chat/ChatHeader.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.3 | `components/chat/ChatSidebar.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.4 | `components/chat/ChatLayout.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.5 | `components/chat/Message.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.6 | `components/chat/FormattedText.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.7 | `components/chat/ComposeSearch.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.8 | `components/chat/EmojiStatusBadge.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.9 | `components/ui/chat/StatusText.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.10 | `hooks/useMedia.ts` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.11 | `hooks/useReplyThumb.ts` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.12 | `pages/DevPage.tsx` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |
| 1.13 | `pages/dev-data.ts` | `@/lib/store` → `@/lib/store-v2` | `bun run typecheck` exits 0 | TODO |

### Step 2: Add reply/pinned resolution useEffect to MessagePanel

`selectChatMessages` no longer fires side effects. MessagePanel must trigger resolution explicitly.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Import `selectUnresolvedReplies` and `selectUnresolvedPinnedPreviews` from `@/lib/store-v2` in `MessagePanel.tsx` | `bun run typecheck` exits 0 | TODO |
| 2.2 | Add `useEffect` that calls `resolveReplyPreview` for each unresolved reply | Manual: open a chat with reply messages — reply previews load | TODO |
| 2.3 | Add `useEffect` that calls `loadReplyThumb` for each message with `replyToMessageId > 0` | Manual: reply thumbnails appear in reply previews | TODO |
| 2.4 | Add `useEffect` that calls `resolvePinnedPreview` for each unresolved pinned preview | Manual: "X pinned Y" service messages show preview text | TODO |

The implementation in MessagePanel.tsx should look like:

```tsx
// After existing selector hooks
const unresolvedReplies = useChatStore(selectUnresolvedReplies);
const unresolvedPinned = useChatStore(selectUnresolvedPinnedPreviews);

useEffect(() => {
  const { resolveReplyPreview, loadReplyThumb } = useChatStore.getState();
  for (const { chatId, messageId } of unresolvedReplies) {
    resolveReplyPreview(chatId, messageId);
    loadReplyThumb(chatId, messageId);
  }
}, [unresolvedReplies]);

useEffect(() => {
  const { resolvePinnedPreview } = useChatStore.getState();
  for (const { chatId, messageId } of unresolvedPinned) {
    resolvePinnedPreview(chatId, messageId);
  }
}, [unresolvedPinned]);
```

### Step 3: Handle searchResults type change

store-v2 stores `searchResults` as raw `Td.message[]` instead of `UISearchResult[]`. Find consumers and add selector-level transformation.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Find all consumers of `searchResults` from the store | `grep -rn 'searchResults' apps/app/src --include='*.ts' --include='*.tsx'` shows all sites | TODO |
| 3.2 | Create `selectSearchResults` selector in `selectors.ts` that maps `Td.message[]` → `UISearchResult[]` using `toUISearchResult` | `bun run typecheck` exits 0 | TODO |
| 3.3 | Update consumers to use the new selector instead of raw state access | `bun run typecheck` exits 0 | TODO |

### Step 4: Migrate tests

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Update `store.test.ts` imports: `'./store'` → `'./store-v2'` | `bun run typecheck` exits 0 | TODO |
| 4.2 | Update `store.test.ts` mock paths if needed (vi.mock targets) — the test mocks `'./telegram'` which is now `'../telegram'` relative to store-v2 | `bun run test` — store tests pass | TODO |
| 4.3 | Update `ChatLayout.test.tsx` imports: `'@/lib/store'` → `'@/lib/store-v2'` | `bun run typecheck` exits 0 | TODO |
| 4.4 | Run full test suite | `bun run test` exits 0, all tests pass | TODO |

Note: The vi.mock paths in `store.test.ts` currently mock `'./telegram'` and `'./log'`. Since the store-v2 store.ts imports from `'../telegram'` and `'../log'`, the mock paths must change to `'../telegram'` and `'../log'`. The test file itself should move into the `store-v2/` directory or the mock paths must be adjusted.

### Step 5: Move test file

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | Move `store.test.ts` → `store-v2/store.test.ts` | File exists at new path | TODO |
| 5.2 | Update all relative imports and mock paths in the moved test file | `bun run test` — all store tests pass | TODO |

### Step 6: Delete old store

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Delete `apps/app/src/mainview/lib/store.ts` | `ls store.ts` fails | TODO |
| 6.2 | Verify no remaining imports reference the old path | `grep -r "from.*@/lib/store['\"]" apps/app/src --include='*.ts' --include='*.tsx'` returns only `store-v2/` internal imports | TODO |
| 6.3 | Full quality check | `bun run typecheck && bun run test && bun run lint` all exit 0 | TODO |

### Step 7: Rename store-v2 → store (optional, clean up)

Once everything works, remove the `-v2` suffix so imports are just `@/lib/store` again.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | Rename `store-v2/` directory to `store/` | `ls apps/app/src/mainview/lib/store/index.ts` succeeds | TODO |
| 7.2 | Update all imports: `@/lib/store-v2` → `@/lib/store` (14 files + test) | `grep -r "store-v2" apps/app/src` returns 0 results | TODO |
| 7.3 | Update mock paths in tests if affected | `bun run test` passes | TODO |
| 7.4 | Final quality check | `bun run typecheck && bun run test && bun run lint` all exit 0 | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself.
- Run `bun run typecheck` after every file change to catch errors immediately.
- Do not stop until all TODOs are DONE.
- When moving/renaming files, use `git mv` so history is preserved.
- The old `store.ts` must be deleted with `trash`, not `rm`.
- Run `bun run test` after step 4, not before — tests will fail until mocks are updated.
- If `selectUnresolvedReplies` or `selectUnresolvedPinnedPreviews` return stale references causing excessive useEffect fires, add referential equality via JSON comparison or a custom shallow compare on the array contents.
- Output COMPLETE when ALL steps are finished.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/lib/store.ts` | Old store — DELETE after migration |
| `apps/app/src/mainview/lib/store-v2/` | New store — already written, typechecks |
| `apps/app/src/mainview/lib/store.test.ts` | 3540 lines of tests — must move into store-v2/ and update mock paths |
| `apps/app/src/mainview/components/chat/MessagePanel.tsx` | Main behavioral change — needs useEffect for reply/pinned resolution |
| `apps/app/src/mainview/components/chat/ChatLayout.test.tsx` | 391 lines — update import path only |
| `apps/app/src/mainview/hooks/useReplyThumb.ts` | Already uses useEffect for reply thumbs — no behavioral change needed, just import swap |
| `apps/app/src/mainview/lib/store-v2/selectors.ts` | Pure selectors — may need `selectSearchResults` added (step 3) |

### Design decisions already made

| Decision | Rationale |
|----------|-----------|
| Keep Zustand, don't use React Query | TDLib is push-based. `getUser` is "never needed" per TDLib maintainer. Store pattern matches TDLib's intended architecture. No production messaging client uses React Query as primary state. |
| Pure selectors, side effects in useEffect | React concurrent mode can call selectors speculatively. Side effects in selectors cause double-render cycles and fight React's execution model. |
| `createSelector` with encapsulated closures | Eliminates 35 module-level `_prev*` variables. Each selector owns its memo cache. `.reset()` method for tests. |
| `RequestTracker` as single module | Replaces 8 scattered `Set`s. Single `resetAll()` — impossible to miss one. `track()` returns boolean so call sites are one-liners. |
| `TimerRegistry` as single module | Replaces 2 `Map<string, timeout>` for typing/status. Auto-clears previous timer on re-set. Single `resetAll()`. |
| `searchResults` as raw `Td.message[]` | Follows principle: store holds facts, selectors hold opinions. Previous store violated this by storing `UISearchResult[]`. |
| `fetchAndSetMessages` shared helper | Eliminates near-identical code in `openChat` and `openChatById`. |
| `handleUpdate` uses switch | Cleaner than if-chain. Enables future exhaustiveness checking. |

### Lessons learned
1. `_resetForTests` in the old store missed 13 `_prev*` variables and 3 Sets — dormant test leaks. The new store's `_resetForTests` is 5 lines and structurally complete because each subsystem owns its own `.reset()`.
2. `selectUIUser` must NOT be memoized at module level — it takes a parameter (userId), so a module-level cache is a singleton that thrashes with multiple consumers. Use `useMemo(() => createSelector(...), [userId])` in components instead.
3. The vi.mock paths in tests are relative to the TEST file, not the source file. When moving `store.test.ts` into `store-v2/`, the mock for `'./telegram'` becomes `'../telegram'`.
4. `selectUnresolvedReplies` checks `m.reply_to._` for `'messageReplyToMessage'` — verify this matches the actual TDLib type discriminant used in the codebase.
