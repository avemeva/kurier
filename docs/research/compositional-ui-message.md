# Compositional UIMessage Refactor

## Goal

Replace the flat 40-field `UIMessage` struct with a compositional type system where each message is a composition of independent layers (forward, reply, content) and the content is a discriminated union. Albums become a single UI unit. The selector hydrates all media URLs from store dictionaries so components never touch `mediaUrls`/`thumbUrls`/`profilePhotos` directly. One hook handles all media loading for any message variant.

Success criteria:
```
grep -r "mediaUrls\|thumbUrls\|profilePhotos\|customEmojiUrls" apps/app/src/mainview/components/ → only ChatView.tsx (via useChatStore selectors)
grep -r "UIMessage" apps/app/src/mainview/lib/types/ui.ts → shows discriminated union, not flat struct
bun run typecheck → exits 0
bun run test → exits 0
bun run lint → exits 0
cd apps/app && bun run test:e2e → all pass
DevPage loads at /dev with no console errors
```

## Architecture

```
Store (internal — unchanged)                  Selector (public API)              Component
─────────────────────────────                 ─────────────────────              ─────────
messagesByChat: Record<chatId, Td.message[]>
pendingByChat: Record<chatId, PendingMessage[]>
users: Map<userId, Td.user>
                                              selectChatMessages(state)
mediaUrls: Record<"cid_mid", string|null>     ──► reads all 4 caches ──►        ChatView
thumbUrls: Record<"cid_mid", string|null>         groups albums                   │
profilePhotos: Record<id, string>                 hydrates URLs onto msgs          │ useChatMessageLoader(messages, visibleIds)
customEmojiUrls: Record<docId, info>              returns UIMessage[]              │   → walks visible messages
replyPreviews: Record<"cid_mid", preview>                                         │   → calls loadMessageMedia(msg)
pinnedPreviews: Record<"cid_mid", string>                                         │   → one hook, all media types
                                                                                  ▼
                                                                              PureMessageRow
                                                                                (reads msg.content.kind)
```

Constraints:
- Store actions (`loadMedia`, `loadProfilePhoto`, etc.) stay as-is — they're the right granularity
- `request-tracker.ts` deduplicates all requests — safe to call from one unified hook
- `createSelector` memoizes via shallow dep comparison — adding `mediaUrls`/`thumbUrls`/`profilePhotos`/`customEmojiUrls` as deps means the selector re-runs when any URL arrives (acceptable: render body is cheap, React.memo on PureMessageRow blocks DOM work)
- No virtualization — all loaded messages are in the DOM
- 235 existing store tests, 0 for album grouping — need new tests

## What's been done

- ScrollContainer extracted (pure, no store access)
- PureMessageRow, PureAlbumGrid, PureFormattedText — all pure, props-only
- computeMessageState — pure function, no hooks
- useVisibleMessages — IntersectionObserver + MutationObserver hook
- DevPage — renders from fixture data, no store
- useMedia.ts, useReplyThumb.ts — deleted
- seedMedia — deleted from store
- Scroll preservation on older message prepend — implemented in ScrollContainer

## New Type System

### Compositional UIMessage

