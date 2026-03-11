# tdesktop-Style Image Rendering

## Goal

Image messages in Kurier should render like Telegram Desktop: standalone photos float without a bubble background, captioned photos sit inside a bubble with the image edge-to-edge, albums use aspect-ratio-aware grid layouts instead of fixed-height rows, and all image sizing is driven by actual photo dimensions from TDLib rather than CSS-only constraints.

**Success criteria:**

- Single photo without caption: no `bg-message-*` background, image has rounded corners, subtle shadow, correct aspect-ratio sizing
- Single photo with caption: inside bubble, image width equals bubble content width (no `px-3` inset), caption padded below
- Portrait photo (1080x1920): displays with square cap — height does not exceed width
- Album of 2-4 photos: layout matches tdesktop's aspect-ratio-classified algorithm (w/n/q)
- Album outer corners rounded, internal tile edges square
- Minithumbnail blur placeholder shown before image loads, matching correct aspect ratio
- `bun run check` passes (typecheck + lint)

## Architecture

```
TDLib photo.sizes[largest].width/height + minithumbnail
  → convert.ts (extract to UIMessage fields)
  → useMessage.ts (compute display dimensions via media-sizing.ts, pick layout/variant)
  → Message.tsx MediaLayout
  → PureBubble variant="media"|"framed"|"filled"
  → PhotoView with explicit width/height + blur placeholder
```

```
Component hierarchy:

MessagePanel
  └── Message (integration layer — picks layout)
        ├── BubbleLayout      → PureBubble variant="filled" (text, voice, docs — unchanged)
        ├── MediaLayout (NEW)  → PureBubble variant="media"|"framed"
        │     ├── PhotoView (sized, with minithumbnail)
        │     └── Caption region (padded, only for "framed")
        ├── AlbumLayout        → PureBubble variant="media"|"framed"
        │     ├── AlbumGrid (rewritten with tdesktop algorithm)
        │     └── Caption region (padded, only for "framed")
        ├── StickerLayout      → PureBubble variant="media" (migrate off manual hack)
        └── PendingLayout      → PureBubble variant="filled" (unchanged)
```

**Constraints:**
- PureBubble is a Pure component — props only, no hooks, no store
- Message.tsx is the ONLY integration point that touches business logic
- PhotoView is Pure — it receives pre-computed dimensions, doesn't compute them
- The album layout algorithm is a pure function (no React, no DOM) in a utility file
- Effective max bubble width: 55% of 720px = ~396px. Use this as `maxMediaSize` instead of tdesktop's 430px

## What's Been Done

Nothing yet. This is a greenfield plan.

## TODO

### Step 1: Extract photo dimensions in data layer

Add photo width/height and minithumbnail to the UIMessage type and extraction pipeline, following the existing voice note pattern.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Add `mediaWidth: number`, `mediaHeight: number`, `minithumbnail: string \| null` fields to `UIMessage` in `ui.ts` | `grep -n 'mediaWidth' apps/app/src/mainview/lib/types/ui.ts` shows the fields | TODO |
| 1.2 | Add `extractMediaWidth(content)`, `extractMediaHeight(content)`, `extractMinithumbnail(content)` in `convert.ts` | Functions exist, handle `messagePhoto`, `messageVideo`, `messageAnimation`. For photos: pick largest size from `content.photo.sizes`. For videos: use `content.video.width/height`. Return 0 for non-media types | TODO |
| 1.3 | Wire extractors into `toUIMessage()` | `grep -n 'mediaWidth' apps/app/src/mainview/lib/types/convert.ts` shows assignment | TODO |
| 1.4 | Typecheck passes | `bun run check` exits 0 | TODO |

### Step 2: Create media sizing utility

Port tdesktop's sizing algorithms as pure TypeScript functions. No React, no DOM.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Create `apps/app/src/mainview/lib/media-sizing.ts` with `computeMediaSize(originalW, originalH, maxSize, minSize)` | Function returns `{ width, height }`. For 1920x1080 with max=396: returns ~396x223. For 1080x1920 with max=396: returns ~223x223 (square cap). Write inline assertions in a test or the file itself | TODO |
| 2.2 | Add `computeAlbumLayout(sizes: {w,h}[], maxWidth, minWidth, spacing)` — port tdesktop's full Layouter (1-4 items) and ComplexLayouter (5+) | Function returns `{ geometry: {x,y,w,h}, sides: Set<'top'\|'bottom'\|'left'\|'right'> }[]`. For 2 landscape photos: returns side-by-side layout. For 1 portrait + 2 landscape: returns left-tall + right-stacked | TODO |
| 2.3 | Add `cornersFromSides(sides)` — convert side flags to corner rounding flags | Returns which corners should be rounded (both adjacent sides present = rounded) | TODO |
| 2.4 | Typecheck passes | `bun run check` exits 0 | TODO |

### Step 3: Add PureBubble variants

