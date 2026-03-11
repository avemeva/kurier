# Image Rendering Fixes

## Goal

Fix visual issues with the tdesktop-style image rendering implementation. Images appear too small, albums have gaps, and overall sizing doesn't match tdesktop quality.

**Success criteria:**
- Single landscape photo fills full bubble width (~396px or available width)
- Portrait photos are tall (no square cap — matching tdesktop's `CountDesiredMediaSize`, not `CountPhotoMediaSize`)
- Album cells have no visible gaps beyond the 4px spacing
- Album grid fills the full bubble width
- Photos render with actual image content, not truncated
- `vitest run` passes, `bun run typecheck` passes

## Observed Issues (from Маруся chat)

### Issue A: Images appear small / don't fill bubble width
The `computeMediaSize` uses `MAX_MEDIA_SIZE = 396` (55% of 720px) as a hardcoded constant. But the actual available bubble width depends on the container. When the chat panel is wider than 720px, or when the bubble max-width resolves to a larger value, images are undersized.

**Root cause:** `MAX_MEDIA_SIZE` is hardcoded at 396px. The actual bubble width is dynamic (`max-w-[55%]` of the chat panel, which itself is `max-w-[720px]`). The sizing should adapt to the actual available width.

**Fix:** Either:
- (a) Compute available width dynamically (measure the container)
- (b) Match tdesktop's constant: use 430px and let the bubble constrain it
- Recommendation: Use 430px like tdesktop. The bubble's `max-w-[55%]` and `overflow-hidden` will naturally constrain the image. The image renders at "desired" size, and the container clips/constrains. This is simpler and matches tdesktop.

### Issue B: Album grid width doesn't match bubble width
`AlbumGrid` receives `maxWidth={MAX_MEDIA_SIZE}` (396px) but the bubble can be wider. The grid is 396px inside a potentially larger bubble, leaving empty space.

**Fix:** Same as Issue A — use 430px. Or better: make the album responsive by having it compute layout at the actual available width. For simplicity, match tdesktop's 430px.

### Issue C: Album cells have visible gaps / misalignment
The `computeAlbumLayout` algorithm may produce cells that don't perfectly tile due to rounding. The last cell in each row should use `maxWidth - x` to fill remaining space (this is implemented but may have edge cases).

**Fix:** Add a test that verifies row widths sum correctly for various album sizes (2-10 items). The existing `no gaps` test only checks 3 items. Run against the actual Маруся album dimensions.

### Issue D: Existing Photos section shows forward headers / metadata
The existing "Photos" section in the dev page now uses MediaLayout (framed variant) which shows forward headers and sender names. Previously these were in BubbleLayout which handled them differently. The padded metadata regions (`px-3`) are correct for framed variant.

## TODO

### Step 1: Fix MAX_MEDIA_SIZE constant and remove from components

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Change `MAX_MEDIA_SIZE` from 396 to 430 in `media-sizing.ts` | `grep MAX_MEDIA_SIZE media-sizing.ts` shows 430 | TODO |
| 1.2 | Update `media-sizing.test.ts` — all hardcoded `396` values in test expectations to reflect 430 | `vitest run` passes | TODO |
| 1.3 | Verify `computeMediaSize(1920, 1080, 430, 100)` returns `{width: 430, height: 242}` | Test assertion | TODO |
| 1.4 | Update `convert.test.ts` if any assertions reference 396 | `vitest run` passes | TODO |

### Step 2: Add comprehensive album gap tests

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Add tests for 2, 3, 4, 5, 6, 7, 8, 9, 10 item albums verifying: cells + spacing = maxWidth per row, no overlapping cells, total height > 0 | `vitest run` passes with new tests | TODO |
| 2.2 | Add tests with real Маруся album dimensions (extract from chat: the 2-photo miso album, the 7-photo plum blossom album, etc.) | Tests pass and produce same layouts as tdesktop | TODO |
| 2.3 | Verify the "last cell fills remaining width" logic works for all row lengths | New test assertions | TODO |

### Step 3: Fix album grid sizing in AlbumLayout

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | `AlbumGrid` should use 430 as maxWidth (from the updated constant) | Grid cells sum to 430px per row | TODO |
| 3.2 | The `PureBubble` with `overflow-hidden` clips to the actual bubble width | Visual: image doesn't overflow bubble | TODO |
| 3.3 | For `variant="framed"` albums with caption: the grid and caption should both be constrained by the same bubble | Visual check on dev page | TODO |

### Step 4: Fix edge cases found in Маруся chat

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Video notes still use BubbleLayout (not MediaLayout) — verify they render correctly as circular | Visual check: video notes are round, not broken | TODO |
| 4.2 | Video stickers (.webm loaded as img) — these are a pre-existing bug, not caused by this change. Document but don't fix here | N/A | TODO |
| 4.3 | Reply quotes showing raw message IDs — pre-existing, not caused by this change | N/A | TODO |

### Step 5: Run all tests and verify

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | `vitest run` passes | Exit code 0, 0 failures | TODO |
| 5.2 | `bun run typecheck` passes | Exit code 0 | TODO |
| 5.3 | `bun run lint` passes | Exit code 0 or only pre-existing warnings | TODO |
| 5.4 | Dev page Media Variants section renders correctly | Visual check with agent-browser | TODO |
| 5.5 | Маруся chat photos and albums render correctly | Visual check with agent-browser | TODO |

## Context for Future Agents

### Instructions for agents
- Do not ask questions — figure it out yourself.
- Before editing files in any directory, check for a `CLAUDE.md` in that directory and read it first.
- When working on components, load these skills: `components-build`, `frontend-design`.
- Run `vitest run` after every change to catch regressions.
- The dev server runs at `http://declarative-doodling-fog.localhost:1355`.
- Run `bun run dev:hmr` in background to test visually.
- Use agent-browser to verify visual output.

### Key files
| File | Why |
|------|-----|
| `apps/app/src/mainview/lib/media-sizing.ts` | MAX_MEDIA_SIZE constant + sizing algorithms |
| `apps/app/src/mainview/lib/media-sizing.test.ts` | Existing tests — update expectations for 430px |
| `apps/app/src/mainview/components/chat/AlbumGrid.tsx` | Album grid rendering |
| `apps/app/src/mainview/components/chat/Message.tsx` | MediaLayout + AlbumLayout |
| `apps/app/src/mainview/hooks/useMessage.ts` | Layout decision + dimension computation |
| `apps/app/src/mainview/components/ui/chat/PhotoView.tsx` | Photo rendering with explicit dimensions |
| `apps/app/src/mainview/pages/DevPage.tsx` | Dev page for visual testing |
| `apps/app/src/mainview/pages/dev-data.ts` | Fixture data with media dimensions |

### Lessons learned
1. The square cap was intentionally REMOVED by the test author — portrait photos should stay tall (matching `CountDesiredMediaSize`, not `CountPhotoMediaSize`). The CSS-level `overflow-hidden` on the bubble handles the constraint.
2. `MAX_MEDIA_SIZE = 396` was wrong — tdesktop uses 430px. The bubble's `max-w-[55%]` constrains naturally.
3. Race condition in dev page: `seedMedia` must run synchronously before render (via `useRef` guard), not in `useEffect` (which runs after first render).
4. All 249 existing tests pass. The `media-sizing.test.ts` has 20 tests covering single photos and albums.
5. The `computeAlbumLayout` averageRatio starts accumulate at 1.0 (tdesktop behavior). The test suite already validates this.
