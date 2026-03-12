# Sticker & Animated Emoji Architecture

## Goal

All sticker formats (WebP static, TGS animated, WEBM video), animated emoji (`messageAnimatedEmoji`), and custom emoji in text render correctly in the Kurier web app. The architecture supports future sticker pack browsing and sending.

**Success criteria:**
- `messageSticker` with `stickerFormatWebp` renders as static image (already works)
- `messageSticker` with `stickerFormatWebm` renders as looping video, not broken `<img>`
- `messageSticker` with `stickerFormatTgs` renders as animated Lottie, not broken `<img>`
- `messageAnimatedEmoji` renders as animated sticker (or static fallback emoji), not "Unsupported message"
- Custom emoji in text entities render as inline sticker images, not text fallback
- All sticker types show in chat list sidebar preview as emoji text (e.g. "🐸" not "Unsupported message")
- CLI: `messageAnimatedEmoji` shows as `{ content: "animatedemoji", emoji: "🐸" }` instead of raw TDLib dump

## Architecture

```
                     TDLib message
                          │
              ┌───────────┼──────────────┐
              │           │              │
    messageSticker  messageAnimated  textEntity
     .sticker        Emoji           CustomEmoji
     .format         .animated_emoji  .custom_emoji_id
     .full_type      .sticker?
                     .emoji
              │           │              │
              └───────────┼──────────────┘
                          │
                    ┌─────┴─────┐
                    │  sticker  │  ← same TDLib type in all three cases
                    │  .format  │
                    │  .sticker │  (file)
                    └─────┬─────┘
                          │
                ┌─────────┼─────────┐
                │         │         │
            WebP       TGS       WEBM
            <img>    Lottie    <video>
                │         │         │
                └─────────┼─────────┘
                          │
                    StickerView  ← single component, format-aware
                          │
            ┌─────────────┼──────────────────┐
            │             │                  │
      StickerLayout  AnimatedEmoji     CustomEmoji
      (chat msg)     Layout            (inline text)
      224px max      180px max         ~20px inline
      loop=format    playOnce=true     loop=true
```

**Constraints:**
- TGS files are gzipped Lottie JSON — must gunzip before passing to a Lottie player
- Need a Lottie runtime: `lottie-web` (~250KB, canvas/SVG) or `@nicepkg/lottie` — tdesktop uses native rlottie, most Telegram web clients use `lottie-web`
- WEBM stickers need `<video autoplay muted loop playsinline>` — no special library
- `messageAnimatedEmoji.animated_emoji.sticker` may be null (unknown emoji) — fall back to large emoji text
- Custom emoji require `getCustomEmojiStickers(ids[])` TDLib call — currently stubbed in daemon
- Daemon already serves `.tgs`, `.webm`, `.webp` with correct MIME types

## Acceptance Criteria

Two layers: **unit tests** (lock behavior in CI) and **browser checks** (prove it actually renders). Both are required.

### AC1: `messageAnimatedEmoji` converts to `contentKind: 'sticker'`

**Test file:** `apps/app/src/mainview/lib/types/__tests__/convert.test.ts`

Add fixture `MSG_ANIMATED_EMOJI` to `fixtures.ts` — a `messageAnimatedEmoji` with a TGS sticker and emoji `"🐸"`. Add tests:

```ts
it('converts animated emoji to sticker kind', () => {
  const ui = toUIMessage(MSG_ANIMATED_EMOJI, users, 0);
  expect(ui.contentKind).toBe('sticker');
  expect(ui.stickerFormat).toBe('tgs');
  expect(ui.stickerEmoji).toBe('🐸');
  expect(ui.mediaLabel).toBe('🐸');
});

it('converts animated emoji with null sticker', () => {
  const ui = toUIMessage(MSG_ANIMATED_EMOJI_NO_STICKER, users, 0);
  expect(ui.contentKind).toBe('sticker');
  expect(ui.stickerFormat).toBeNull();
  expect(ui.stickerEmoji).toBe('🎉');
  expect(ui.mediaLabel).toBe('🎉');
});
```

