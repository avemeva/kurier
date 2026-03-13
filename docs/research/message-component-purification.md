# Message Component Purification

## Goal

Purify the entire message rendering tree below ChatView. ChatView is the single store boundary — it reads store state, triggers media loading for visible messages via IntersectionObserver, resolves all per-message data via inline map lookups, and passes fully resolved props to pure components. Every component below ChatView is pure: props in, DOM out, zero store access, zero fetching, zero side effects. The DevPage renders messages from fixture data with zero store interaction, proving the component API works in isolation.

Success criteria:
```
grep -r "useChatStore" apps/app/src/mainview/components/chat/PureMessageRow.tsx → 0 matches
grep -r "useChatStore" apps/app/src/mainview/components/chat/ScrollContainer.tsx → 0 matches
grep -r "useChatStore" apps/app/src/mainview/components/chat/PureAlbumGrid.tsx → 0 matches
grep -r "useChatStore" apps/app/src/mainview/components/chat/FormattedText.tsx → 0 matches
grep -r "useMedia" apps/app/src/mainview/components/chat/ → 0 matches
grep -r "useReplyThumb" apps/app/src/mainview/components/chat/ → 0 matches
grep -r "useMedia" apps/app/src/mainview/hooks/useMessage.ts → 0 matches
grep -r "seedMedia" apps/app/src/mainview/pages/DevPage.tsx → 0 matches
grep -r "useChatStore" apps/app/src/mainview/pages/DevPage.tsx → 0 matches
bun run typecheck → exits 0
bun run test → exits 0
bun run lint → exits 0
DevPage loads at /dev with no console errors
cd apps/app && bun run test:e2e → all pass
```

## Entities and Responsibilities

### Store (Zustand)

Passive state machine between TDLib and the UI. Holds state, executes actions when asked, never decides what to load.

**Owns:**
- Holding raw TDLib state (`messagesByChat`, `chats`, `users`)
- Holding cached resource maps (`mediaUrls`, `thumbUrls`, `profilePhotos`, `replyPreviews`, `pinnedPreviews`)
- Exposing actions that fetch resources and update maps (`loadMedia`, `loadReplyThumb`, `loadProfilePhoto`, `resolveReplyPreview`, `recognizeSpeech`)
- Deduplicating requests via `request-tracker.ts` (`requests.track()` prevents double-fetches — safe to call repeatedly)
- Prefetching cheap metadata after message loads (`fetchMissingUsers`, `loadForwardPhotos` — already exists, keep as-is)
- Handling real-time TDLib events (`handleUpdate`)
- Optimistic updates for latency-sensitive actions (`send`, `react`)
- Pagination bookkeeping (`hasOlder`, `hasNewer`, `isAtLatest`, loading flags)

**Does NOT own:**
- Deciding what media to load — it doesn't know what's visible on screen
- Proactive media prefetching — both production Telegram clients (telegram-tt, Telegram-web-k) use visibility-driven loading, not store-level prefetching
- Scroll position or scroll behavior
- Layout decisions, visual rendering, message grouping

### ChatView (renamed from MessagePanel)

The single store boundary. The only component that reads from the store. Coordinator between store data and the pure rendering tree.

**Owns:**
- Reading all store slices needed for chat rendering: messages (via `selectChatMessages`), `mediaUrls`, `thumbUrls`, `profilePhotos`, `customEmojiUrls`, `recognizeSpeech`, pagination flags, loading flags, `searchMode`
- **Visibility tracking** via IntersectionObserver rooted at the scroll container — maintains `visibleMessageIds: Set<number>` of messages currently in the viewport
- **Triggering media/thumb/reply loading** for visible messages via useEffect — extends the existing `selectUnresolvedReplies` → useEffect pattern (MessagePanel.tsx:68-84). Only triggers for messages in `visibleMessageIds` where `mediaUrls[key] === undefined`
- **Resolving per-message data** via inline map lookups in the render loop — extends the existing `getSenderPhotoUrl` pattern (MessagePanel.tsx:169-174):
  - `senderPhotoUrl = profilePhotos[msg.senderUserId]`
  - `mediaUrl = mediaUrls[\`${chatId}_${msg.id}\`]`
  - `replyThumbUrl = thumbUrls[\`${chatId}_${msg.replyToMessageId}\`]`
  - `forwardPhotoUrl = profilePhotos[msg.forwardFromPhotoId]`
  - `linkPreviewThumbUrl = thumbUrls[\`${chatId}_${msg.id}\`]`
  - `onTranscribe = recognizeSpeech` (stable ref — PureMessageRow binds chatId/msgId args)
  - `albumMedia[] = album.messages.map(m => ({ url: mediaUrls[\`${chatId}_${m.id}\`], loading: ..., retry: ... }))`
  - `customEmojiUrls = subset of customEmojiUrls for emoji IDs found in visible messages' entities`
- **Grouping messages** (`groupUIMessages`, `getGroupPosition`, `getSenderId`, `getIsOutgoing`)
- Building fully resolved props and passing them to `PureMessageRow`
- Coordinating `handleReplyClick` — needs both scroll container ref (via ScrollContainer imperative handle) and `loadMessagesAround` from store
- Passing action handlers down: `onReact` (wrapped in `useCallback`), `onReplyClick`
- **Scanning message entities** for custom emoji IDs (`entities.filter(e => e.type === 'customEmoji')`) and triggering `loadCustomEmojiUrl` for visible messages. Passes resolved `customEmojiUrls` subset down.
- **Stabilizing props for React.memo**: `handleReact` via `useCallback`, `onTranscribe` as stable `(chatId, msgId) => void` ref (child binds args), `albumMedia` via custom memo comparator on PureMessageRow