```typescript
// ─── Shared shapes ───

type UIMedia = {
  url: string | undefined       // undefined = not yet loaded
  width: number
  height: number
  minithumbnail: string | null
}

type UICaption = {
  text: string
  entities: UITextEntity[]
  customEmojiUrls: Record<string, CustomEmojiInfo | null>
}

type UIForward = {
  fromName: string
  photoId: number               // user/chat ID for loadProfilePhoto
  photoUrl: string | undefined  // hydrated from profilePhotos
  date: number
}

type UIReplyTo = {
  messageId: number
  senderName: string | undefined  // undefined = not yet resolved
  text: string | undefined
  mediaLabel: string | undefined
  thumbUrl: string | undefined    // hydrated from thumbUrls
  quoteText: string
}

type UISender = {
  userId: number
  name: string
  photoUrl: string | undefined    // hydrated from profilePhotos
}

// ─── Content union ───

type UITextContent = {
  kind: 'text'
  text: string
  entities: UITextEntity[]
  customEmojiUrls: Record<string, CustomEmojiInfo | null>
  webPreview: UIWebPreview | null   // thumbUrl hydrated inside
}

type UIPhotoContent = {
  kind: 'photo'
  media: UIMedia
  caption: UICaption | null
}

type UIVideoContent = {
  kind: 'video'
  media: UIMedia
  isGif: boolean
  caption: UICaption | null
}

type UIAnimationContent = {
  kind: 'animation'
  media: UIMedia
  caption: UICaption | null
}

type UIVoiceContent = {
  kind: 'voice'
  url: string | undefined
  waveform: string | null
  duration: number
  fileSize: number
  speechStatus: 'none' | 'pending' | 'done' | 'error'
  speechText: string
}

type UIVideoNoteContent = {
  kind: 'videoNote'
  media: UIMedia
}

type UIStickerContent = {
  kind: 'sticker'
  url: string | undefined
  format: 'webp' | 'tgs' | 'webm'
  emoji: string
  width: number
  height: number
}

type UIAlbumItem = {
  messageId: number             // original TDLib message ID, for loadMedia key
  contentKind: 'photo' | 'video' | 'animation'
  url: string | undefined
  width: number
  height: number
  minithumbnail: string | null
}

type UIAlbumContent = {
  kind: 'album'
  items: UIAlbumItem[]
  caption: UICaption | null
}

type UIDocumentContent = {
  kind: 'document'
  label: string
}

type UIUnsupportedContent = {
  kind: 'unsupported'
  label: string
}

type UIContent =
  | UITextContent
  | UIPhotoContent
  | UIVideoContent
  | UIAnimationContent
  | UIVoiceContent
  | UIVideoNoteContent
  | UIStickerContent
  | UIAlbumContent
  | UIDocumentContent
  | UIUnsupportedContent

// ─── Message types ───

type UIMessageBase = {
  id: number                    // TDLib message ID (album = first message's ID)
  chatId: number
  date: number
  isOutgoing: boolean
  isRead: boolean
  editDate: number
  sender: UISender
  reactions: UIReaction[]
  viewCount: number
  forward: UIForward | null
  replyTo: UIReplyTo | null
  inlineKeyboard: UIKeyboardRow[] | null
  content: UIContent
}

type UIServiceMessage = {
  kind: 'service'
  id: number
  chatId: number
  date: number
  sender: UISender
  text: string
  pinnedMessageId: number
}

type UIPendingMessage = {
  kind: 'pending'
  localId: string
  chatId: number
  text: string
  date: number
  status: 'sending' | 'failed'
}

type UIMessage = (UIMessageBase & { kind: 'message' }) | UIServiceMessage | UIPendingMessage
```

### UIWebPreview (updated)

```typescript
type UIWebPreview = {
  url: string
  siteName: string
  title: string
  description: string
  minithumbnail: string | null
  thumbUrl: string | undefined    // hydrated from thumbUrls[chatId_msgId]
  showLargeMedia: boolean
  showMediaAboveDescription: boolean
}
```

## TODO

### Step 1: New type definitions

Replace `ui.ts` types. Keep old types temporarily aliased for migration.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Define `UIMedia`, `UICaption`, `UIForward`, `UIReplyTo`, `UISender` in `ui.ts` | `grep "type UIMedia\|type UICaption\|type UIForward\|type UIReplyTo\|type UISender" apps/app/src/mainview/lib/types/ui.ts` returns 5 matches | TODO |
| 1.2 | Define all content types (`UITextContent` through `UIUnsupportedContent`) and `UIContent` union in `ui.ts` | `grep "kind:" apps/app/src/mainview/lib/types/ui.ts` returns matches for all 10 content kinds | TODO |
| 1.3 | Define `UIMessageBase`, `UIServiceMessage`, `UIPendingMessage`, `UIMessage` union in `ui.ts` | `grep "type UIMessage =" apps/app/src/mainview/lib/types/ui.ts` returns the union type | TODO |
| 1.4 | Export all new types from `types/index.ts` | `bun run typecheck` exits 0 (unused types is fine at this stage) | TODO |
| 1.5 | Keep old `UIMessage` as `UIMessageLegacy` temporarily | `grep "UIMessageLegacy" apps/app/src/mainview/lib/types/ui.ts` returns match | TODO |

### Step 2: New conversion functions

