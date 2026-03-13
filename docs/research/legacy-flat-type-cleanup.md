# Legacy Flat Type Cleanup

## Goal

Remove all legacy flat UI types (`UIMessageFlat`, `UIPendingMessageFlat`, `UIMessageItemFlat`, `UIMessageGroupFlat`, `UIWebPreviewFlat`) and their associated conversion functions, selectors, and tests. The production code path already uses the new compositional `UIMessage` types exclusively. The flat types exist only to support legacy tests and a dead selector.

Success criteria:
```
grep -r "Flat" apps/app/src/mainview/lib/types/ui.ts              → 0 matches
grep -r "Flat" apps/app/src/mainview/lib/types/convert.ts          → 0 matches
grep -r "Flat" apps/app/src/mainview/lib/types/index.ts            → 0 matches
grep -r "Flat" apps/app/src/mainview/lib/store/                    → 0 matches
grep -r "selectUnresolvedReplies\|selectUnresolvedPinnedPreviews" apps/app/src/mainview/ → only in store.test.ts delete confirmation (0 matches)
bun run typecheck                                                  → exits 0
bun run test                                                       → exits 0
bun run lint                                                       → 0 errors
```

## What's been done

The compositional type system is fully wired:
- `UIMessage` union (`kind: 'message' | 'service' | 'pending'`) defined in `ui.ts`
- `UIContent` discriminated union (10 content kinds) defined in `ui.ts`
- `toUIMessage`, `toUIContent`, `toUIForward`, `toUIReplyTo`, `toUISender` — new converters in `convert.ts`
- `groupAndConvert` — converts + groups albums + enriches reply previews in one pass
- `hydrateMessage` — merges store cache dictionaries onto compositional messages
- `selectChatMessages` — new selector returns hydrated `UIMessage[]`
- `useChatMessageLoader` — single hook triggers all media loads for visible messages
- `ChatView` uses `selectChatMessages` + `useChatMessageLoader` (no media useEffects)
- `PureMessageRow`, `computeMessageState`, `PureAlbumGrid` — all consume new types
- DevPage removed entirely
- Tests for `toUIContent` (12 tests), `groupAndConvert` (7 tests), `hydrateMessage` (10 tests) already exist

## What stays

- `UIReplyPreview` type — used by `store/types.ts:42` (`replyPreviews` cache) and `hydrateMessage`
- `buildReplyPreview()` — used by `store.ts:1086` in `resolveReplyPreview` action

## TODO

### Step 1: Delete legacy types from `ui.ts`

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Delete `UIWebPreviewFlat` type (lines 116-124) | `grep "UIWebPreviewFlat" apps/app/src/mainview/lib/types/ui.ts` → 0 matches | TODO |
| 1.2 | Delete `UIMessageFlat` type (lines 135-171) | `grep "UIMessageFlat" apps/app/src/mainview/lib/types/ui.ts` → 0 matches | TODO |
| 1.3 | Delete `UIPendingMessageFlat` type (lines 173-181) | `grep "UIPendingMessageFlat" apps/app/src/mainview/lib/types/ui.ts` → 0 matches | TODO |
| 1.4 | Delete `UIMessageItemFlat` type (line 182) | `grep "UIMessageItemFlat" apps/app/src/mainview/lib/types/ui.ts` → 0 matches | TODO |
| 1.5 | Delete `UIMessageGroupFlat` type (lines 184-186) | `grep "UIMessageGroupFlat" apps/app/src/mainview/lib/types/ui.ts` → 0 matches | TODO |
| 1.6 | Delete the "Legacy flat types" section comment | manual | TODO |

### Step 2: Delete legacy functions from `convert.ts`

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Delete `extractWebPreviewFlat()` (lines 247-262) | `grep "extractWebPreviewFlat" apps/app/src/mainview/lib/types/convert.ts` → 0 matches | TODO |
| 2.2 | Fix `buildReplyPreview` — it calls `extractWebPreviewFlat` on line 275. Change to check `content.link_preview` directly or use the new `extractWebPreviewNew` | `bun run typecheck` exits 0 | TODO |
| 2.3 | Delete `toUIMessageFlat()` (lines 465-511) | `grep "toUIMessageFlat" apps/app/src/mainview/lib/types/convert.ts` → 0 matches | TODO |
| 2.4 | Delete `enrichReplyPreviewsFlat()` (lines 514-536) | `grep "enrichReplyPreviewsFlat" apps/app/src/mainview/lib/types/convert.ts` → 0 matches | TODO |
| 2.5 | Delete `toUIPendingMessageFlat()` (lines 538-549) | `grep "toUIPendingMessageFlat" apps/app/src/mainview/lib/types/convert.ts` → 0 matches | TODO |
| 2.6 | Delete `groupUIMessagesFlat()` (lines 1285-1317) | `grep "groupUIMessagesFlat" apps/app/src/mainview/lib/types/convert.ts` → 0 matches | TODO |
| 2.7 | Clean up imports — remove `UIMessageFlat`, `UIMessageGroupFlat`, `UIMessageItemFlat`, `UIPendingMessageFlat`, `UIWebPreviewFlat` from import block | `bun run typecheck` exits 0 | TODO |