**Verify:** `bun run test -- convert.test` exits 0

### AC2: Sticker format is extracted for all three formats

**Test file:** `apps/app/src/mainview/lib/types/__tests__/convert.test.ts`

Add fixtures for WEBM and TGS stickers. Tests:

```ts
it('extracts stickerFormat webp from messageSticker', () => {
  const ui = toUIMessage(MSG_STICKER_INCOMING, users, 0);
  expect(ui.stickerFormat).toBe('webp');
  expect(ui.stickerEmoji).toBe('⭐');
});

it('extracts stickerFormat tgs from messageSticker', () => {
  const ui = toUIMessage(MSG_STICKER_TGS, users, 0);
  expect(ui.stickerFormat).toBe('tgs');
});

it('extracts stickerFormat webm from messageSticker', () => {
  const ui = toUIMessage(MSG_STICKER_WEBM, users, 0);
  expect(ui.stickerFormat).toBe('webm');
});
```

**Verify:** `bun run test -- convert.test` exits 0

### AC3: Sticker dimensions are extracted

**Test file:** `apps/app/src/mainview/lib/types/__tests__/convert.test.ts`

```ts
it('extracts sticker dimensions into mediaWidth/mediaHeight', () => {
  const ui = toUIMessage(MSG_STICKER_INCOMING, users, 0);
  expect(ui.mediaWidth).toBe(512);
  expect(ui.mediaHeight).toBe(512);
});

it('extracts animated emoji dimensions into mediaWidth/mediaHeight', () => {
  const ui = toUIMessage(MSG_ANIMATED_EMOJI, users, 0);
  expect(ui.mediaWidth).toBeGreaterThan(0);
  expect(ui.mediaHeight).toBeGreaterThan(0);
});
```

**Verify:** `bun run test -- convert.test` exits 0

### AC4: `StickerView` renders correct element per format

**Test file:** `apps/app/src/mainview/components/ui/chat/StickerView.test.tsx`

New test file using vitest + happy-dom + React Testing Library:

```tsx
it('renders <img> for webp sticker', () => {
  const { container } = render(<PureStickerView url="/test.webp" format="webp" />);
  expect(container.querySelector('img')).not.toBeNull();
});

it('renders <video> for webm sticker', () => {
  const { container } = render(<PureStickerView url="/test.webm" format="webm" />);
  const video = container.querySelector('video');
  expect(video).not.toBeNull();
  expect(video?.getAttribute('autoplay')).toBeDefined();
  expect(video?.getAttribute('loop')).toBeDefined();
  expect(video?.muted).toBe(true);
});

it('renders lottie container for tgs sticker', () => {
  const { container } = render(<PureStickerView url="/test.tgs" format="tgs" />);
  // Lottie target div or canvas exists
  expect(container.querySelector('[data-sticker-format="tgs"]')).not.toBeNull();
});

it('renders fallback emoji when format is null and emoji provided', () => {
  const { container } = render(<PureStickerView url={null} format={null} emoji="🐸" />);
  expect(container.textContent).toContain('🐸');
});

it('renders <img> for unknown/null format with url', () => {
  const { container } = render(<PureStickerView url="/test.unknown" format={null} />);
  expect(container.querySelector('img')).not.toBeNull();
});
```

**Verify:** `bun run test -- StickerView.test` exits 0

### AC5: Animated emoji preview in chat list sidebar

**Test file:** `apps/app/src/mainview/lib/types/__tests__/convert.test.ts`

```ts
it('returns emoji for animated emoji preview', () => {
  expect(extractMessagePreview(MSG_ANIMATED_EMOJI)).toBe('🐸');
});
```

**Verify:** `bun run test -- convert.test` exits 0

### AC6: CLI handles `messageAnimatedEmoji`

**Test file:** `apps/cli/tests/unit/slim.test.ts`

