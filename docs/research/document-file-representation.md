# Document File Representation — Phase 2

## Goal

Four fixes to complete document message support:
1. **Download**: Clicking the file icon downloads/opens the document
2. **Sidebar preview**: Show filename (not "File") in chat list when document is the last message
3. **Channel sender**: Show channel name on every message in channel chats
4. **Forward from unknown channel**: Show "Forwarded from ..." even when the origin channel isn't in the user's chat list

**Success criteria:**
```bash
bun run typecheck && bun run test && bun run lint
# Dev harness: document fixture shows clickable file icon
# Sidebar: document-only message shows filename
# Channel messages show channel name as sender
# Forwarded message from unknown channel shows forward header
```

## Architecture

```
Issue 1 (Download):
  TGDocumentContent.url ← hydrateContent ← mediaUrls ← use-message-media-loader → store.loadMedia

Issue 2 (Sidebar):
  extractMediaLabel('messageDocument') → content.document.file_name (instead of 'File')

Issue 3 (Channel name):
  pure-chat-view.tsx: showSender includes 'channel'
  toTGSender: resolve messageSenderChat via chats array

Issue 4 (Forward from unknown channel):
  extractForwardName: return author_signature or 'Channel' when chat not found
  (async title fetch is deferred — requires store-level getChat integration)
```

## TODO

### Step 1: Document download

Depends on: nothing

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Add `url: string \| undefined` to `TGDocumentContent` in `tg.ts` | `bun run typecheck` (expect errors in convert.ts) | TODO |
| 1.2 | Set `url: undefined` in `toTGContent` case `messageDocument` | `bun run typecheck` exits 0 | TODO |
| 1.3 | In `hydrateContent` case `document`: hydrate URL from `mediaUrls` — follow the `voice` pattern (check `mediaKey`, set `url` if found) | `grep 'url.*mediaUrls' convert.ts` matches in document case | TODO |
| 1.4 | In `use-message-media-loader.ts`: add `case 'document':` that calls `store.loadMedia(chatId, msgId)` when `content.url === undefined` | `grep "'document'" use-message-media-loader.ts` matches | TODO |
| 1.5 | In `message-rendering.ts`: add `url: string \| undefined` to `documentContent` type and populate from `content.url` | `bun run typecheck` exits 0 | TODO |
| 1.6 | Update `PureDocumentView` to accept `url` prop. Make the icon a download link — when url exists, wrap icon in `<a href={url} download={fileName}>`, show download arrow overlay. When no url, show spinner. | `grep 'url' document-view.tsx` matches | TODO |
| 1.7 | Update `pure-message-row.tsx` to pass `url` to `PureDocumentView` | `bun run typecheck` exits 0 | TODO |

### Step 2: Sidebar filename preview

Depends on: nothing (parallel with Step 1)

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | In `convert.ts` `extractMediaLabel`: change `messageDocument` case to return `content.document?.file_name \|\| 'File'` | `grep 'file_name' convert.ts` near extractMediaLabel | TODO |
| 2.2 | The text flow: `extractMessagePreview` → `extractText` (returns caption) → falls back to `extractMediaLabel` (now returns filename). Verify this works for both caption and no-caption cases | `bun run test` exits 0 | TODO |

### Step 3: Channel sender name

Depends on: nothing (parallel)

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | In `pure-chat-view.tsx`: change `showSender` to include channels: `const showSender = isGroup \|\| chatKind === 'channel'` | `grep 'channel' pure-chat-view.tsx` near showSender | TODO |
| 3.2 | In `convert.ts` `toTGSender`: pass `chats` parameter and resolve `messageSenderChat` by looking up `chat.title`. Update `toTGMessage` to pass `chats` to `toTGSender`. | `grep 'messageSenderChat' convert.ts` near toTGSender shows chat lookup | TODO |
| 3.3 | Also in `resolveSenderName`: handle `messageSenderChat` with chats lookup | `bun run typecheck` exits 0 | TODO |

### Step 4: Forward from unknown channel

Depends on: nothing (parallel)

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | In `convert.ts` `extractForwardName` case `messageOriginChannel`: when chat not found, return `origin.author_signature \|\| 'Channel'` instead of `null` | `grep 'Channel' convert.ts` near extractForwardName | TODO |
| 4.2 | Same fix for `messageOriginChat`: return `'Group'` instead of `null` | `grep 'Group' convert.ts` near extractForwardName | TODO |

### Step 5: Update fixture and verify

Depends on: Steps 1-4

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | Update `document-file` fixture: add `url` field to document content | Fixture loads without error | TODO |
| 5.2 | Typecheck | `bun run typecheck` exits 0 | TODO |
| 5.3 | All tests pass | `bun run test` exits 0 | TODO |
| 5.4 | Lint | `bun run lint` exits 0 | TODO |

## Context for future agents

### Key files
| File | Why |
|------|-----|
| `data/types/tg.ts:261` | TGDocumentContent — add `url` field |
| `data/types/convert.ts:640` | toTGContent messageDocument — set `url: undefined` |
| `data/types/convert.ts:1129` | hydrateContent document — hydrate URL |
| `data/types/convert.ts:66` | extractMediaLabel — return filename |
| `data/types/convert.ts:222` | extractForwardName — fallback for unknown channels |
| `data/types/convert.ts:692` | toTGSender — resolve messageSenderChat |
| `data/hooks/use-message-media-loader.ts` | Add document case |
| `components/ui/chat/document-view.tsx` | Add url/download props |
| `components/ui/chat/message-rendering.ts:106` | Add url to documentContent |
| `components/ui/chat/pure-message-row.tsx:211` | Pass url |
| `components/ui/chat/pure-chat-view.tsx:57` | showSender for channels |

### Reference patterns
| Source | What to take |
|--------|-------------|
| `voice` in `hydrateContent` (convert.ts:1084) | URL hydration from mediaUrls |
| `voice` in `use-message-media-loader.ts` | `store.loadMedia()` trigger pattern |
| `voice-view.tsx` url/loading/onRetry props | Download state management |