### Step 3: Clean up exports in `types/index.ts`

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Remove function exports: `enrichReplyPreviewsFlat`, `groupUIMessagesFlat`, `toUIMessageFlat`, `toUIPendingMessageFlat` | `grep "Flat" apps/app/src/mainview/lib/types/index.ts` → 0 matches | TODO |
| 3.2 | Remove type exports: `UIMessageFlat`, `UIMessageGroupFlat`, `UIMessageItemFlat`, `UIPendingMessageFlat`, `UIWebPreviewFlat` | same grep | TODO |

### Step 4: Delete `selectChatMessagesFlat` and unresolved selectors

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Delete `selectChatMessagesFlat` selector (lines 27-117 in selectors.ts) | `grep "selectChatMessagesFlat" apps/app/src/mainview/lib/store/selectors.ts` → 0 matches | TODO |
| 4.2 | Delete `EMPTY_UI_MESSAGES_FLAT` constant | `grep "EMPTY_UI_MESSAGES_FLAT" apps/app/src/mainview/lib/store/selectors.ts` → 0 matches | TODO |
| 4.3 | Remove flat imports from selectors.ts: `UIMessageItemFlat`, `enrichReplyPreviewsFlat`, `toUIMessageFlat`, `toUIPendingMessageFlat` | `grep "Flat" apps/app/src/mainview/lib/store/selectors.ts` → 0 matches | TODO |
| 4.4 | Delete `selectUnresolvedReplies` selector (lines 198-233) — `useChatMessageLoader` handles this now | `grep "selectUnresolvedReplies" apps/app/src/mainview/lib/store/selectors.ts` → only in `resetSelectors` or 0 | TODO |
| 4.5 | Delete `selectUnresolvedPinnedPreviews` selector (lines 235-260) — `useChatMessageLoader` handles this now | `grep "selectUnresolvedPinnedPreviews" apps/app/src/mainview/lib/store/selectors.ts` → 0 | TODO |
| 4.6 | Delete `UnresolvedItem` type and `unresolvedItemsEqual` helper (lines 202-210) — only used by deleted selectors | `grep "UnresolvedItem\|unresolvedItemsEqual" apps/app/src/mainview/lib/store/selectors.ts` → 0 | TODO |
| 4.7 | Remove from `resetSelectors()`: `selectChatMessagesFlat.reset()`, `selectUnresolvedReplies.reset()`, `selectUnresolvedPinnedPreviews.reset()` | code inspection | TODO |
| 4.8 | Remove from `store/index.ts`: `selectChatMessagesFlat`, `selectUnresolvedReplies`, `selectUnresolvedPinnedPreviews` exports | `grep "selectChatMessagesFlat\|selectUnresolvedReplies\|selectUnresolvedPinnedPreviews" apps/app/src/mainview/lib/store/index.ts` → 0 | TODO |

### Step 5: Migrate store tests

The old `selectChatMessagesFlat` tests (3 tests) need to become `selectChatMessages` tests with new type assertions. The `selectUnresolvedReplies` (5 tests) and `selectUnresolvedPinnedPreviews` (3 tests) are deleted without replacement.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | Replace `selectChatMessagesFlat` import with `selectChatMessages` in store.test.ts | `grep "selectChatMessagesFlat" apps/app/src/mainview/lib/store/store.test.ts` → 0 | TODO |
| 5.2 | Migrate "returns empty when no chat selected" test → `expect(selectChatMessages(...)).toEqual([])` | test passes | TODO |
| 5.3 | Migrate "returns real messages when no pending" test → assert `result[0].kind === 'message'` and `result[0].id === 1` | test passes | TODO |
| 5.4 | Migrate "merges real + pending" test → assert `result.length === 2`, `result[1].kind === 'pending'` | test passes | TODO |
| 5.5 | Delete `describe('selectUnresolvedReplies', ...)` block (lines 1001-1113) | `grep "selectUnresolvedReplies" apps/app/src/mainview/lib/store/store.test.ts` → 0 | TODO |
| 5.6 | Delete `describe('selectUnresolvedPinnedPreviews', ...)` block (lines 1116-1140) | `grep "selectUnresolvedPinnedPreviews" apps/app/src/mainview/lib/store/store.test.ts` → 0 | TODO |
| 5.7 | Remove `selectUnresolvedReplies`, `selectUnresolvedPinnedPreviews` imports from store.test.ts | grep confirms | TODO |