```ts
test('messageAnimatedEmoji: outputs type and emoji', () => {
  const content = slimContentVia({
    _: 'messageAnimatedEmoji',
    animated_emoji: {
      _: 'animatedEmoji',
      sticker: { /* sticker fields */ },
      sticker_width: 512,
      sticker_height: 512,
      fitzpatrick_type: 0,
      sound: undefined,
    },
    emoji: '🐸',
  } satisfies Td.messageAnimatedEmoji);

  expect(content.type).toBe('animatedemoji');
  const c = content as Rec;
  expect(c.emoji).toBe('🐸');
});

test('extractPreview returns emoji for messageAnimatedEmoji', () => {
  const msg = makeMessage({
    content: {
      _: 'messageAnimatedEmoji',
      animated_emoji: { /* ... */ },
      emoji: '🐸',
    } as Td.messageAnimatedEmoji,
  });
  expect(extractPreview(msg)).toBe('🐸');
});
```

**Verify:** `bun run test -- slim.test` exits 0

### AC7: All checks green

```bash
bun run typecheck   # exit 0
bun run test        # exit 0 (all new + existing tests pass)
bun run lint        # exit 0
```

### Browser ACs (verified via dev server + browser automation)

Dev server: `bun run dev:hmr` → `<worktree>.localhost:1355`. Use MCP browser tools or agent-browser to verify.

**Test chat:** Маруся (id `346928206`) — has animated emoji messages around March 7, 01:17.

### AC8: Animated emoji renders visually in chat (not "Unsupported message")

Navigate to chat `346928206`, scroll to message IDs `756627275776`, `756625178624`, `756623081472`.

```
Verify: page text near those messages does NOT contain "Unsupported message"
Verify: each message renders as either:
  - a sticker visual (img/video/canvas/svg element), OR
  - a large emoji character (when animated_emoji.sticker is null)
DOM check: document.querySelectorAll('[data-message-id="756627275776"] img, [data-message-id="756627275776"] video, [data-message-id="756627275776"] canvas').length > 0
```

### AC9: WEBM sticker renders as playing video

Find a WEBM sticker message in any chat (search sticker messages, check format).

```
DOM check: the sticker message contains a <video> element (not <img>)
DOM check: video.autoplay === true, video.muted === true, video.loop === true
Visual check: the video is playing (not a broken image icon or blank)
```

### AC10: TGS sticker renders as animation

Find a TGS sticker message in any chat.

```
DOM check: the sticker message contains a <canvas> or <svg> element (from lottie-web)
DOM check: element has non-zero width and height
Visual check: animation plays (take screenshot at t=0 and t=500ms, frames differ)
```

### AC11: Chat list sidebar shows emoji preview for animated emoji

Send or find a chat where the last message is an animated emoji.

```
Visual check: sidebar entry shows the emoji character (e.g. "🐸") in the preview text
DOM check: sidebar chat entry text does NOT contain "Unsupported message"
```

### AC12: Custom emoji in text renders as image/sticker (not Unicode fallback)

Find a message with `textEntityTypeCustomEmoji` entities.

```
DOM check: custom emoji elements render as <img>, <canvas>, or <svg> (not bare text spans)
Visual check: the custom emoji appears as a small sticker inline with the text
```

### Summary

| AC | Layer | What it proves | Verified by |
|----|-------|---------------|-------------|
| AC1 | unit | `messageAnimatedEmoji` → sticker kind + format + emoji + label | `convert.test.ts` |
| AC2 | unit | `stickerFormat` extracted for webp/tgs/webm | `convert.test.ts` |
| AC3 | unit | Sticker dimensions flow to `mediaWidth`/`mediaHeight` | `convert.test.ts` |
| AC4 | unit | `StickerView` renders correct DOM element per format | `StickerView.test.tsx` |
| AC5 | unit | `extractMessagePreview` returns emoji for animated emoji | `convert.test.ts` |
| AC6 | unit | CLI slim + extractPreview handle animated emoji | `slim.test.ts` |
| AC7 | unit | No regressions: typecheck + test + lint | all suites |
| AC8 | browser | Animated emoji visible in chat, not "Unsupported" | dev server |
| AC9 | browser | WEBM sticker plays as `<video>` | dev server |
| AC10 | browser | TGS sticker animates via lottie | dev server |
| AC11 | browser | Sidebar preview shows emoji | dev server |
| AC12 | browser | Custom emoji renders as sticker inline | dev server |

