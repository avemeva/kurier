# Media Dimension Reservation (Layout Shift Elimination)

## Goal

Every message media element (photo, video, animation, sticker) reserves its final pixel dimensions on first render, before the actual media loads. When a chat opens, `scrollHeight` stabilizes within one frame — no content reflows as images, videos, or stickers load in.

```
Success criteria:
  bun run typecheck                                                    # exits 0
  bun run test                                                         # exits 0
  bun run lint                                                         # exits 0
  E2E: open chat with videos → no scrollHeight change after messages render
  E2E: open chat with stickers → no scrollHeight change after messages render
  E2E: open chat with GIFs → no scrollHeight change after messages render
  E2E: video placeholder has correct aspect-ratio before video loads
  E2E: sticker container has explicit width/height before image loads
```

## Architecture

```
TDLib message content
  → extractMediaWidth/Height (convert.ts)     ← extracts from TDLib types
    → UIMessage { mediaWidth, mediaHeight, minithumbnail }
      → useMessage hook (useMessage.ts)       ← computes displayWidth/Height via computeMediaSize
        → MediaRenderState / StickerRenderState / BubbleRenderState
          → Message.tsx                        ← routes to layout (media/sticker/bubble/album)
            → PurePhotoView / PureVideoView   ← renders with or without dimensions
```

### Current state: which media reserves space?

| Content Kind | Layout | Reserves space? | Gap |
|---|---|---|---|
| Photo | media | Yes — `aspect-ratio` CSS from `computeMediaSize` | None |
| Video | media | **No** — `displayWidth`/`displayHeight` computed but never passed to `PureVideoView` | VideoView doesn't accept width/height props |
| Animation/GIF | media | **No** — same as video | Same gap |
| Sticker | sticker | **No** — dimensions not extracted, PhotoView called without props | `extractMediaWidth` returns 0 for stickers |
| VideoNote | bubble | Yes (fixed) — hardcoded `size-[200px]` | None |
| Album (photo) | album | Yes — `computeAlbumLayout` pixel-exact rects | None |
| Album (video) | album | Yes — cover mode fills positioned cells | None |

### Constraints

- `PureVideoView` (VideoView.tsx:277-291) does not accept `width`/`height` props at all
- `extractMediaWidth`/`extractMediaHeight` (convert.ts:139-157) return 0 for stickers, videoNotes, and all non-photo/video/animation types
- `extractMinithumbnail` (convert.ts:159-163) returns null for animations despite TDLib providing `animation.minithumbnail`
- `useMessage` hook routes stickers to `StickerRenderState` which has no `displayWidth`/`displayHeight` fields
- `computeMediaSize` (media-sizing.ts:73-102) already handles the math — just needs to be called for stickers too
- The "square cap" in `computeMediaSize` (portrait images get `h = w`) means PhotoView uses blurred background + centered image — this already works and should be preserved for portrait videos too

## What's been done

### Scroll-to-bottom fix (in this branch) — DONE
- MessagePanel.tsx: ref-based scroll approach replaces broken store subscription
- Single `requestAnimationFrame` scroll — correct IF dimensions are reserved
- E2E scroll test cleaned up, uses polling (`waitForFunction`) for robustness

### Photo dimension reservation — already working
- `PurePhotoView` with `width`/`height` props uses `aspect-ratio` CSS (PhotoView.tsx:46-98)
- `computeMediaSize` produces correct dimensions (media-sizing.ts:73-102)
- Minithumbnail blur placeholder shown at correct aspect ratio

## Acceptance criteria

Every criterion is mechanically verifiable — an agent can run the check and get pass/fail.