Replace `toUIMessage` + `groupUIMessages` with new converters that produce compositional types.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Create `toUIContent(msg: Td.message): UIContent` — maps content discriminant to the right content type, extracts media dimensions/minithumbnail/voice data/sticker data/web preview. URL fields set to `undefined` (hydrated later). | Function exists, `bun run typecheck` exits 0 | TODO |
| 2.2 | Create `toUIForward(info: Td.messageForwardInfo, users, chats): UIForward \| null` — extracts forward name + photoId. `photoUrl` set to `undefined`. | Function exists | TODO |
| 2.3 | Create `toUIReplyTo(msg: Td.message, users): UIReplyTo \| null` — extracts replyToMessageId + quoteText. senderName/text/thumbUrl set to `undefined` (hydrated later). | Function exists | TODO |
| 2.4 | Create `toUISender(msg: Td.message, users): UISender` — extracts userId + name. `photoUrl` set to `undefined`. | Function exists | TODO |
| 2.5 | Create `toNewUIMessage(msg: Td.message, users, lastReadOutboxId, chats): UIMessageBase \| UIServiceMessage` — assembles from `toUIContent` + `toUIForward` + `toUIReplyTo` + `toUISender` | Function exists, `bun run typecheck` exits 0 | TODO |
| 2.6 | Create `groupAndConvert(rawMsgs: Td.message[], pending: PendingMessage[], users, lastReadOutboxId, chats): UIMessage[]` — converts, groups albums (consecutive same `media_album_id` → one `UIAlbumContent`), enriches in-batch reply previews, appends pending | Function exists, `bun run typecheck` exits 0 | TODO |
| 2.7 | Update `enrichReplyPreviews` to work with new type — mutates `replyTo.senderName`/`replyTo.text`/`replyTo.mediaLabel` instead of setting `replyPreview` | Function updated | TODO |
| 2.8 | Unit tests for `toUIContent` covering: text, photo, video, animation, voice, videoNote, sticker, document, unsupported | `bun run test -- --grep "toUIContent"` passes | TODO |
| 2.9 | Unit tests for `groupAndConvert` covering: single messages, albums (2+ messages with same albumId), single-with-albumId (group of 1), pending messages, mixed | `bun run test -- --grep "groupAndConvert"` passes | TODO |

### Step 3: Hydration functions

Pure functions that merge store cache dictionaries onto UIMessage trees.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Create `hydrateMessage(msg: UIMessage, mediaUrls, thumbUrls, profilePhotos, customEmojiUrls, replyPreviews, pinnedPreviews): UIMessage` — walks the compositional structure and fills in `url`/`photoUrl`/`thumbUrl` from dictionaries | Function exists, `bun run typecheck` exits 0 | TODO |
| 3.2 | Hydration covers: `content.media.url` (photo/video/animation/videoNote/sticker/voice), `content.items[].url` (album), `content.webPreview.thumbUrl` (text), `forward.photoUrl`, `replyTo.thumbUrl` + `replyTo.senderName`/`text`/`mediaLabel` (from replyPreviews), `sender.photoUrl`, `customEmojiUrls` in caption/text, `serviceText` enrichment from pinnedPreviews | Unit tests pass for each case | TODO |
| 3.3 | Unit tests for hydration: message with mediaUrl resolved, album with partial URLs, forward with/without photo, replyTo with/without preview, web preview thumb, custom emoji | `bun run test -- --grep "hydrateMessage"` passes | TODO |

### Step 4: Update selectChatMessages

The selector now produces `UIMessage[]` (new compositional type) with hydrated media URLs.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Add `mediaUrls`, `thumbUrls`, `profilePhotos`, `customEmojiUrls` to selector deps | `grep "s.mediaUrls" apps/app/src/mainview/lib/store/selectors.ts` returns match inside `selectChatMessages` | TODO |
| 4.2 | Replace `real.map(msg => toUIMessage(...))` + `enrichReplyPreviews` + `groupUIMessages` with `groupAndConvert(...)` | Code inspection | TODO |
| 4.3 | Add hydration pass: `messages.map(m => hydrateMessage(m, mediaUrls, thumbUrls, profilePhotos, customEmojiUrls, replyPreviews, pinnedPreviews))` | Code inspection | TODO |
| 4.4 | Return type changes from `UIMessageItem[]` to `UIMessage[]` | `bun run typecheck` exits 0 | TODO |
| 4.5 | Remove `selectUnresolvedReplies` — reply preview resolution is now detected by `replyTo.senderName === undefined` in the loading hook | `grep "selectUnresolvedReplies" apps/app/src/mainview/lib/store/selectors.ts` → only in `resetSelectors` (or removed entirely) | TODO |
| 4.6 | Update existing selector tests to use new type shape | `bun run test -- --grep "selectChatMessages"` passes | TODO |
| 4.7 | `bun run typecheck` exits 0 | Run command | TODO |