## What's Been Done

- `messageSticker` → `contentKind: 'sticker'` mapping exists in `convert.ts:29`
- `StickerLayout` component exists in `Message.tsx:125-166` — renders via `PurePhotoView` (img only)
- `getFileFromContent` handles `messageSticker` at `telegram.ts:502`
- `getThumbnailFile` handles `messageSticker` at `telegram.ts:522`
- `CustomEmoji` component exists in `FormattedText.tsx:5-23` — but `getCustomEmojiUrl` is stubbed to null
- `textEntityTypeCustomEmoji` is extracted in `convert.ts:389-391`
- Daemon MIME map includes `.tgs` → `application/x-tgsticker`, `.webm` → `video/webm` (`packages/protocol/src/proxy/index.ts:40`)
- CLI `slimContent` handles `messageSticker` at `slim.ts:370-371`
- WEBM sticker bug is documented in `docs/research/image-rendering-fixes.md:72`

## TODO

### Step 1: Add sticker metadata to UIMessage

Extract sticker format, dimensions, and set ID through the conversion layer so the renderer can branch on format.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Add `stickerFormat: 'webp' \| 'tgs' \| 'webm' \| null` to `UIMessage` in `ui.ts` | `grep stickerFormat apps/app/src/mainview/lib/types/ui.ts` returns a match | TODO |
| 1.2 | Add `stickerEmoji: string` to `UIMessage` in `ui.ts` | `grep stickerEmoji apps/app/src/mainview/lib/types/ui.ts` returns a match | TODO |
| 1.3 | Extract `stickerFormat` from `messageSticker` content in `convert.ts` — map `stickerFormatWebp` → `'webp'`, `stickerFormatTgs` → `'tgs'`, `stickerFormatWebm` → `'webm'` | `bun run typecheck` passes | TODO |
| 1.4 | Extract sticker dimensions (`width`, `height`) into `mediaWidth`/`mediaHeight` for `messageSticker` in `extractMediaWidth`/`extractMediaHeight` (`convert.ts:139-157`) | `bun run typecheck` passes | TODO |
| 1.5 | Extract minithumbnail for stickers in `extractMinithumbnail` (`convert.ts:159-163`) | `bun run typecheck` passes | TODO |

### Step 2: Handle `messageAnimatedEmoji` in conversion layer

Wire `messageAnimatedEmoji` through the same path as `messageSticker` but with appropriate defaults.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Add `messageAnimatedEmoji: 'sticker'` to `CONTENT_KIND_MAP` in `convert.ts:23` | `grep messageAnimatedEmoji apps/app/src/mainview/lib/types/convert.ts` returns a match | TODO |
| 2.2 | Handle `messageAnimatedEmoji` in `extractMediaLabel` — return `content.emoji` | `bun run typecheck` passes | TODO |
| 2.3 | Handle `messageAnimatedEmoji` in `extractMediaWidth`/`extractMediaHeight` — use `content.animated_emoji.sticker_width` / `sticker_height` | `bun run typecheck` passes | TODO |
| 2.4 | Handle `messageAnimatedEmoji` in `extractMinithumbnail` — use `content.animated_emoji.sticker?.thumbnail?.file` if available | `bun run typecheck` passes | TODO |
| 2.5 | Extract `stickerFormat` for `messageAnimatedEmoji` — from `content.animated_emoji.sticker?.format` (may be null → fall back to `null`) | `bun run typecheck` passes | TODO |
| 2.6 | Extract `stickerEmoji` for `messageAnimatedEmoji` — `content.emoji` | `bun run typecheck` passes | TODO |
| 2.7 | Handle `messageAnimatedEmoji` in `getFileFromContent` (`telegram.ts:483`) — return `content.animated_emoji.sticker?.sticker ?? null` | `bun run typecheck` passes | TODO |
| 2.8 | Handle `messageAnimatedEmoji` in `getThumbnailFile` (`telegram.ts:510`) — return `content.animated_emoji.sticker?.thumbnail?.file ?? null` | `bun run typecheck` passes | TODO |
| 2.9 | All tests pass | `bun run test` exits 0 | TODO |