| # | Criterion | Verification command | Pass condition |
|---|-----------|---------------------|----------------|
| A1 | Typecheck clean | `bun run typecheck` | exit 0 |
| A2 | Unit tests pass | `bun run test` | exit 0 |
| A3 | Lint clean | `bun run lint` | exit 0 |
| A4 | VideoView accepts width/height/minithumbnail props | `grep -c 'width.*number' apps/app/src/mainview/components/ui/chat/VideoView.tsx` | > 0 |
| A5 | VideoView uses `aspect-ratio` CSS when dimensions provided | `grep -c 'aspectRatio' apps/app/src/mainview/components/ui/chat/VideoView.tsx` | > 0 |
| A6 | Video dimensions passed in Message.tsx MediaLayout | `grep -A2 'PureVideoView' apps/app/src/mainview/components/chat/Message.tsx \| grep -c 'displayWidth\|displayHeight'` | > 0 |
| A7 | Sticker dimensions extracted from TDLib | `grep -A1 'messageSticker' apps/app/src/mainview/lib/types/convert.ts \| grep -c 'width\|height'` | > 0 |
| A8 | Sticker dimensions passed to PhotoView | `grep -B5 'StickerLayout' apps/app/src/mainview/components/chat/Message.tsx` shows width/height computation | present |
| A9 | Animation minithumbnail extracted | `grep -c 'messageAnimation' apps/app/src/mainview/lib/types/convert.ts` appears in extractMinithumbnail | > 0 |
| A10 | No layout shift after messages render | E2E: for first 5 dialogs, open chat → record `scrollHeight` → wait 2s → assert `scrollHeight` unchanged | delta = 0 for all scrollable chats |
| A11 | All existing E2E tests still pass | `cd apps/app && bunx playwright test --project app` | exit 0 |

## TODO

### Step 1: Add width/height props to PureVideoView

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Add optional `width` and `height` props to `PureVideoView` | `grep 'width.*number' apps/app/src/mainview/components/ui/chat/VideoView.tsx` returns match | TODO |
| 1.2 | When width/height provided, apply `aspect-ratio` CSS to the container (same pattern as PhotoView lines 46-51) | Read VideoView.tsx, confirm `aspect-ratio` style applied conditionally | TODO |
| 1.3 | When width/height provided, show minithumbnail blur placeholder (same as PhotoView lines 54-65). Add optional `minithumbnail` prop. | Read VideoView.tsx, confirm minithumbnail placeholder path | TODO |
| 1.4 | Fallback path (no width/height) unchanged — existing `aspect-video max-w-xs` behavior preserved | Read VideoView.tsx, confirm fallback path untouched | TODO |
| 1.5 | `isCircle` path unchanged — still uses `size-[200px]` | Read VideoView.tsx, confirm circle path untouched | TODO |
| 1.6 | `cover` path unchanged — still uses `h-full w-full` | Read VideoView.tsx, confirm cover path untouched | TODO |

### Step 2: Pass dimensions to PureVideoView in Message.tsx

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | In MediaLayout, pass `width={displayWidth}` `height={displayHeight}` `minithumbnail={minithumbnail}` to `PureVideoView` (lines 230-237) | Read Message.tsx, confirm props passed | TODO |
| 2.2 | Typecheck passes | `bun run typecheck` exits 0 | TODO |

### Step 3: Extract sticker dimensions in convert.ts

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | `extractMediaWidth`: add `messageSticker` case returning `content.sticker.width` | `grep 'messageSticker' apps/app/src/mainview/lib/types/convert.ts` matches in extractMediaWidth | TODO |
| 3.2 | `extractMediaHeight`: add `messageSticker` case returning `content.sticker.height` | Same grep, matches in extractMediaHeight | TODO |
| 3.3 | Typecheck passes | `bun run typecheck` exits 0 | TODO |

### Step 4: Pass sticker dimensions through rendering pipeline

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | In `useMessage`, add `displayWidth`/`displayHeight` to `StickerRenderState` using `computeMediaSize` with appropriate max size (224px, matching current `max-w-[224px]` constraint) | Read useMessage.ts, confirm computation exists | TODO |
| 4.2 | In Message.tsx `StickerLayout`, pass `width={displayWidth}` `height={displayHeight}` to `PurePhotoView` | Read Message.tsx, confirm props passed in sticker path | TODO |
| 4.3 | Remove hardcoded `max-w-[224px]` from sticker bubble if now redundant (dimensions handle it) | Read Message.tsx, confirm removal or explain why kept | TODO |
| 4.4 | Typecheck passes | `bun run typecheck` exits 0 | TODO |

### Step 5: Extract animation minithumbnail in convert.ts

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | `extractMinithumbnail`: add `messageAnimation` case returning `content.animation.minithumbnail?.data ?? null` | `grep 'messageAnimation' apps/app/src/mainview/lib/types/convert.ts` matches in extractMinithumbnail | TODO |
| 5.2 | Typecheck passes | `bun run typecheck` exits 0 | TODO |

### Step 6: Layout shift E2E test