### Step 5: loadMessageMedia function + useChatMessageLoader hook

One function that knows what each message variant needs. One hook that applies it to visible messages.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | Create `loadMessageMedia(msg: UIMessage, store: ChatState): void` in a new file `apps/app/src/mainview/hooks/useMessageMediaLoader.ts` | File exists, function exported | TODO |
| 5.2 | Handles forward photo (`forward.photoUrl === undefined && forward.photoId → loadProfilePhoto`) | Code inspection | TODO |
| 5.3 | Handles reply thumb (`replyTo.thumbUrl === undefined → loadReplyThumb`) | Code inspection | TODO |
| 5.4 | Handles reply preview (`replyTo.senderName === undefined → resolveReplyPreview`) | Code inspection | TODO |
| 5.5 | Handles content media: photo/video/animation/sticker/voice/videoNote (`media.url === undefined → loadMedia`) | Code inspection | TODO |
| 5.6 | Handles album items (`item.url === undefined → loadMedia(chatId, item.messageId)`) | Code inspection | TODO |
| 5.7 | Handles web preview thumb (`content.webPreview.thumbUrl === undefined → loadReplyThumb(chatId, msgId)`) | Code inspection | TODO |
| 5.8 | Handles custom emoji (`entity.customEmojiId` where `customEmojiUrls[id] === undefined → loadCustomEmojiUrl`) | Code inspection | TODO |
| 5.9 | Handles sender photo (`sender.photoUrl === undefined → loadProfilePhoto`) — only for group chats where sender photos are shown | Code inspection | TODO |
| 5.10 | Create `useChatMessageLoader(messages: UIMessage[], visibleIds: Set<number>): void` hook — single useEffect, iterates visible messages, calls `loadMessageMedia` | Hook exists | TODO |
| 5.11 | `bun run typecheck` exits 0 | Run command | TODO |

### Step 6: Update ChatView

ChatView uses the new selector output and the new hook. Remove all 6 media-loading useEffects.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | `selectChatMessages` now returns `UIMessage[]` — remove `groupUIMessages` call | `grep "groupUIMessages" apps/app/src/mainview/components/chat/ChatView.tsx` → 0 matches | TODO |
| 6.2 | Remove `mediaUrls`, `thumbUrls`, `profilePhotos`, `customEmojiUrls` direct store reads from ChatView | `grep "useChatStore.*mediaUrls\|useChatStore.*thumbUrls\|useChatStore.*profilePhotos\|useChatStore.*customEmojiUrls" apps/app/src/mainview/components/chat/ChatView.tsx` → 0 matches | TODO |
| 6.3 | Remove all 6 media-loading useEffects (media, custom emoji, forward photos, link preview thumbs, unresolvedReplies, unresolvedPinned) | Count of `useEffect` in ChatView.tsx decreases from 8 to 2 (chat switch + pinned previews) or fewer | TODO |
| 6.4 | Replace with `useChatMessageLoader(messages, visibleMessageIds)` | `grep "useChatMessageLoader" apps/app/src/mainview/components/chat/ChatView.tsx` returns match | TODO |
| 6.5 | Remove `messageById` memo — no longer needed (messages are already UIMessage with IDs) | `grep "messageById" apps/app/src/mainview/components/chat/ChatView.tsx` → 0 matches | TODO |
| 6.6 | Remove `albumByFirstId` memo — albums are already one unit | `grep "albumByFirstId" apps/app/src/mainview/components/chat/ChatView.tsx` → 0 matches | TODO |
| 6.7 | Update render loop: iterate `messages` directly (already grouped), render `<PureMessageRow msg={msg}>` | Code inspection | TODO |
| 6.8 | Remove per-message inline prop resolution (mediaUrl, replyThumbUrl, forwardPhotoUrl, etc.) — all on the message now | `grep "mediaUrls\[" apps/app/src/mainview/components/chat/ChatView.tsx` → 0 matches | TODO |
| 6.9 | Update `getKey`, `getSenderPhotoUrl`, `getIsOutgoing`, `getSenderId`, `getGroupPosition` to work with `UIMessage` union | Code inspection | TODO |
| 6.10 | `bun run typecheck` exits 0 | Run command | TODO |