### Step 6: Delete legacy convert tests

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Delete `describe('toUIMessageFlat', ...)` block (lines 60-252) | `grep "toUIMessageFlat" apps/app/src/mainview/lib/types/__tests__/convert.test.ts` → 0 | TODO |
| 6.2 | Delete `describe('groupUIMessagesFlat', ...)` block (lines 540-598) | `grep "groupUIMessagesFlat" apps/app/src/mainview/lib/types/__tests__/convert.test.ts` → 0 | TODO |
| 6.3 | Delete `describe('enrichReplyPreviewsFlat', ...)` block (lines 659-672) | `grep "enrichReplyPreviewsFlat" apps/app/src/mainview/lib/types/__tests__/convert.test.ts` → 0 | TODO |
| 6.4 | Delete `describe('toUIPendingMessageFlat', ...)` block (lines 834-870) | `grep "toUIPendingMessageFlat" apps/app/src/mainview/lib/types/__tests__/convert.test.ts` → 0 | TODO |
| 6.5 | Clean up imports: remove `enrichReplyPreviewsFlat`, `groupUIMessagesFlat`, `toUIMessageFlat`, `toUIPendingMessageFlat`, `UIPendingMessageFlat` | `grep "Flat" apps/app/src/mainview/lib/types/__tests__/convert.test.ts` → 0 | TODO |

### Step 7: Add gap tests for `toUIMessage` envelope

The old `toUIMessageFlat` tests covered envelope fields (id, sender, isRead, forward, reply) that the new `toUIContent`/`groupAndConvert` tests don't. Add targeted tests.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | Add `describe('toUIMessage', ...)` in convert.test.ts with tests for: envelope fields (id, chatId, date, isOutgoing, sender.name, sender.userId), isRead logic (outgoing + id > 0 + lastReadOutboxId), service message detection, unknown sender → "Unknown" | `bun run test -- --grep "toUIMessage"` passes | TODO |
| 7.2 | Add tests for `toUIForward`: null when no forward, correct fromName/photoId/date when present | `bun run test -- --grep "toUIForward"` passes | TODO |
| 7.3 | Add tests for `toUIReplyTo`: null when no reply, correct messageId/quoteText when present | `bun run test -- --grep "toUIReplyTo"` passes | TODO |

### Step 8: Final verification

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 8.1 | Zero "Flat" references in mainview | `grep -r "Flat" apps/app/src/mainview/` → 0 matches | TODO |
| 8.2 | Zero unresolved selector references | `grep -r "selectUnresolvedReplies\|selectUnresolvedPinnedPreviews" apps/app/src/mainview/` → 0 | TODO |
| 8.3 | Types pass | `bun run typecheck` exits 0 | TODO |
| 8.4 | Tests pass | `bun run test` exits 0 | TODO |
| 8.5 | Lint passes | `bun run lint` → 0 errors | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- Run `bun run typecheck` after each step to catch errors early.
- Steps must be executed in order (1→2→3→...→8). Each step depends on the previous.
- Use `bun run`, not bare `bun test`.
- When deleting test blocks, be careful not to delete shared fixtures or helpers used by remaining tests.
- The `buildReplyPreview` function (step 2.2) calls `extractWebPreviewFlat`. Replace with: `hasWebPreview: content._ === 'messageText' && !!content.link_preview`.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/lib/types/ui.ts` | Type definitions. Delete flat types (lines 116-186), keep compositional types and `UIReplyPreview`. |
| `apps/app/src/mainview/lib/types/convert.ts` | Conversion functions. Delete flat converters, keep `buildReplyPreview` (fix its `extractWebPreviewFlat` call). |
| `apps/app/src/mainview/lib/types/index.ts` | Re-exports. Remove flat type/function exports. |
| `apps/app/src/mainview/lib/store/selectors.ts` | Selectors. Delete `selectChatMessagesFlat`, `selectUnresolvedReplies`, `selectUnresolvedPinnedPreviews`. |
| `apps/app/src/mainview/lib/store/index.ts` | Store public API. Remove deleted selector exports. |
| `apps/app/src/mainview/lib/store/store.test.ts` | Store tests. Migrate 3 selector tests, delete 8 unresolved tests. |
| `apps/app/src/mainview/lib/types/__tests__/convert.test.ts` | Convert tests. Delete 4 legacy describe blocks, add `toUIMessage`/`toUIForward`/`toUIReplyTo` tests. |

### Lessons learned

1. `buildReplyPreview` is the only survivor that touches `extractWebPreviewFlat`. It's called from `store.ts:1086` when resolving reply previews from the network. The fix is a one-line inline: `hasWebPreview: content._ === 'messageText' && !!content.link_preview`.
2. `UIReplyPreview` looks like a flat-era type but it's actually the cache shape in `store/types.ts` — `replyPreviews: Record<string, UIReplyPreview | null>`. It's consumed by `hydrateMessage` to backfill `replyTo.senderName`/`text`/`mediaLabel`. It stays.
3. `selectUnresolvedReplies` and `selectUnresolvedPinnedPreviews` were the old mechanism for ChatView to know what to fetch. Now `useChatMessageLoader` checks `msg.replyTo.senderName === undefined` and `msg.pinnedMessageId > 0` directly. The selectors are dead code.
4. The store test `makeMessage()` helper creates raw `Td.message` objects. When migrating `selectChatMessagesFlat` tests to `selectChatMessages`, the assertions change from flat fields (`result[0].id`) to compositional (`result[0].kind === 'message' && result[0].id`).