Extend PureBubble with `variant` prop. No breaking changes to existing callers.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Add `variant?: 'filled' \| 'media' \| 'framed'` prop to `PureBubbleProps`, default `'filled'` | Existing callers (no variant prop) behave identically — zero visual regression | TODO |
| 3.2 | `variant="filled"` — current behavior: `bg-message-*`, `px-3 py-1.5` | Inspect element shows same classes as before | TODO |
| 3.3 | `variant="media"` — no `bg-message-*`, no padding, add `overflow-hidden` | Inspect element: no background class, no `px-3 py-1.5`, has `overflow-hidden` and `border-radius` from `bubbleRadius()` | TODO |
| 3.4 | `variant="framed"` — `bg-message-*`, NO padding (children manage their own), add `overflow-hidden` | Inspect element: has background class, no `px-3 py-1.5`, has `overflow-hidden` | TODO |
| 3.5 | All three variants keep: `bubbleRadius()`, max-width constraint, avatar handling | Border-radius, max-w, and avatar wrapper work the same across variants | TODO |
| 3.6 | Migrate StickerLayout to use `PureBubble variant="media"` instead of manual div + avatar duplication | StickerLayout no longer has its own avatar/max-width logic. Visual output identical | TODO |
| 3.7 | Typecheck passes | `bun run check` exits 0 | TODO |

### Step 4: Add MediaLayout in Message.tsx

New layout for photos/videos without captions (bubble-less) and with captions (framed bubble).

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Add `'media'` layout option in `useMessage.ts` — triggered when `contentKind` is `'photo'`, `'video'`, `'animation'`, or `'videoNote'` | `useMessage` returns `layout: 'media'` for photo messages instead of `layout: 'bubble'` | TODO |
| 4.2 | `MediaRenderState` includes: `msg`, `media`, `bubbleVariant` (`'media'` if no caption/reply/forward/sender, `'framed'` otherwise), `displayWidth`, `displayHeight`, `minithumbnail`, `showAvatar`, etc. | Type exists and is part of the `MessageRenderState` union | TODO |
| 4.3 | `MediaLayout` component in `Message.tsx` — composes `PureBubble variant={bubbleVariant}` with sized `PhotoView` | Photo renders at computed dimensions. No bubble background when standalone. Bubble background when captioned | TODO |
| 4.4 | Caption in `MediaLayout` with `variant="framed"`: image is edge-to-edge, caption below with `px-3 py-1.5` padding | Image width equals bubble width. Caption has padding. Gap between image and caption | TODO |
| 4.5 | `MessageTime` positioning: overlay on image when no caption (`displayType="image"`), inline when captioned (`displayType="default"`) | Time pill overlays bottom-right of image for standalone; normal position for captioned | TODO |
| 4.6 | `needsBubble` logic matches tdesktop: no bubble if no caption AND no reply AND no forward AND no sender name display | Photo with reply header gets `variant="framed"`. Plain photo gets `variant="media"` | TODO |
| 4.7 | Typecheck passes | `bun run check` exits 0 | TODO |

### Step 5: Rework PhotoView with metadata-driven sizing

Replace CSS-only sizing with explicit dimensions from photo metadata.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | Add props to `PurePhotoView`: `width?: number`, `height?: number`, `minithumbnail?: string \| null` | Props exist on the type | TODO |
| 5.2 | When `width`/`height` provided: render `<img>` with explicit `width` and `height` style (not just max constraints). Remove `max-h-80` for this path | Inspect element shows `width: Xpx; height: Ypx` on the img | TODO |
| 5.3 | Loading placeholder: when `minithumbnail` provided, render it as a blurred `<img>` (base64 data URI, `filter: blur(8px)`, scaled up to `width x height`) with correct aspect ratio instead of generic `aspect-video` | Before photo loads, blurred thumbnail visible at correct dimensions | TODO |
| 5.4 | Fallback: when no `width`/`height` provided (old codepath), keep current `max-h-80 max-w-full` behavior for backwards compat | Existing non-photo media still renders correctly | TODO |
| 5.5 | `cover` mode (for album cells): unchanged | Album cells still use object-cover | TODO |
| 5.6 | Typecheck passes | `bun run check` exits 0 | TODO |

### Step 6: Rewrite AlbumGrid with tdesktop layout algorithm

Replace fixed-height rows with aspect-ratio-aware layout from tdesktop.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | `AlbumGrid` receives `dimensions: {w: number, h: number}[]` alongside `messages` | Props type includes dimensions array | TODO |
| 6.2 | Calls `computeAlbumLayout(dimensions, maxWidth, minWidth=100, spacing=4)` to get per-cell geometry | Layout computed on render | TODO |
| 6.3 | Renders cells with absolute positioning inside a relative container, using geometry from the algorithm | Container has explicit `width` and `height` from layout result. Each cell has `position: absolute; left/top/width/height` | TODO |
| 6.4 | Per-cell corner rounding: use `cornersFromSides()` — outer corners get bubble rounding, internal corners are square | Inspect border-radius on album cells: outer corners 12px, internal corners 0px | TODO |
| 6.5 | 2 landscape photos: side-by-side layout | Visual check matches tdesktop | TODO |
| 6.6 | 1 portrait + 2 landscape: tall left + stacked right | Visual check matches tdesktop | TODO |
| 6.7 | 4 photos mixed: matches tdesktop's w/n/q classification | Visual check matches tdesktop | TODO |
| 6.8 | Album in `AlbumLayout` uses `PureBubble variant="media"` (no caption) or `variant="framed"` (with caption) | No bubble background on captionless albums. Bubble background on captioned albums | TODO |
| 6.9 | Typecheck passes | `bun run check` exits 0 | TODO |