### Step 7: Update computeMessageState + PureMessageRow

These consume the new UIMessage type and render accordingly.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | Rewrite `computeMessageState` to take `UIMessage` (new type) instead of `MessageInput + MessageContext + ResolvedProps` | `grep "function computeMessageState" apps/app/src/mainview/hooks/useMessage.ts` — signature uses `UIMessage` | TODO |
| 7.2 | Switch on `msg.kind` first (`'service'`, `'pending'`, `'message'`), then `msg.content.kind` for message content | Code inspection | TODO |
| 7.3 | Render states read directly from compositional fields: `msg.forward.photoUrl`, `msg.replyTo.thumbUrl`, `msg.content.media.url`, etc. — no more separate `ResolvedProps` | `grep "ResolvedProps" apps/app/src/mainview/hooks/useMessage.ts` → 0 matches | TODO |
| 7.4 | Update `MessageProps` on PureMessageRow: receives `msg: UIMessage` instead of 14 separate props | `grep "mediaUrl\|mediaLoading\|replyThumbUrl\|forwardPhotoUrl\|linkPreviewThumbUrl\|onTranscribe\|albumMedia\|customEmojiUrls" apps/app/src/mainview/components/chat/PureMessageRow.tsx` → 0 matches (as separate props) | TODO |
| 7.5 | Update `arePropsEqual` custom comparator for new prop shape | Code inspection | TODO |
| 7.6 | Update all layout components (PureBubbleLayout, PureMediaLayout, PureAlbumLayout, PureStickerLayout) to read from render state (which now sources from compositional message) | Code inspection | TODO |
| 7.7 | `bun run typecheck` exits 0 | Run command | TODO |
| 7.8 | `bun run test` exits 0 | Run command | TODO |

### Step 8: Update DevPage

DevPage constructs UIMessage fixtures directly using the new compositional type.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 8.1 | Update `dev-data.ts` fixtures to use new UIMessage shape (or create new fixture helpers) | `bun run typecheck` exits 0 | TODO |
| 8.2 | DevPage passes `UIMessage` objects directly to `PureMessageRow` | Code inspection | TODO |
| 8.3 | DevPage renders without console errors | `cd apps/app && bun run test:e2e -- --project=dev` passes | TODO |

### Step 9: Delete legacy types and dead code

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 9.1 | Remove `UIMessageLegacy` alias | `grep "UIMessageLegacy" apps/app/src/mainview/` → 0 matches | TODO |
| 9.2 | Remove old `groupUIMessages` if no longer used | `grep "groupUIMessages" apps/app/src/mainview/` → 0 matches | TODO |
| 9.3 | Remove old `toUIMessage` if fully replaced | `grep "toUIMessage" apps/app/src/mainview/` → 0 matches (or only in tests) | TODO |
| 9.4 | Remove `UIMessageItem`, `UIMessageGroup` types if unused | `grep "UIMessageItem\|UIMessageGroup" apps/app/src/mainview/lib/types/ui.ts` → 0 matches | TODO |
| 9.5 | Remove `mediaAlbumId` from any remaining type | `grep "mediaAlbumId" apps/app/src/mainview/lib/types/` → 0 matches | TODO |
| 9.6 | Clean up `types/index.ts` exports | `bun run typecheck` exits 0 | TODO |
| 9.7 | `bun run typecheck` exits 0 | Run command | TODO |
| 9.8 | `bun run test` exits 0 | Run command | TODO |
| 9.9 | `bun run lint` exits 0 | Run command | TODO |

### Step 10: Update documentation

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 10.1 | Update `apps/app/src/mainview/components/CLAUDE.md` — document compositional UIMessage, single loading hook pattern | Manual review | TODO |
| 10.2 | Update `apps/app/src/mainview/lib/CLAUDE.md` — document that selector hydrates media URLs, store does NOT own message type transformation beyond raw storage | Manual review | TODO |