### Step 3: `StickerView` component — format-aware renderer

Replace `PurePhotoView` usage in `StickerLayout` with a new `StickerView` that handles all three formats. This is a Pure component (props only, no hooks, no store).

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Create `apps/app/src/mainview/components/ui/chat/StickerView.tsx` — Pure component accepting `{ url, format, width?, height?, loop?, className? }` | File exists and exports `PureStickerView` | TODO |
| 3.2 | WebP path: render `<img>` (same as current `PurePhotoView` behavior) | Load a WebP sticker in dev server — renders as image | TODO |
| 3.3 | WEBM path: render `<video autoplay muted loop playsinline>` with the URL | Load a WEBM sticker in dev server — renders as looping video | TODO |
| 3.4 | TGS path: placeholder — render fallback emoji text or static thumbnail until step 4 | `bun run typecheck` passes | TODO |
| 3.5 | Null/unknown format fallback: render `<img>` (safe default) | `bun run typecheck` passes | TODO |
| 3.6 | Replace `PurePhotoView` with `PureStickerView` in `StickerLayout` (`Message.tsx:147`) | `grep PureStickerView apps/app/src/mainview/components/chat/Message.tsx` returns match | TODO |
| 3.7 | Pass `stickerFormat` and `stickerEmoji` from `msg` to `PureStickerView` | `bun run typecheck` passes | TODO |
| 3.8 | Animated emoji fallback: when `stickerFormat` is null (sticker not available), render the emoji character large (e.g. 128px font-size centered) | Visual: animated emoji with null sticker shows large emoji | TODO |
| 3.9 | All tests pass | `bun run test` exits 0 | TODO |

### Step 4: Lottie runtime for TGS stickers

Add a Lottie player library and wire TGS rendering. TGS files are gzipped Lottie JSON.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Add `lottie-web` dependency: `bun add lottie-web` in `apps/app/` | `grep lottie-web apps/app/package.json` returns match | TODO |
| 4.2 | Add `pako` (or use `DecompressionStream` API) for gunzipping TGS | TGS decompression works in browser (test with a real `.tgs` file) | TODO |
| 4.3 | Update TGS path in `PureStickerView`: fetch URL → gunzip → parse JSON → pass to `lottie-web` canvas/svg renderer | Load a TGS sticker in dev server — renders as animation | TODO |
| 4.4 | Sticker loop behavior: regular stickers loop, animated emoji plays once (use `loop` prop) | TGS sticker loops; animated emoji TGS plays once | TODO |
| 4.5 | Respect reduced-motion preference: `prefers-reduced-motion` → show static first frame | `window.matchMedia('(prefers-reduced-motion: reduce)')` → animation paused | TODO |
| 4.6 | All tests pass | `bun run test` exits 0 | TODO |

### Step 5: File-scoped download path

Currently downloads are message-scoped (`chatId_messageId` → URL). Custom emoji and sticker pack previews need file-scoped downloads.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | Add `downloadFile(fileId: number): Promise<string \| null>` to `telegram.ts` — same pattern as `downloadMedia` but keyed on `file_${fileId}` | `grep downloadFile apps/app/src/mainview/lib/telegram.ts` returns new function | TODO |
| 5.2 | Add `fileUrls: Record<string, string \| null>` to store (parallel to `mediaUrls`) | `grep fileUrls apps/app/src/mainview/lib/store.ts` returns match | TODO |
| 5.3 | Add `loadFile(fileId: number)` action to store | `grep loadFile apps/app/src/mainview/lib/store.ts` returns match | TODO |
| 5.4 | All tests pass | `bun run test` exits 0 | TODO |