**Does NOT own:**
- Scroll mechanics (delegated to ScrollContainer)
- How a message looks (delegated to PureMessageRow → layouts → Pure components)
- Media downloading (calls store actions, doesn't download itself)

### ScrollContainer (new, extracted from ChatView)

Generic scrollable container. Knows nothing about Telegram, messages, or media. Reusable anywhere a scrollable area with stick-to-bottom and infinite scroll is needed.

**Owns:**
- The scroll `<div>` element (the `absolute inset-0 overflow-y-auto` container currently inline in MessagePanel.tsx:209-261)
- `useStickToBottom` hook — RAF polling loop, pins scroll to bottom when stuck, stops when user scrolls away
- `useInfiniteScroll` hook — fires `onReachTop`/`onReachBottom` callbacks when scroll position nears edges
- Scroll reset on chat switch (useEffect watching `chatId` prop)
- Scroll-on-isAtLatest transition (useEffect watching `isAtLatest` prop)
- Exposing `scrollToMessage(messageId: number)` via `useImperativeHandle` — finds `#msg-{id}`, calls `scrollIntoView`, adds highlight class
- Exposing the scroll container DOM element ref (for ChatView's IntersectionObserver root)

**Props:** `onReachTop`, `onReachBottom`, `hasOlder`, `hasNewer`, `loadingOlder`, `isAtLatest`, `chatId`, `children`, `ref`

**Does NOT own:**
- What's inside it (receives children)
- Store access
- Media loading
- Knowledge of message data or Telegram

### PureMessageRow (renamed from Message, wrapped in React.memo)

Pure rendering switch. Receives fully resolved props. Picks the right layout. That's it.

**Owns:**
- Calling `computeMessageState(input, resolvedProps)` — pure function, returns `MessageRenderState`
- Switching on `state.layout` to render: `PureBubbleLayout`, `PureMediaLayout`, `PureAlbumLayout`, `PureStickerLayout`, `PurePendingLayout`, or `PureServiceMessage`
- The `id="msg-{id}"` attribute on its wrapper div (used by scroll-to-message and IntersectionObserver)
- Being wrapped in `React.memo` with a **custom comparator** — shallow-compares primitives, element-wise compares `albumMedia` url/loading values. This is needed because `albumMedia` is a new array each render. Most props (mediaUrl, replyThumbUrl, forwardPhotoUrl, etc.) are primitives that pass default shallow compare.

**Does NOT own:**
- Store access
- Data fetching
- Visibility tracking
- Any hooks

### computeMessageState (was useMessage hook)

Pure function. Not a hook anymore — zero hook calls inside.

**Owns:**
- Taking `MessageInput` + resolved props (mediaUrl, mediaLoading, replyThumbUrl, forwardPhotoUrl, linkPreviewThumbUrl, onTranscribe, albumMedia[]) and computing `MessageRenderState`
- Determining layout type: `service`, `pending`, `sticker`, `media`, `bubble`, `album`
- Computing display dimensions via `computeMediaSize`
- Computing bubble variant (`filled`, `media`, `framed`)
- Computing display type (`default`, `image`, `background`)
- Assembling all data the layout component needs into the render state

**Does NOT own:**
- `useMedia()` calls (removed — reads mediaUrl/mediaLoading from input)
- Any hooks
- Any side effects

### PureBubbleLayout (was BubbleLayout)

Pure. Renders text messages, voice messages, mixed media+text — anything that goes inside a `PureBubble` with the `filled` variant.

**Owns:**
- Rendering the correct combination of Pure components based on render state: `PureBubble` → `PureForwardHeader`, `PureReplyHeader`, `PurePhotoView`/`PureVideoView`/`PureVoiceView`, `PureFormattedText`, `PureLinkPreviewCard`, `PureReactionBar`, `PureBotKeyboard`, `PureMessageTime`
- Reading `forwardPhotoUrl`, `replyThumbUrl`, `linkPreviewThumbUrl`, `onTranscribe`, `customEmojiUrls` from the render state (NOT from the store)

**Does NOT own:**
- `useChatStore(s => s.profilePhotos)` (removed — reads from render state)
- `useChatStore(s => s.recognizeSpeech)` (removed — reads `onTranscribe` from render state)
- `useChatStore(s => s.thumbUrls)` (removed — reads from render state)
- `useReplyThumb()` (removed — reads `replyThumbUrl` from render state)

### PureMediaLayout (was MediaLayout)

Pure. Renders standalone photo/video/animation (no caption text, or framed with caption).

**Owns:**
- Rendering `PureBubble` → media view (`PurePhotoView` or `PureVideoView`) + optional text/reply/forward/reactions/time

**Does NOT own:**
- `useChatStore(s => s.profilePhotos)` (removed — reads `forwardPhotoUrl` from render state)

### PureAlbumLayout (was AlbumLayout)

Pure. Renders grouped media with grid.

**Owns:**
- Rendering `PureBubble` → optional sender/forward/reply headers + `PureAlbumGrid` + optional text/reactions/time

**Does NOT own:**
- `useChatStore(s => s.profilePhotos)` (removed — reads `forwardPhotoUrl` from render state)

### PureAlbumGrid (was AlbumGrid)

Pure. Grid positioning for album messages.

**Owns:**
- Computing grid layout geometry via `computeAlbumLayout`
- Rendering N `PureAlbumCell` components with correct position, size, border-radius

**Props:** `messages`, `albumMedia: Array<{ url: string | null, loading: boolean, retry?: () => void }>`, `maxWidth`

**Does NOT own:**
- `chatId` prop (removed — no longer needed)
- Media fetching

### PureAlbumCell (was AlbumCell)

Pure. Single cell in an album grid.

**Owns:**
- Rendering one `PurePhotoView` or `PureVideoView` at the given geometry with corner radius

**Props:** `msg`, `geometry`, `corners`, `url`, `loading`, `retry`

**Does NOT own:**
- `useMedia(chatId, msg.id)` (removed — receives url/loading/retry as props)

### PureStickerLayout (already pure, no changes)
### PurePendingLayout (already pure, no changes)
### Pure* leaf components (PureBubble, PurePhotoView, PureVideoView, PureVoiceView, PureForwardHeader, PureReplyHeader, PureLinkPreviewCard, PureReactionBar, PureMessageTime, PureStickerView, PureServiceMessage, PureBotKeyboard) — already pure, no changes needed.

### PureFormattedText (was FormattedText — NEEDS PURIFICATION)

Currently impure. Uses `useChatStore` to read `customEmojiUrls[documentId]` and triggers `loadCustomEmojiUrl(documentId)` on mount for each custom emoji entity.

**After purification:**
- Receives `customEmojiUrls: Record<string, CustomEmojiInfo>` as a prop
- Renders custom emojis from the prop map instead of subscribing to the store
- Zero store access, zero side effects

**Why it's feasible:** Entities are a flat `UITextEntity[]` array on each `UIMessage` (ui.ts:90). Custom emoji entities have `type === 'customEmoji'` and a `customEmojiId: string` field (ui.ts:35). ChatView scans visible messages' entities with `flatMap` + `filter`, collects unique IDs, triggers `loadCustomEmojiUrl` in a useEffect, and passes the resolved subset down.

### DevPage

Component catalog. Proves the API works without the store.

**Owns:**
- Constructing fully resolved props directly from fixture data (`MESSAGES`, `MEDIA_URLS`, `PROFILE_PHOTOS` from dev-data.ts)
- Passing props to `<PureMessageRow>` — no store, no seedMedia, no hooks

**Does NOT own:**
- `useChatStore` import (removed)
- `seedMedia` call (removed)
- Any store interaction

## Tree

```
Store (passive state holder)
│   messagesByChat, mediaUrls, thumbUrls, profilePhotos, replyPreviews
│   actions: loadMedia, loadReplyThumb, loadProfilePhoto, recognizeSpeech, ...
│
╔═══════════════════════════════════════════════════════════════════════╗
║ ChatView (SINGLE STORE BOUNDARY + COORDINATOR)                       ║
║                                                                       ║
║  reads store ──────────────────────────────────────────────────────── ║
║  IntersectionObserver(scrollRoot) → visibleMessageIds: Set<number>   ║
║  useEffect: trigger loadMedia/loadReplyThumb for visible msgs        ║
║  render: inline map lookups → resolved props per message             ║
║                                                                       ║
╚════════╦═════════════════════════════════════════╦════════════════════╝
         ║                                         ║
         ▼                                         ▼
  ┌─────────────────┐                    CornerButtons (sibling)
  │ ScrollContainer  │                    MessageInput (sibling)
  │ (generic)        │                    ComposeSearchBottomBar (sibling)
  │                  │
  │ owns:            │
  │  useStickToBottom│
  │  useInfiniteScroll
  │  scroll reset    │
  │  scrollToMessage │
  │                  │
  │ children:        │
  └────────┬─────────┘
           │
           ▼
  React.memo(PureMessageRow) × N ◄── pure, fully resolved props
           │
           │ computeMessageState() ◄── pure function, no hooks
           │
           ├─→ PureBubbleLayout ◄── pure
           │     ├─→ PureForwardHeader
           │     ├─→ PureReplyHeader
           │     ├─→ PurePhotoView / PureVideoView / PureVoiceView
           │     ├─→ PureFormattedText ◄── purified (was store-coupled)
           │     ├─→ PureLinkPreviewCard
           │     ├─→ PureReactionBar
           │     ├─→ PureBotKeyboard
           │     └─→ PureMessageTime
           │
           ├─→ PureMediaLayout ◄── pure
           │     ├─→ PureBubble
           │     ├─→ PurePhotoView / PureVideoView
           │     └─→ (same Pure* children as BubbleLayout)
           │
           ├─→ PureAlbumLayout ◄── pure
           │     ├─→ PureBubble
           │     ├─→ PureAlbumGrid ◄── pure
           │     │     └─→ PureAlbumCell × N ◄── pure, url/loading/retry as props
           │     └─→ (same Pure* children)
           │
           ├─→ PureStickerLayout ◄── pure (already)
           └─→ PurePendingLayout ◄── pure (already)


DevPage (INDEPENDENT — no store)
    │
    │  fixture data → resolved props
    │
    └─→ PureMessageRow × N ◄── same component, same props API
```

## What's been done

- Pure leaf components (PureBubble, PurePhotoView, PureVideoView, PureVoiceView, PureForwardHeader, PureReplyHeader, PureLinkPreviewCard, PureReactionBar, PureMessageTime, PureStickerView, PureServiceMessage, PureBotKeyboard) — already fully pure. No changes needed.
- StickerLayout and PendingLayout — already pure. Just need renaming to PureStickerLayout, PurePendingLayout.
- DevPage exists with fixture data: MESSAGES (28 UIMessages), MEDIA_URLS, PROFILE_PHOTOS — all plain objects. No fixture messages use custom emoji entities.
- MessagePanel already resolves `senderPhotoUrl` from `profilePhotos` via inline lookup (MessagePanel.tsx:169-174).
- MessagePanel already triggers `resolveReplyPreview` + `loadReplyThumb` via useEffect watching `selectUnresolvedReplies` (MessagePanel.tsx:68-84).
- Store already deduplicates via `request-tracker.ts` — `requests.track(category, key)` returns false if already requested. Safe to call loadMedia repeatedly.
- Store already prefetches users (`fetchMissingUsers`) and forward photos (`loadForwardPhotos`) after every message load — same pattern we extend.

## TODO

### Step 1: Extract ScrollContainer from MessagePanel

Extract scroll mechanics into a generic ScrollContainer component. MessagePanel renders messages as children inside it.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Create `ScrollContainer.tsx` at `apps/app/src/mainview/components/chat/ScrollContainer.tsx` | File exists | TODO |
| 1.2 | Move scroll `<div>` (currently MessagePanel.tsx:209-261) into ScrollContainer | `grep "overflow-y-auto" ScrollContainer.tsx` returns match | TODO |
| 1.3 | Move `useStickToBottom` into ScrollContainer | `grep "useStickToBottom" ScrollContainer.tsx` returns match | TODO |
| 1.4 | Move `useInfiniteScroll` into ScrollContainer | `grep "useInfiniteScroll" ScrollContainer.tsx` returns match | TODO |
| 1.5 | Move `combinedRef` logic into ScrollContainer | `grep "combinedRef\|scrollRef\|scrollContainerRef" MessagePanel.tsx` → 0 matches | TODO |
| 1.6 | Move scroll-on-chat-switch effect into ScrollContainer (reacts to `chatId` prop) | `grep "selectedChatId.*scrollToBottom" MessagePanel.tsx` → 0 matches | TODO |
| 1.7 | Move scroll-on-isAtLatest effect into ScrollContainer | `grep "prevIsAtLatestRef" MessagePanel.tsx` → 0 matches | TODO |
| 1.8 | Props: `onReachTop`, `onReachBottom`, `hasOlder`, `hasNewer`, `loadingOlder`, `isAtLatest`, `chatId`, `children` | `bun run typecheck` exits 0 | TODO |
| 1.9 | Expose `scrollToMessage(messageId)` via `useImperativeHandle` + `forwardRef` | `grep "scrollToMessage\|useImperativeHandle" ScrollContainer.tsx` returns matches | TODO |
| 1.10 | Expose scroll container DOM element ref (for ChatView's IntersectionObserver root) | `grep "scrollContainerRef\|containerRef" ScrollContainer.tsx` returns match | TODO |
| 1.11 | No store imports in ScrollContainer | `grep "useChatStore" ScrollContainer.tsx` → 0 matches | TODO |
| 1.12 | MessagePanel uses `<ScrollContainer>` with children | `grep "ScrollContainer" MessagePanel.tsx` returns match | TODO |
| 1.13 | `bun run typecheck` exits 0 | Run command | TODO |
| 1.14 | `bun run test` exits 0 | Run command | TODO |

### Step 2: Add IntersectionObserver to ChatView for visibility tracking

ChatView tracks which messages are visible in the viewport. This gates media loading — only visible messages trigger downloads.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Create `useVisibleMessages` hook at `apps/app/src/mainview/hooks/useVisibleMessages.ts` — takes scroll container ref, returns `Set<number>` of visible message IDs | File exists, `bun run typecheck` exits 0 | TODO |
| 2.2 | Hook creates IntersectionObserver rooted at the scroll container element | `grep "IntersectionObserver" useVisibleMessages.ts` returns match | TODO |
| 2.3 | Hook observes elements matching `[id^="msg-"]` pattern within the scroll container | `grep "msg-" useVisibleMessages.ts` returns match | TODO |
| 2.4 | Hook updates the Set when elements enter/leave viewport | `grep "isIntersecting" useVisibleMessages.ts` returns match | TODO |
| 2.5 | Hook cleans up observer on unmount | `grep "disconnect" useVisibleMessages.ts` returns match | TODO |
| 2.6 | Hook re-observes when children change (MutationObserver on scroll container to detect new `msg-` elements) | `grep "MutationObserver" useVisibleMessages.ts` returns match | TODO |
| 2.7 | Wire `useVisibleMessages` into MessagePanel (later renamed ChatView) | `grep "useVisibleMessages\|visibleMessageIds" MessagePanel.tsx` returns match | TODO |
| 2.8 | `bun run typecheck` exits 0 | Run command | TODO |
| 2.9 | `bun run test` exits 0 | Run command | TODO |

### Step 3: Move media/thumb loading triggers from components to ChatView

ChatView triggers `loadMedia`, `loadReplyThumb`, `loadProfilePhoto` for visible messages missing data. Extends the existing `selectUnresolvedReplies` useEffect pattern.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | ChatView reads `mediaUrls` from store | `grep "mediaUrls" MessagePanel.tsx` returns match in store read | TODO |
| 3.2 | ChatView reads `thumbUrls` from store | `grep "thumbUrls" MessagePanel.tsx` returns match in store read | TODO |
| 3.3 | Create `selectMessagesNeedingMedia` selector — returns `Array<{ chatId, messageId }>` for messages in current chat where `mediaUrls[key] === undefined` and message has media content | File/function exists | TODO |
| 3.4 | Create `selectMessagesNeedingThumbs` selector — returns `Array<{ chatId, messageId }>` for messages needing link preview thumbs or reply thumbs | File/function exists | TODO |
| 3.5 | ChatView useEffect: for messages in `visibleMessageIds` that need media → call `loadMedia` | `grep "loadMedia" MessagePanel.tsx` returns match inside useEffect | TODO |
| 3.6 | ChatView useEffect: for messages in `visibleMessageIds` that need thumbs → call `loadReplyThumb` | Code inspection | TODO |
| 3.7 | ChatView useEffect: for messages in `visibleMessageIds` that need profile photos → call `loadProfilePhoto` | Code inspection | TODO |
| 3.8 | Merge existing `unresolvedReplies` useEffect into the new unified loading effect | `grep "unresolvedReplies" MessagePanel.tsx` — now part of unified effect | TODO |
| 3.9 | ChatView reads `customEmojiUrls` from store | `grep "customEmojiUrls" MessagePanel.tsx` returns match in store read | TODO |
| 3.10 | ChatView useEffect: scan visible messages' entities for `customEmojiId`, call `loadCustomEmojiUrl` for unresolved IDs | Code inspection | TODO |
| 3.11 | `bun run typecheck` exits 0 | Run command | TODO |
| 3.12 | `bun run test` exits 0 | Run command | TODO |

### Step 4: Expand resolved props and ChatView render loop

ChatView resolves all per-message data via inline map lookups and passes fully resolved props to Message.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Define `ResolvedMessageProps` type with all resolved fields: `mediaUrl`, `mediaLoading`, `replyThumbUrl`, `forwardPhotoUrl`, `linkPreviewThumbUrl`, `onTranscribe`, `albumMedia[]`, `customEmojiUrls` | `grep "ResolvedMessageProps\|mediaUrl.*mediaLoading" apps/app/src/mainview/` returns match | TODO |
| 4.2 | ChatView render loop: resolve `mediaUrl = mediaUrls[\`${chatId}_${msg.id}\`]` per message | Code inspection | TODO |
| 4.3 | ChatView render loop: resolve `mediaLoading = mediaUrl === undefined` | Code inspection | TODO |
| 4.4 | ChatView render loop: resolve `replyThumbUrl = thumbUrls[\`${chatId}_${msg.replyToMessageId}\`]` | Code inspection | TODO |
| 4.5 | ChatView render loop: resolve `forwardPhotoUrl = profilePhotos[msg.forwardFromPhotoId]` | Code inspection | TODO |
| 4.6 | ChatView render loop: resolve `linkPreviewThumbUrl = thumbUrls[\`${chatId}_${msg.id}\`]` for messages with webPreview | Code inspection | TODO |
| 4.7 | ChatView: `onTranscribe` as stable `(chatId: number, msgId: number) => void` via `useCallback` wrapping `recognizeSpeech`. PureMessageRow/layout binds the specific chatId/msgId when calling. NOT a per-message closure. | Code inspection | TODO |
| 4.8 | ChatView render loop: for albums, resolve `albumMedia[] = album.messages.map(m => ({ url: mediaUrls[key], loading: ..., retry: ... }))` | Code inspection | TODO |
| 4.9 | ChatView render loop: resolve `customEmojiUrls` subset for messages with custom emoji entities | Code inspection | TODO |
| 4.10 | ChatView: wrap `handleReact` in `useCallback` (currently a plain function, recreated every render — defeats React.memo) | `grep "useCallback" MessagePanel.tsx` matches for handleReact | TODO |
| 4.11 | Pass resolved props to `<Message>` (still old name at this point) | Code inspection | TODO |
| 4.12 | `bun run typecheck` exits 0 | Run command | TODO |

### Step 5: Update DevPage to pass resolved props directly

DevPage constructs resolved props from fixture data. No store seeding. Proves the target API works before touching production rendering code.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | Update DevPage `<Message>` calls to pass resolved props: `mediaUrl={MEDIA_URLS[msg.id]}`, `senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}`, etc. | Code inspection | TODO |
| 5.2 | Remove `seedMedia` call from DevPage | `grep "seedMedia" apps/app/src/mainview/pages/DevPage.tsx` → 0 matches | TODO |
| 5.3 | Remove `useChatStore` import from DevPage | `grep "useChatStore" apps/app/src/mainview/pages/DevPage.tsx` → 0 matches | TODO |
| 5.4 | DevPage renders without console errors | `cd apps/app && bun run test:e2e -- --project=dev` passes | TODO |
| 5.5 | `bun run typecheck` exits 0 | Run command | TODO |

### Step 6: Purify computeMessageState — remove useMedia hook call

Remove `useMedia` from `useMessage`. It reads resolved media data from props instead.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Remove `useMedia` import and call from `useMessage` | `grep "useMedia" apps/app/src/mainview/hooks/useMessage.ts` → 0 matches | TODO |
| 6.2 | Add `mediaUrl`, `mediaLoading` to function params (from resolved props) | Code inspection | TODO |
| 6.3 | Map `mediaUrl`/`mediaLoading` to `MediaState` shape: `{ url: mediaUrl, loading: mediaLoading, retry: undefined }` | Code inspection | TODO |
| 6.4 | Add `albumMedia[]` to function params for album render state | Code inspection | TODO |
| 6.5 | Add `replyThumbUrl`, `forwardPhotoUrl`, `linkPreviewThumbUrl`, `onTranscribe` to function params | Code inspection | TODO |
| 6.6 | Populate new fields into the appropriate render state types (`BubbleRenderState`, `MediaRenderState`, `AlbumRenderState`) | Code inspection | TODO |
| 6.7 | Rename function from `useMessage` to `computeMessageState` (it's no longer a hook) | `grep "function computeMessageState" apps/app/src/mainview/hooks/useMessage.ts` returns match | TODO |
| 6.8 | Update all call sites | `grep "useMessage" apps/app/src/mainview/` → 0 matches | TODO |
| 6.9 | `bun run typecheck` exits 0 | Run command | TODO |

### Step 7: Purify layout components — remove all store access

Remove all `useChatStore` and `useReplyThumb` calls from BubbleLayout, MediaLayout, AlbumLayout. They read from render state props instead.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | BubbleLayout: remove `useChatStore(s => s.profilePhotos)`, read `state.forwardPhotoUrl` instead | Code inspection | TODO |
| 7.2 | BubbleLayout: remove `useChatStore(s => s.recognizeSpeech)`, read `state.onTranscribe` instead | Code inspection | TODO |
| 7.3 | BubbleLayout: remove `useChatStore(s => s.thumbUrls)` for link preview, read `state.linkPreviewThumbUrl` instead | Code inspection | TODO |
| 7.4 | BubbleLayout: remove `useReplyThumb()` call, read `state.replyThumbUrl` instead | Code inspection | TODO |
| 7.5 | MediaLayout: remove `useChatStore(s => s.profilePhotos)`, read `state.forwardPhotoUrl` instead | Code inspection | TODO |
| 7.6 | AlbumLayout: remove `useChatStore(s => s.profilePhotos)`, read `state.forwardPhotoUrl` instead | Code inspection | TODO |
| 7.7 | AlbumGrid: change props from `(messages, chatId, maxWidth)` to `(messages, albumMedia[], maxWidth)` | Code inspection | TODO |
| 7.8 | AlbumCell: remove `useMedia(chatId, msg.id)`, receive `url`, `loading`, `retry` as props | `grep "useMedia" apps/app/src/mainview/components/chat/AlbumGrid.tsx` → 0 matches | TODO |
| 7.9 | Remove all `useMedia` and `useReplyThumb` imports from Message.tsx | `grep "import.*useMedia\|import.*useReplyThumb" apps/app/src/mainview/components/chat/Message.tsx` → 0 matches | TODO |
| 7.10 | Zero store access in Message.tsx | `grep "useChatStore" apps/app/src/mainview/components/chat/Message.tsx` → 0 matches | TODO |
| 7.11 | FormattedText: remove `useChatStore` import, receive `customEmojiUrls: Record<string, CustomEmojiInfo>` as prop | `grep "useChatStore" apps/app/src/mainview/components/chat/FormattedText.tsx` → 0 matches | TODO |
| 7.12 | FormattedText: `CustomEmoji` sub-component reads from prop map instead of store subscription | Code inspection | TODO |
| 7.13 | FormattedText: remove `useEffect` that triggers `loadCustomEmojiUrl` — ChatView now owns this | `grep "useEffect" apps/app/src/mainview/components/chat/FormattedText.tsx` → 0 matches | TODO |
| 7.14 | Thread `customEmojiUrls` from PureMessageRow → layout → FormattedText (add to render state types) | Code inspection | TODO |
| 7.15 | `bun run typecheck` exits 0 | Run command | TODO |
| 7.16 | `bun run test` exits 0 | Run command | TODO |

### Step 8: Rename files and components

Rename to reflect the new architecture. Pure components get the `Pure` prefix.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 8.1 | Rename `MessagePanel.tsx` → `ChatView.tsx`, export `ChatView` | File exists at `ChatView.tsx`, `grep "export.*ChatView" ChatView.tsx` returns match | TODO |
| 8.2 | Rename `Message.tsx` → `PureMessageRow.tsx`, export `PureMessageRow` | File exists at `PureMessageRow.tsx` | TODO |
| 8.3 | Rename `BubbleLayout` → `PureBubbleLayout` inside PureMessageRow.tsx | `grep "PureBubbleLayout" PureMessageRow.tsx` returns match | TODO |
| 8.4 | Rename `MediaLayout` → `PureMediaLayout` inside PureMessageRow.tsx | `grep "PureMediaLayout" PureMessageRow.tsx` returns match | TODO |
| 8.5 | Rename `AlbumLayout` → `PureAlbumLayout` inside PureMessageRow.tsx | `grep "PureAlbumLayout" PureMessageRow.tsx` returns match | TODO |
| 8.6 | Rename `StickerLayout` → `PureStickerLayout` inside PureMessageRow.tsx | `grep "PureStickerLayout" PureMessageRow.tsx` returns match | TODO |
| 8.7 | Rename `PendingLayout` → `PurePendingLayout` inside PureMessageRow.tsx | `grep "PurePendingLayout" PureMessageRow.tsx` returns match | TODO |
| 8.8 | Rename `AlbumGrid.tsx` → `PureAlbumGrid.tsx`, rename `AlbumGrid` → `PureAlbumGrid`, `AlbumCell` → `PureAlbumCell` | File exists at `PureAlbumGrid.tsx` | TODO |
| 8.9 | Wrap `PureMessageRow` in `React.memo` with custom comparator — shallow-compare primitives, element-wise compare `albumMedia` url/loading values | `grep "memo" PureMessageRow.tsx` returns match | TODO |
| 8.9a | Rename `FormattedText` → `PureFormattedText`, update all imports | `grep "PureFormattedText" apps/app/src/mainview/components/chat/` returns matches | TODO |
| 8.10 | Update all imports across codebase | `grep -r "MessagePanel\b" apps/app/src/ --include="*.ts" --include="*.tsx"` → 0 matches (except route config if aliased) | TODO |
| 8.11 | Update all imports of `Message` → `PureMessageRow` | `grep -r "from.*['\"].*\/Message['\"]" apps/app/src/mainview/ --include="*.tsx"` → only DevPage and ChatView | TODO |
| 8.12 | Update all imports of `AlbumGrid` → `PureAlbumGrid` | `grep -r "from.*AlbumGrid" apps/app/src/mainview/` → only PureMessageRow.tsx | TODO |
| 8.13 | `bun run typecheck` exits 0 | Run command | TODO |
| 8.14 | `bun run test` exits 0 | Run command | TODO |
| 8.15 | `bun run lint` exits 0 | Run command | TODO |

### Step 9: Delete dead code

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 9.1 | Delete `useMedia.ts` | `ls apps/app/src/mainview/hooks/useMedia.ts` → file not found | TODO |
| 9.2 | Verify no remaining imports of useMedia | `grep -r "useMedia" apps/app/src/mainview/ --include="*.ts" --include="*.tsx"` → 0 matches | TODO |
| 9.3 | Delete entire `useReplyThumb.ts` — both `useReplyThumb` and `useRemoteReplyPreview` are dead code (zero consumers in the codebase) | `grep -r "useReplyThumb\|useRemoteReplyPreview" apps/app/src/mainview/ --include="*.ts" --include="*.tsx"` → 0 matches | TODO |
| 9.4 | Remove `seedMedia` from store if no longer used | `grep -r "seedMedia" apps/app/src/ --include="*.ts" --include="*.tsx"` → only in store definition (action still exists but unused, remove) | TODO |
| 9.5 | Remove `seedMedia` from `ChatState` type | `grep "seedMedia" apps/app/src/mainview/lib/store/types.ts` → 0 matches | TODO |
| 9.6 | `bun run typecheck` exits 0 | Run command | TODO |
| 9.7 | `bun run test` exits 0 | Run command | TODO |

### Step 10: Update documentation

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 10.1 | Update `apps/app/src/mainview/components/CLAUDE.md` — component type table: add ScrollContainer, rename MessagePanel→ChatView, rename Message→PureMessageRow, document Pure prefix convention | Manual review | TODO |
| 10.2 | Update `apps/app/src/mainview/lib/CLAUDE.md` — document that store does NOT own media prefetching, ChatView owns triggering. Mark anti-responsibility #2 as RESOLVED (selectors are already pure — side effects moved to component useEffects). | Manual review | TODO |
| 10.3 | `bun run lint` exits 0 | Run command | TODO |

### Step 11: Final verification

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 11.1 | All structural purity checks pass | Run all grep commands from success criteria — all return 0 matches | TODO |
| 11.2 | Types pass | `bun run typecheck` exits 0 | TODO |
| 11.3 | Unit tests pass | `bun run test` exits 0 | TODO |
| 11.4 | Lint passes | `bun run lint` exits 0 | TODO |
| 11.5 | DevPage e2e passes | `cd apps/app && bun run test:e2e -- --project=dev` passes | TODO |
| 11.6 | Full e2e passes | `cd apps/app && bun run test:e2e` all pass | TODO |
| 11.7 | No component below ChatView imports useChatStore | `grep -r "useChatStore" apps/app/src/mainview/components/chat/ --include="*.tsx"` → only `ChatView.tsx` | TODO |
| 11.8 | No component below ChatView imports useMedia or useReplyThumb | `grep -r "useMedia\|useReplyThumb" apps/app/src/mainview/components/chat/ --include="*.tsx"` → 0 matches | TODO |
| 11.9 | FormattedText has zero store access | `grep -r "useChatStore" apps/app/src/mainview/components/chat/FormattedText.tsx` → 0 matches | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself. If you need user input or manual tasks (browser login, UI verification, etc.), use chrome extension MCP tools or agent-browser to do it yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- Run `bun run scripts/symbols.ts .` before starting to orient on the codebase.
- Read `CLAUDE.md` files in any directory before editing files there.
- Check `apps/app/src/mainview/components/CLAUDE.md` for component type definitions.
- Check `apps/app/src/mainview/lib/CLAUDE.md` for store responsibilities and anti-patterns.
- Use `bun run`, not bare `bun test`.
- Steps must be executed in order (1→2→3→...→11). Each step depends on the previous.
- After each step, run `bun run typecheck` to verify no type errors were introduced.
- The app has no virtualization — all loaded messages are rendered in the DOM. IntersectionObserver observes actual DOM elements.
- `requests.track()` deduplicates — safe to call `loadMedia` repeatedly from ChatView's useEffect without worrying about double-fetches.
- `handleReact` MUST be wrapped in `useCallback` — it's currently a plain function that defeats React.memo.
- `onTranscribe` MUST be a stable `(chatId, msgId) => void` ref, NOT a per-message closure. PureMessageRow/layout binds the args.
- `PureMessageRow` React.memo MUST use a custom comparator that element-wise compares `albumMedia` url/loading values.
- `FormattedText` MUST be purified — it currently uses `useChatStore` for custom emojis. Receive `customEmojiUrls` as a prop instead.
- ChatView subscribing to whole `mediaUrls`/`thumbUrls`/`profilePhotos` maps is acceptable — the render body is cheap (map lookups), and React.memo on PureMessageRow blocks DOM work for unchanged messages. This replaces N per-component whole-map subscriptions with 1.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/components/chat/MessagePanel.tsx` | Renamed → `ChatView.tsx`. The single store boundary. Currently 290 lines. |
| `apps/app/src/mainview/components/chat/ScrollContainer.tsx` | NEW. Generic scroll container extracted from MessagePanel. |
| `apps/app/src/mainview/components/chat/Message.tsx` | Renamed → `PureMessageRow.tsx`. Pure switch + all layout components. 600 lines. |
| `apps/app/src/mainview/hooks/useMessage.ts` | Stays (renamed to `computeMessageState`). Remove `useMedia` call. 279 lines. |
| `apps/app/src/mainview/hooks/useMedia.ts` | DELETED. ChatView triggers loading, store holds URLs. |
| `apps/app/src/mainview/hooks/useReplyThumb.ts` | DELETED entirely. Both `useReplyThumb` and `useRemoteReplyPreview` are dead code (zero consumers). |
| `apps/app/src/mainview/components/chat/FormattedText.tsx` | Purified → `PureFormattedText`. Remove `useChatStore` for custom emojis. Receives `customEmojiUrls` as prop. |
| `apps/app/src/mainview/hooks/useVisibleMessages.ts` | NEW. IntersectionObserver hook returning visible message IDs. |
| `apps/app/src/mainview/hooks/useStickToBottom.ts` | Moves from ChatView to ScrollContainer. |
| `apps/app/src/mainview/hooks/useInfiniteScroll.ts` | Moves from ChatView to ScrollContainer. |
| `apps/app/src/mainview/components/chat/AlbumGrid.tsx` | Renamed → `PureAlbumGrid.tsx`. Purified — receives `albumMedia[]` instead of `chatId`. |
| `apps/app/src/mainview/pages/DevPage.tsx` | Remove `seedMedia`, remove `useChatStore`. Pass fixture URLs directly as props. |
| `apps/app/src/mainview/pages/dev-data.ts` | Fixture data. No changes needed. |
| `apps/app/src/mainview/lib/store/store.ts` | Minor: remove `seedMedia` action. Everything else stays. |
| `apps/app/src/mainview/lib/store/types.ts` | Minor: remove `seedMedia` from `ChatState`. |
| `apps/app/src/mainview/lib/store/selectors.ts` | Add `selectMessagesNeedingMedia`, `selectMessagesNeedingThumbs` selectors. |
| `apps/app/src/mainview/lib/scrollToMessage.ts` | Moves into ScrollContainer's imperative handle. |
| `apps/app/src/mainview/components/CLAUDE.md` | Update component type table. |
| `apps/app/src/mainview/lib/CLAUDE.md` | Update store responsibilities. |
| `apps/app/tests/e2e/dev-page.test.ts` | Must still pass. |

### Reference implementations

| Source | What to take |
|--------|-------------|
| `~/Projects/telegram-tt/src/components/middle/message/Photo.tsx:102` | `useIsIntersecting(ref, observeIntersection)` gates `shouldLoad`. Pattern: observe element, load only when visible. Adapt to ChatView-level observer instead of per-component. |
| `~/Projects/Telegram-web-k/src/components/lazyLoadQueue.ts` | `LazyLoadQueue` uses `VisibilityIntersector` (IntersectionObserver), processes only `wasSeen` items, pauses during heavy animations. Pattern: queue with visibility priority. |
| `~/Projects/Telegram-web-k/src/components/lazyLoadQueueIntersector.ts` | Base class showing how intersection observation + load queue + parallelism limit compose together. |
| `~/Projects/telegram-tt/src/util/mediaLoader.ts` | Module-level `memoryCache` Map + `fetchPromises` Map for dedup, separate from global state. Shows how telegram-tt keeps media cache as a standalone service, not in the store. Our `mediaUrls` in the store serves the same purpose. |
| `~/Projects/telegram-tt/src/hooks/useMedia.ts` | telegram-tt's useMedia — calls `mediaLoader.fetch()` in useEffect, reads from `mediaLoader.getFromMemory()` synchronously. Shows the pull model: component decides when to load, media service handles the rest. |
| `apps/app/src/mainview/components/chat/MessagePanel.tsx:68-84` | Existing pattern: `selectUnresolvedReplies` → useEffect → `resolveReplyPreview` + `loadReplyThumb`. ChatView already triggers fetches from the view layer. Extend this exact pattern to media and thumbs. |
| `apps/app/src/mainview/components/chat/MessagePanel.tsx:169-174` | Existing pattern: `getSenderPhotoUrl` does `profilePhotos[senderUserId]` inline in the render loop. Extend this to all per-message lookups. |
| `~/.claude/skills/components-build` | "Each exported component wraps a single HTML or JSX element." "Provider is the only place that knows how state is managed." ScrollContainer wraps scroll div. ChatView is the provider boundary. |
| `~/.claude/skills/vercel-react-best-practices` | `rerender-memo`: wrap PureMessageRow in React.memo. `rerender-derived-state`: ChatView resolves `profilePhotos[id]` → string per message instead of components subscribing to the whole map. |
| `~/.claude/skills/vercel-composition-patterns` | `state-decouple-implementation`: ChatView is the only place that knows state is Zustand. `patterns-children-over-render-props`: ScrollContainer takes children. |

### Lessons learned

1. Both production Telegram clients (telegram-tt, Telegram-web-k) use **visibility-driven media loading**, not store-level prefetching. The store doesn't know what's visible — the view layer does.
2. telegram-tt's `mediaLoader.ts` is a standalone module with its own `memoryCache` Map — NOT in the global store. Our `mediaUrls` in the Zustand store serves the same purpose but is reactive (Zustand subscriptions trigger re-renders when URLs arrive).
3. `requests.track()` in request-tracker.ts deduplicates all resource requests. Safe for ChatView to call `loadMedia` on every render cycle for messages missing URLs — the tracker prevents double-fetches.
4. `useMedia` hook currently fires on mount for EVERY rendered message (no virtualization = all loaded messages mount). Moving the trigger to ChatView with IntersectionObserver is strictly better — only visible messages trigger downloads.
5. `MEDIA_URLS` in dev-data.ts is keyed by message ID (number), not by `chatId_msgId` string. DevPage resolves via `MEDIA_URLS[msg.id]` directly since it doesn't go through the store.
6. `MediaState` type `{ url, loading, retry }` is a good shape for resolved media data. Keep it for the props API.
7. `AlbumGrid` currently receives `messages` and `chatId`. After refactor it receives `messages` and `albumMedia[]`. The `chatId` prop is removed.
8. `recognizeSpeech` is only used by voice messages in BubbleLayout. Only voice messages need `onTranscribe` in their resolved props.
9. `handleReplyClick` needs coordination: (a) scroll to message if in DOM via `scrollContainerRef.current.scrollToMessage(id)`, (b) `loadMessagesAround` then scroll for load-then-scroll case. ChatView coordinates both.
10. Forward photos use `forwardFromPhotoId` which is a user/chat ID, resolved via `profilePhotos[id]`. Most fixture messages have `forwardFromPhotoId: 0`, so this is often undefined.
11. The `selectUnresolvedReplies` → useEffect pattern in MessagePanel.tsx:68-84 is the proven pattern for view-layer-triggered loading. Extend it, don't reinvent it.
12. `FormattedText.tsx` is NOT pure — it uses `useChatStore` for `customEmojiUrls[documentId]` and triggers `loadCustomEmojiUrl` on mount per custom emoji entity. Must be purified. Custom emoji IDs are in a flat `entities: UITextEntity[]` array with `type === 'customEmoji'` and `customEmojiId: string` field — trivial for ChatView to scan and resolve.
13. `useRemoteReplyPreview` in `useReplyThumb.ts` has zero consumers anywhere in the codebase. Dead code — delete the entire file.
14. `handleReact` in MessagePanel.tsx (line 153) is a plain function, NOT wrapped in `useCallback`. It's recreated every render, defeating React.memo for every Message component today. This is an existing bug that must be fixed during the refactor.
15. Zustand's default comparison is `Object.is`. The per-key selector `s.mediaUrls[key]` returns a primitive — only that message re-renders when its URL resolves. Subscribing to the whole `s.mediaUrls` map returns a new object reference on every URL resolution (spread in store.ts:1029), causing full ChatView re-renders. The whole-map subscription is acceptable because ChatView's render body is cheap (map lookups) and React.memo on PureMessageRow blocks DOM work for unchanged messages.
16. `s.profilePhotos` is already subscribed as a whole map in N+1 places (MessagePanel + each layout component). Hoisting to ChatView and passing as primitive string props is a net improvement — replaces N whole-map subscriptions with 1.
17. lib/CLAUDE.md anti-responsibility #2 (side effects in selectors) is STALE — already fixed. Selectors are pure. Side effects are in component useEffects.