### Step 11: Final verification

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 11.1 | No component below ChatView reads from store cache dictionaries | `grep -r "mediaUrls\|thumbUrls\|profilePhotos\|customEmojiUrls" apps/app/src/mainview/components/chat/ --include="*.tsx"` → only ChatView.tsx if at all | TODO |
| 11.2 | UIMessage is a discriminated union | `grep "type UIMessage =" apps/app/src/mainview/lib/types/ui.ts` shows union with `kind` discriminant | TODO |
| 11.3 | Albums are one unit | A test or grep confirms no `groupUIMessages` call in components | TODO |
| 11.4 | Types pass | `bun run typecheck` exits 0 | TODO |
| 11.5 | Unit tests pass | `bun run test` exits 0 | TODO |
| 11.6 | Lint passes | `bun run lint` exits 0 | TODO |
| 11.7 | DevPage e2e passes | `cd apps/app && bun run test:e2e -- --project=dev` passes | TODO |
| 11.8 | Full e2e passes | `cd apps/app && bun run test:e2e` all pass | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself. If you need user input or manual tasks (browser login, UI verification, etc.), use chrome extension MCP tools or agent-browser to do it yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- Run `bun run scripts/symbols.ts .` before starting to orient on the codebase.
- Read `CLAUDE.md` files in any directory before editing files there.
- Use `bun run`, not bare `bun test`.
- Steps must be executed in order (1→2→3→...→11). Each step depends on the previous.
- After each step, run `bun run typecheck` to verify no type errors were introduced.
- The store's internal state (`messagesByChat`, `mediaUrls`, `thumbUrls`, etc.) does NOT change. Only the selector output and the types change.
- `requests.track()` deduplicates — safe to call `loadMedia`/`loadProfilePhoto` repeatedly from the unified hook.
- The selector subscribing to whole `mediaUrls`/`thumbUrls`/`profilePhotos`/`customEmojiUrls` maps is acceptable. The render body is cheap (map lookups). React.memo on PureMessageRow blocks DOM work for unchanged messages.
- Keep `UIMessageLegacy` alias alive during migration (steps 1-7). Delete in step 9.
- `onTranscribe` is a store action ref (`recognizeSpeech`). In the new model, pass it as a stable callback from ChatView, not embedded in the message. PureMessageRow receives it as a separate prop.
- `handleReplyClick` coordinates scroll + `loadMessagesAround`. It stays as a ChatView callback prop, not on the message.
- `handleReact` stays as a ChatView callback prop (`useCallback`-wrapped).
- DevPage fixture messages must be valid `UIMessage` union members. The easiest approach: create factory functions like `makePhotoMessage(overrides)` that produce correct compositional shapes.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/lib/types/ui.ts` | All UI type definitions. This is where the new compositional types go. Currently 181 lines, flat UIMessage. |
| `apps/app/src/mainview/lib/types/convert.ts` | Conversion from Td.message → UIMessage. 685 lines. `toUIMessage`, `groupUIMessages`, `enrichReplyPreviews`, all extract* helpers. Must be rewritten to produce new types. |
| `apps/app/src/mainview/lib/store/selectors.ts` | `selectChatMessages` — currently returns `UIMessageItem[]`. Must return `UIMessage[]` (new type) with hydrated URLs. 416 lines. |
| `apps/app/src/mainview/lib/store/types.ts` | Store state interface. Internal state unchanged. 237 lines. |
| `apps/app/src/mainview/lib/store/store.ts` | Store actions. `loadMedia`, `loadProfilePhoto`, etc. stay as-is. 1374 lines. |
| `apps/app/src/mainview/components/chat/ChatView.tsx` | Store boundary. Currently 430 lines with 6 media-loading useEffects. Becomes much simpler with new hook. |
| `apps/app/src/mainview/hooks/useMessage.ts` | `computeMessageState` — pure function. Must be rewritten to take new `UIMessage`. 318 lines. |
| `apps/app/src/mainview/components/chat/PureMessageRow.tsx` | Pure rendering switch. Must accept new `UIMessage` as single prop instead of 14 resolved props. 644 lines. |
| `apps/app/src/mainview/pages/DevPage.tsx` | Component catalog. Fixture data must use new types. |
| `apps/app/src/mainview/pages/dev-data.ts` | Fixture messages. Must produce new UIMessage shapes. |
| `apps/app/src/mainview/hooks/useVisibleMessages.ts` | IntersectionObserver hook. Unchanged — still returns `Set<number>`. |
| `apps/app/src/mainview/components/chat/ScrollContainer.tsx` | Pure scroll wrapper. Unchanged. |
| `apps/app/src/mainview/lib/store/store.test.ts` | 235 tests. Selector tests need updating. Need new tests for album grouping + hydration. |
| `apps/app/src/mainview/lib/types/__tests__/convert.test.ts` | Conversion tests. Need updating for new functions. |

### Reference implementations

| Source | What to take |
|--------|-------------|
| `apps/app/src/mainview/lib/types/convert.ts:452-498` | Current `toUIMessage` — all the extract* helpers are reusable. The individual extractors (extractText, extractMediaWidth, extractMinithumbnail, extractVoiceWaveform, etc.) don't change — they operate on `Td.MessageContent`. What changes is how their outputs are assembled. |
| `apps/app/src/mainview/lib/types/convert.ts:653-684` | Current `groupUIMessages` — the album grouping algorithm (consecutive same albumId) is reusable, just needs to produce `UIAlbumContent` instead of `UIMessageGroup`. |
| `apps/app/src/mainview/lib/store/selectors.ts:24-107` | Current `selectChatMessages` — the dep extraction pattern and memoization approach. Extend deps tuple with cache dictionaries. |
| `apps/app/src/mainview/components/chat/ChatView.tsx:106-180` | Current 6 media-loading useEffects — shows every media type that needs loading. The `loadMessageMedia` function must cover all of these. |
| `apps/app/src/mainview/hooks/useMessage.ts:149-314` | Current `computeMessageState` — the layout decision logic (when to use bubble vs media vs sticker vs album) is reusable, just needs to read from compositional fields. |

### Lessons learned

1. **UIMessage was a bag of 40 fields** where most are irrelevant for any given message type. `contentKind` was the only discriminant but TypeScript couldn't narrow on it. The new type uses a proper discriminated union (`content.kind`) that TypeScript can narrow.
2. **Albums were grouped too late** — in the component render loop, after the selector. This caused: IntersectionObserver only seeing the first album message, media loading only triggering for the first image, and the need for workarounds like `albumByFirstId`. Moving grouping into the selector eliminates all of this.
3. **Media URLs were detached from messages** — stored in separate dictionaries, looked up at render time with 6 different useEffects. Each new media type required a new useEffect. The hydration approach embeds URLs onto messages in the selector, so components just read `msg.content.media.url`.
4. **Forward, reply, caption are orthogonal to content type.** A video can be forwarded. A forwarded photo can have a reply. The flat UIMessage couldn't express this cleanly. The compositional model has independent layers.
5. **The store's internal state doesn't need to change.** `messagesByChat` holds raw `Td.message[]`. Cache dictionaries hold URLs. The selector is the transform boundary — it reads both and produces hydrated UI types. Actions stay as-is.
6. **`request-tracker.ts` makes the unified hook safe.** `loadMessageMedia` calls `loadMedia`/`loadProfilePhoto`/etc. for anything with `url === undefined`. The tracker prevents double-fetches. No need for the component to track what's been requested.
7. **`onTranscribe`, `handleReact`, `handleReplyClick` are action callbacks, not message data.** They stay as ChatView props passed to PureMessageRow — not embedded in the message. They're interaction handlers, not state.
8. **Service messages and pending messages are fundamentally different from regular messages.** They don't have content, forward, reply layers. The `kind` discriminant at the top level (`'message' | 'service' | 'pending'`) handles this cleanly.
9. **`enrichReplyPreviews` (in-batch resolution) stays.** When loading a batch of messages, some replies can be resolved from the same batch without a network call. This optimization still applies — just needs to mutate `replyTo.senderName`/`text` instead of setting a `replyPreview` object.
10. **Media URL three-state model**: `undefined` = not yet loaded (trigger a load), `null` = load failed / no file (stop trying), `string` = loaded blob URL. The selector maps from `mediaUrls[key]` which uses the same three states.
11. **Test coverage gap**: 0 tests for album grouping. Step 2 must add these before touching the selector.
12. **`selectUnresolvedReplies` can be removed.** Currently it returns `{ chatId, messageId }[]` for reply targets not in `replyPreviews`. In the new model, the loading hook detects `msg.replyTo.senderName === undefined` and calls `resolveReplyPreview`. Same trigger, different mechanism.
13. **`selectUnresolvedPinnedPreviews` stays.** Pinned preview resolution enriches service message text. The selector backfills from `pinnedPreviews` cache. The ChatView useEffect for triggering `resolvePinnedPreview` calls stays (or moves into the unified hook if pinned messages have `kind: 'service'`).