### Step 6: Custom emoji in text

Wire `CustomEmoji` component to actually download and render sticker files via `getCustomEmojiStickers` TDLib call.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Replace `getCustomEmojiUrl` stub in `telegram.ts:587` — call `getCustomEmojiStickers({ custom_emoji_ids: [id] })` via TDLib, then `downloadFile` on the sticker file | `grep 'getCustomEmojiStickers' apps/app/src/mainview/lib/telegram.ts` returns match | TODO |
| 6.2 | Batch custom emoji requests — collect IDs during a render cycle, fetch up to 200 at once | Single TDLib call for multiple custom emoji in one message | TODO |
| 6.3 | Update `CustomEmoji` component to use `PureStickerView` at inline size (~20px) instead of `<img>` | `grep PureStickerView apps/app/src/mainview/components/chat/FormattedText.tsx` returns match | TODO |
| 6.4 | All tests pass | `bun run test` exits 0 | TODO |

### Step 7: CLI support

Add explicit `messageAnimatedEmoji` handling to the CLI.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | Add `messageAnimatedEmoji` case to `slimContent` in `slim.ts:281` — output `{ type: 'animatedemoji', emoji: c.emoji }` (match existing `messageSticker` pattern) | `agent-telegram msg get 346928206 756627275776 \| jq .data.content` returns `{ "type": "animatedemoji", "emoji": "🐸" }` | TODO |
| 7.2 | Add `messageAnimatedEmoji` case to `extractPreview` in `slim.ts:106` — return `c.emoji` | `agent-telegram msg list 346928206 --limit 50 \| jq '.data[] \| select(.content == "animatedemoji")'` shows emoji in output | TODO |
| 7.3 | All tests pass | `bun run test` exits 0 | TODO |

### Step 8: Sticker pack browsing infrastructure (foundation only)

Wire the TDLib calls needed for future sticker pack UI. No UI in this step — just the data layer.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 8.1 | Add `getInstalledStickerSets()` wrapper to `telegram.ts` — calls TDLib `getInstalledStickerSets` with `sticker_type: stickerTypeRegular` | `grep getInstalledStickerSets apps/app/src/mainview/lib/telegram.ts` returns match | TODO |
| 8.2 | Add `getStickerSet(setId: string)` wrapper to `telegram.ts` | `grep getStickerSet apps/app/src/mainview/lib/telegram.ts` returns match | TODO |
| 8.3 | Add sticker set state to store: `stickerSets: Map<string, StickerSetInfo>`, `loadInstalledStickerSets()`, `loadStickerSet(id)` | `grep stickerSets apps/app/src/mainview/lib/store.ts` returns match | TODO |
| 8.4 | `bun run typecheck` passes | Exit 0 | TODO |

## Context for Future Agents