### Step 7: Visual polish

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 7.1 | Standalone images (variant="media") get a subtle drop shadow | Inspect shows box-shadow on the media container | TODO |
| 7.2 | Grouped message corner rounding works for consecutive media messages — small radius (4px) on adjacent edges between consecutive photos from same sender | Send 3 photos consecutively, middle photo has 4px on grouped side, 12px on open side | TODO |
| 7.3 | Blurred background for photos that don't fill their box (tdesktop's 75% expansion rule) — STRETCH GOAL, can defer | Panoramic photo shows blurred version behind centered image | TODO |
| 7.4 | Dark theme and light theme both look correct | Visual check in both themes | TODO |

## Context for Future Agents

### Instructions for agents

- Do not ask questions — figure it out yourself. If you need user input or manual tasks (browser login, UI verification, etc.), use chrome extension MCP tools or agent-browser to do it yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- Before editing files in any directory, check for a `CLAUDE.md` in that directory and read it first.
- When working on components, load these skills first (mandatory per project rules): `components-build`, `frontend-design`, `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns`.
- Run `bun run check` after every step to catch type errors early.
- The dev server runs at `http://declarative-doodling-fog.localhost:1355` — use `bun run dev:hmr` (run in background, never pipe through head/tail).
- Use `bun install` before starting if in a worktree.
- Commit style: `[feat] Description` or `[fix] Description`.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/lib/types/ui.ts` | UIMessage type — add mediaWidth, mediaHeight, minithumbnail fields |
| `apps/app/src/mainview/lib/types/convert.ts` | TDLib → UIMessage conversion — add dimension extractors |
| `apps/app/src/mainview/hooks/useMessage.ts` | Layout decision — add 'media' layout, compute display dimensions |
| `apps/app/src/mainview/hooks/useMedia.ts` | Media URL resolution — unchanged but context |
| `apps/app/src/mainview/components/chat/Message.tsx` | Layout composition — add MediaLayout |
| `apps/app/src/mainview/components/ui/chat/Bubble.tsx` | PureBubble — add variant prop |
| `apps/app/src/mainview/components/ui/chat/PhotoView.tsx` | PurePhotoView — add width/height/minithumbnail props |
| `apps/app/src/mainview/components/chat/AlbumGrid.tsx` | AlbumGrid — rewrite with tdesktop algorithm |
| `apps/app/src/mainview/lib/media-sizing.ts` | NEW — pure sizing functions ported from tdesktop |
| `apps/app/src/mainview/components/CLAUDE.md` | Component architecture rules — read before editing |

### Reference implementations

| Source | What to take |
|--------|-------------|
| tdesktop `history_view_media_common.cpp` | `CountDesiredMediaSize`, `CountPhotoMediaSize` — single photo sizing with square cap |
| tdesktop `grouped_layout.cpp` | Full album layout algorithm — Layouter (1-4) + ComplexLayouter (5+) |
| tdesktop `history_view_message.cpp:3660` | `drawBubble()` — the needsBubble decision logic |
| tdesktop `history_view_photo.cpp:1074` | `Photo::needsBubble()` — conditions for bubble on photos |
| Kurier CLI `apps/cli/src/slim.ts:291` | Already extracts photo width/height from TDLib — pattern to follow |
| Kurier `convert.ts` voice extractors (lines 95-134) | Pattern for adding media metadata extractors |

### Lessons learned

1. tdesktop's `maxMediaSize` is 430px, but Kurier's effective max bubble width is ~396px (55% of 720px). Use Kurier's constraint, not tdesktop's literal value. Consider making it a CSS variable or computed from container width.
2. The square cap (height ≤ width for photos) is important UX — prevents tall portraits from dominating the chat. Videos do NOT have this cap in tdesktop.
3. tdesktop's album Layouter averages ratios starting from `accumulate(1.0)` — i.e., `(1.0 + sum_of_ratios) / count`. This is intentional, not a bug. It biases toward square-ish layouts.
4. ComplexLayouter (5+ items) uses a taller bounding box: `maxHeight = maxWidth * 4/3`. Important for fitting more items.
5. The StickerLayout currently duplicates avatar handling manually instead of using PureBubble. Step 3.6 cleans this up. Be careful to preserve the `group/bubble` class that reaction picker hover depends on.
6. `PureBubble` applies `group/bubble` Tailwind class for hover states — all variants must keep this class.
7. The minithumbnail from TDLib is a tiny (~40px) JPEG encoded as base64. Render it scaled up with `filter: blur()` and `image-rendering: auto` for the blur placeholder effect.
8. Album cells need per-cell `useMedia()` calls — each cell loads independently. This is already the pattern in the current AlbumGrid.