Write a single content-agnostic E2E test: for each of the first 5 dialogs, open the chat, wait for messages to render, record `scrollHeight`, wait 2s for async media loads, record `scrollHeight` again, assert delta = 0. This works regardless of what content exists in the test account — text-only chats trivially pass, photo chats already pass (dimensions reserved), and after this fix video/sticker/GIF chats also pass.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | E2E: no layout shift after messages render | For each of first 5 dialogs: open → wait for `[data-testid="message-bubble"]` → record `scrollHeight` → wait 2s → assert `scrollHeight` unchanged | TODO |
| 6.2 | Test skips gracefully for chats with too few messages (not scrollable) | Non-scrollable chats skipped, test doesn't fail | TODO |

### Step 7: Final verification

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | Typecheck | `bun run typecheck` exits 0 | TODO |
| 7.2 | Unit tests pass | `bun run test` exits 0 | TODO |
| 7.3 | Lint | `bun run lint` exits 0 | TODO |
| 7.4 | All E2E tests pass | `cd apps/app && bunx playwright test --project app` exits 0 | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself. Use browser MCP tools or agent-browser for manual verification.
- Do not stop until all TODOs are done.
- Run the dev server with `bun run dev:hmr` (from repo root, not apps/app) before running e2e tests. Long-running — use `run_in_background`.
- Use `data-testid` attributes for Playwright selectors — never CSS classes or tag names.
- `bun run test` uses vitest. Always `bun run test`, never bare `bun test`.
- Read `CLAUDE.md` files in any directory before editing files there.
- Run `bun run scripts/symbols.ts .` before coding to understand exports.
- Follow the EXACT same pattern as `PurePhotoView` for the VideoView dimension support — don't invent a new approach.
- The `computeMediaSize` function already exists and handles all the scaling math. Don't duplicate it.
- Output COMPLETE when ALL steps are finished.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/components/ui/chat/VideoView.tsx` | Video renderer — needs width/height/minithumbnail props added (lines 277-291 for props, 296-340 for render paths) |
| `apps/app/src/mainview/components/ui/chat/PhotoView.tsx` | Photo renderer — **reference implementation** for dimension reservation (lines 46-98) |
| `apps/app/src/mainview/components/chat/Message.tsx` | Routes messages to layouts — needs to pass dimensions to VideoView (lines 230-237) and PhotoView in sticker path (line 147) |
| `apps/app/src/mainview/hooks/useMessage.ts` | Computes displayWidth/Height — needs sticker path added (lines 171-179) |
| `apps/app/src/mainview/lib/types/convert.ts` | Extracts dimensions from TDLib — needs sticker case (lines 139-157) and animation minithumbnail (lines 159-163) |
| `apps/app/src/mainview/lib/media-sizing.ts` | `computeMediaSize` math — read-only, do not modify |
| `apps/app/src/mainview/components/chat/MessagePanel.tsx` | Scroll logic — do not modify. The single rAF scroll works once dimensions are reserved. |
| `apps/app/src/mainview/lib/CLAUDE.md` | Store responsibilities and anti-responsibilities. |
| `apps/app/src/mainview/components/CLAUDE.md` | Component type definitions (Pure/Bubble/Message/Panel). |

### Lessons learned

1. **Photo dimension reservation is the reference pattern** — PhotoView.tsx lines 46-98 show exactly how to do it: `aspect-ratio` CSS on the container, minithumbnail blur placeholder, same container size for loading and loaded states. Copy this pattern for VideoView.
2. **`computeMediaSize` handles portrait media** — it applies a "square cap" where portrait media gets `height = width`. The blurred background fills the extra space. This works well and should be the same for videos.
3. **TDLib provides dimensions for ALL visual media** — photos, videos, animations, stickers, videoNotes. The extraction code just doesn't use all of them.
4. **VideoNote is already fine** — hardcoded 200x200 circle. No changes needed.
5. **Album cells are already fine** — `computeAlbumLayout` provides pixel-exact rects, and cover mode fills them.
6. **The scroll-to-bottom E2E test uses `waitForFunction` polling** — it polls until `distanceFromBottom < 50` with a 5s timeout. Once dimensions are reserved, the scroll should happen within a single rAF (~16ms), and the test will pass nearly instantly.
7. **Sticker max size should be 224px** — matching the current `max-w-[224px]` CSS constraint. Pass this as the `maxSize` param to `computeMediaSize` instead of the default 430px.
8. **Don't change the fallback paths** — when width/height are not provided (0 or undefined), keep the existing CSS-only sizing. This ensures backward compatibility if any code path sends media without dimensions.