### Instructions for agents
- Do not ask questions — figure it out yourself
- Run `bun run scripts/symbols.ts .` before editing code — orient with the symbol map
- Check for `CLAUDE.md` in any directory before editing files there
- Read `apps/app/src/mainview/components/CLAUDE.md` — it defines the Pure/Bubble/Message/Panel component hierarchy. `StickerView` is a Pure component.
- Use `bun run dev:hmr` to test visually (run in background). Dev URL: `<worktree-name>.localhost:1355`
- Use `bun run typecheck` and `bun run test` after each step
- Use `bun run lint` before committing
- Do not stop until all TODOs are done
- Output COMPLETE when ALL steps are finished

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/lib/types/ui.ts:83-116` | `UIMessage` type — add sticker fields here |
| `apps/app/src/mainview/lib/types/convert.ts:23-38` | `CONTENT_KIND_MAP` — add `messageAnimatedEmoji` here |
| `apps/app/src/mainview/lib/types/convert.ts:61-92` | `extractMediaLabel` — add animated emoji case |
| `apps/app/src/mainview/lib/types/convert.ts:139-163` | `extractMediaWidth/Height/Minithumbnail` — add sticker+animEmoji cases |
| `apps/app/src/mainview/lib/telegram.ts:483-507` | `getFileFromContent` — add `messageAnimatedEmoji` case |
| `apps/app/src/mainview/lib/telegram.ts:510-547` | `getThumbnailFile` — add `messageAnimatedEmoji` case |
| `apps/app/src/mainview/lib/telegram.ts:585-595` | `getCustomEmojiUrl` — replace stub with real implementation |
| `apps/app/src/mainview/hooks/useMessage.ts:170-179` | Sticker render state creation — pass new fields through |
| `apps/app/src/mainview/components/chat/Message.tsx:125-166` | `StickerLayout` — replace `PurePhotoView` with `PureStickerView` |
| `apps/app/src/mainview/components/chat/FormattedText.tsx:5-23` | `CustomEmoji` — upgrade to use `PureStickerView` |
| `apps/app/src/mainview/components/ui/chat/PhotoView.tsx` | `PurePhotoView` — reference for img rendering patterns |
| `apps/app/src/mainview/components/CLAUDE.md` | Component hierarchy rules (Pure/Bubble/Message/Panel) |
| `apps/app/src/mainview/lib/store.ts:1310-1343` | Media URL store — add `fileUrls` and `loadFile` parallel to `mediaUrls` |
| `apps/cli/src/slim.ts:281-389` | `slimContent` — add `messageAnimatedEmoji` case |
| `apps/cli/src/slim.ts:106-146` | `extractPreview` — add `messageAnimatedEmoji` case |
| `packages/protocol/src/proxy/index.ts:40` | MIME map — already has `.tgs`, `.webm`, `.webp` |

### Reference implementations

| Source | What to take |
|--------|-------------|
| tdesktop `history_view_sticker.cpp:606-622` | Format-based renderer selection (Lottie vs WEBM vs static) |
| tdesktop `history_view_element.cpp:1483-1510` | Isolated emoji → sticker decision logic |
| tdesktop `stickers_emoji_pack.cpp` | Emoji-to-sticker mapping, skin tone color replacements |
| tdesktop `history_view_emoji_interactions.cpp` | Tap-burst interaction overlay (future: interaction protocol) |
| TDLib types `tdlib-types.d.ts:1265` | `sticker` type — format, full_type, dimensions, file |
| TDLib types `tdlib-types.d.ts:12785` | `messageAnimatedEmoji` — animated_emoji with optional sticker |
| TDLib types `tdlib-types.d.ts:1360` | `animatedEmoji` — sticker, dimensions, fitzpatrick_type, sound |

### Lessons learned

1. tdesktop does NOT use TDLib — it uses MTProto directly. `messageAnimatedEmoji` is a TDLib abstraction. tdesktop detects "isolated emoji" (1-3 emoji, no other text) client-side and resolves to stickers from `inputStickerSetAnimatedEmoji` server sticker set. TDLib pre-resolves this for us.
2. `animated_emoji.sticker` can be null for emoji that don't have animated versions — always fall back to rendering the emoji character large.
3. TGS files are gzipped Lottie JSON. Must decompress before passing to `lottie-web`. The browser `DecompressionStream('gzip')` API works and avoids adding `pako` dependency.
4. Animated emoji in tdesktop plays once (not looped) and is 256px max (vs 512px for regular stickers). The 256/512 ratio is ~0.5, so animated emoji should be smaller than regular stickers.
5. `getCustomEmojiStickers` accepts up to 200 IDs in one call — batch requests during render to avoid N+1.
6. The daemon already serves `.tgs` with `application/x-tgsticker` MIME and `.webm` with `video/webm` — no server changes needed.
7. Custom emoji stickers may have `needs_repainting: true` in `stickerFullTypeCustomEmoji` — these are monochrome stickers that should be tinted to match the surrounding text color (like tdesktop's color replacement system).
