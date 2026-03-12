# Remaining Media Layout Shift Fixes

## Goal

Eliminate the two remaining sources of layout shift in the chat message panel so that `scrollHeight` stabilizes within one frame of message render. After this fix, opening any chat with voice messages or photos results in zero cumulative layout shift from async media loading.

```
Success criteria (mechanically verifiable):
  bun run typecheck                                                    # exits 0
  bun run test                                                         # exits 0
  bun run lint                                                         # exits 0
  E2E: open chat → distanceFromBottom < 50px                           # already in app.test.ts line 337
  E2E: scrollHeight delta = 0 after 2s wait                            # already in app.test.ts line 562
  grep 'min-height\|minHeight' VoiceView.tsx                           # voice container reserves height
  grep 'width.*height.*PurePhotoView' Message.tsx | grep -c bubble     # photos in bubble layout get dimensions
```

## Architecture: Media Rendering Pipeline

```
TDLib message
  -> convert.ts: extractMediaWidth/Height, extractVoice*, extractMinithumbnail
    -> UIMessage { mediaWidth, mediaHeight, minithumbnail, voiceDuration, voiceWaveform, ... }
      -> useMessage.ts: decides layout (media | bubble | sticker | album)
        -> useMedia.ts: async fetch of media URL (triggers loading -> url transition)
          -> Message.tsx: routes to layout component
            -> PurePhotoView / PureVideoView / PureVoiceView (renders with or without URL)
```

### Key insight

The layout shift happens because components change their rendered DOM structure (and thus height) when the media URL arrives. The URL arrives asynchronously via `useMedia`, which transitions from `{ url: null, loading: true }` to `{ url: "blob:...", loading: false }`. Components that render different DOM trees for these two states cause layout shift.

## What's Been Done (commit d886820)

Commit `d886820` added dimension reservation for:

| Content Kind | Layout | Technique | Status |
|---|---|---|---|
| Photo | media | `aspect-ratio` CSS from `computeMediaSize` + minithumbnail blur | Done |
| Video | media | Same as photo (props added to `PureVideoView`) | Done |
| Animation/GIF | media | Same as photo | Done |
| Sticker | sticker | `computeMediaSize` with 224px max, dimensions passed to `PurePhotoView` | Done |
| VideoNote | bubble | Fixed `size-[200px]` circle | Already fine |
| Album | album | `computeAlbumLayout` pixel-exact rects | Already fine |

## Remaining Gaps

### Gap 1: Voice Messages Render Lazily (~800+ px CLS)

**Timeline evidence from E2E test:**
```
t=122ms: +child(AUDIO), +child(BUTTON), +child(DIV) -> +126px
t=142ms: +child(AUDIO), +child(BUTTON), +child(DIV) -> +144px
t=144ms: +child(AUDIO), +child(BUTTON), +child(DIV) -> +506px
t=146ms: +child(AUDIO), +child(BUTTON), +child(DIV) -> +108px
```

**Root cause: `PureVoiceView` renders three completely different DOM trees depending on state.**

[fact] The component at `VoiceView.tsx` has three render paths:

1. **Loading** (line 302-313): `loading=true` renders a tiny 40px-tall placeholder: `h-10 w-48 animate-pulse`. This is the initial state when `useMedia` returns `{ loading: true }`.

2. **No URL** (line 316-353): `!url` renders a slightly larger placeholder with a play button (42px) and muted waveform bars. This state occurs when media fetch fails.

3. **Has URL** (line 356-456): `url` is present, renders the full voice message: 42px play button + waveform + duration + optional transcription. This is the final state. The component is `w-[280px]` with `py-1`.

[fact] The transition from state 1 (loading, h-10 = 40px) to state 3 (full voice, ~54px with padding + button) causes a per-message height increase of ~14-30px. But the bigger issue is that the `AUDIO`, `BUTTON`, and `DIV` elements are added to the DOM when the URL arrives, which is a DOM mutation that Chrome's scroll anchoring can't always compensate for because multiple voice messages load simultaneously.

**What TDLib metadata is available before URL loads:**

[fact] From `convert.ts` lines 96-135 and `ui.ts` lines 109-113:
- `voiceWaveform: string | null` -- base64-encoded 5-bit packed waveform (100 samples)
- `voiceDuration: number` -- duration in seconds
- `voiceFileSize: number` -- file size in bytes
- `voiceSpeechStatus` -- transcription status
- `voiceSpeechText` -- transcription text

All of these are available **immediately** from the TDLib message content, before any async media fetch. The waveform, duration, and file size are extracted synchronously in `toUIMessage()`.

**What the fix should be:**

The voice message should render its full layout (play button, waveform bars, duration text) from the start, regardless of whether the audio URL has loaded. The waveform data comes from TDLib metadata, not the audio file. The play button just needs to be disabled until the URL arrives.

Concretely:
1. Remove the `loading` early return (line 302-313) -- the loading state should render the same DOM structure as the loaded state, just with the play button disabled.
2. Remove the `!url` early return (line 316-353) that renders a different structure.
3. Always render the full voice message DOM structure (play button + waveform + duration), using `voiceWaveform` prop for bars and `voiceDuration` prop for the time display. These are always available.
4. When `url` is null or loading, disable the play button and show a loading indicator inside it.
5. The `<audio>` element can be conditionally rendered (it doesn't affect layout height).

**Height analysis:**

[fact] The full voice message container (`data-testid="voice-message"`, line 357) is `w-[280px] py-1`. Inside: a flex row with 42px play button + right column (waveform + duration text). The waveform bars are 3-23px tall. The duration row adds ~16px. Total expected height: ~58-62px.

[fact] The loading placeholder (line 302-313) is `h-10` = 40px. The shift per voice message is ~18-22px. With 4+ voice messages loading simultaneously, this compounds to 72-88px minimum, but the timeline shows 800+ px because the mutations cascade.

### Gap 2: Photos in Bubble Layout Without Dimensions (396px shift)

**Timeline evidence from E2E test:**
```
t=150ms: scrollTop=3467, scrollHeight=4067, gap=0     <- still pinned
t=171ms: scrollTop=3482, scrollHeight=4463, gap=381    <- image loaded, no mutation, 396px shift
```

**Root cause: Photos in the `bubble` layout path don't receive dimension props.**

[fact] In `Message.tsx`, there are two paths that render `PurePhotoView`:

1. **MediaLayout** (line 252-258): Photos routed here get `width={displayWidth}` and `height={displayHeight}` from `MediaRenderState`. This works correctly -- dimensions are reserved.

2. **BubbleLayout** (line 378-379): Photos routed here get **no dimension props**:
   ```tsx
   {isPhoto && media && (
     <PurePhotoView url={media.url} loading={media.loading} onRetry={media.retry} />
   )}
   ```
   No `width`, `height`, or `minithumbnail` props are passed.

[fact] When `PurePhotoView` receives no `width`/`height` (the `hasDimensions` check at line 22 is false), it falls through to the fallback path (lines 102-124):
- Loading: `aspect-video w-full max-w-xs animate-pulse` (line 106) -- 16:9 aspect ratio
- Loaded: `max-h-80 max-w-full` (line 124) -- intrinsic image size, unconstrained

The shift happens because the loading placeholder uses a 16:9 aspect ratio, but the actual image has a different aspect ratio. Or worse, if the image was already cached in the browser, it goes directly to the loaded state with no placeholder at all -- the image's intrinsic dimensions cause a pure reflow with no DOM mutation (which is exactly what the timeline shows: "no mutation, 396px shift").

**When does a photo land in BubbleLayout instead of MediaLayout?**

[fact] The `useMessage` hook (lines 204-205) routes photos to `MediaLayout` only when `contentKind === 'photo'` AND the message is a single with no other conditions. But looking more carefully at lines 204-243, photos ARE routed to MediaLayout. The only photo path to BubbleLayout would be if the photo somehow doesn't match the `ck === 'photo'` check at line 205.

[inference] Wait -- re-reading the flow. The `useMessage` hook at line 205 checks `if (ck === 'photo' || ck === 'video' || ck === 'animation')` and routes to MediaLayout. But at line 246 in the regular bubble section, `const isPhoto = msg.contentKind === 'photo'` is checked again for the bubble fallback. This code is unreachable for photos because they're already caught by the MediaLayout check above... unless the photo is inside a message that also has other content characteristics that prevent the MediaLayout routing.

[fact] Actually, re-reading more carefully: lines 204-205 only catch `'photo' || 'video' || 'animation'`. But `videoNote` is NOT in this list. VideoNotes go to the bubble path (line 249: `msg.contentKind === 'videoNote'`). And for photos, they always go to MediaLayout. So the BubbleLayout photo path (line 378-379) should theoretically be dead code for photos.

[inference] However, the 396px shift is real. Looking at the timeline evidence again: "no mutation, 396px shift" -- this means an image loaded from cache and expanded without any DOM mutation. This could be happening in a **link preview** thumbnail, not a direct photo message. Or it could be happening in a `PurePhotoView` inside an **album** via `AlbumGrid`.

Let me re-examine. The `MediaLayout` does pass dimensions to `PurePhotoView` (line 252-258). But the `BubbleLayout` photo rendering at line 378-379 passes NO dimensions. Even though photos should be routed to MediaLayout, there's a subtle case: if `msg.contentKind === 'photo'` but the message content was converted as a different kind somehow, or if the photo is embedded in a text message with a link preview that has an image.

[fact] Looking at `PureLinkPreviewCard` -- it renders thumbnails. These thumbnails likely load asynchronously and could cause layout shift. But link preview images are a separate component and not `PurePhotoView`.

[assumption] The most likely scenario for the 396px shift is one of:
1. A photo in the bubble layout fallback path (though this should be unreachable for `contentKind === 'photo'`)
2. A link preview thumbnail loading
3. An image in an album cell that somehow bypasses dimension reservation

Given that the fix for BubbleLayout photos is trivial and defensive (pass dimensions even if the path seems unreachable), it should be done regardless.

**What the fix should be:**

For the BubbleLayout photo/video path (lines 378-389), pass `width`/`height`/`minithumbnail` from the UIMessage:

```tsx
{isPhoto && media && (
  <PurePhotoView
    url={media.url}
    loading={media.loading}
    onRetry={media.retry}
    width={msg.mediaWidth > 0 ? computeMediaSize(msg.mediaWidth, msg.mediaHeight).width : undefined}
    height={msg.mediaWidth > 0 ? computeMediaSize(msg.mediaWidth, msg.mediaHeight).height : undefined}
    minithumbnail={msg.minithumbnail}
  />
)}
```

Same for the video path. The `BubbleRenderState` should be extended with `displayWidth`/`displayHeight`/`minithumbnail` fields, computed in `useMessage` the same way as `MediaRenderState`.

## Fix Approach

### Fix 1: Voice Message Height Reservation

**Principle:** Render the full DOM structure on first render. Only the `<audio>` element and play interactivity depend on the URL.

**Changes to `VoiceView.tsx`:**

1. Replace the three render paths (loading / no-url / has-url) with a single render that always shows the full voice message layout.
2. The play button shows a loading spinner or microphone icon when `url` is null/loading, and the play/pause icon when URL is ready.
3. Waveform bars render immediately using the `waveform` prop (TDLib metadata, always available). If no waveform data, use the `generateBars('placeholder')` fallback (already exists in the code).
4. Duration text displays from `tdDuration` prop (TDLib metadata, always available).
5. The `<audio>` element is only mounted when `url` is available (no layout impact -- it's a non-visual element).
6. Add `data-testid="voice-container"` with a `min-height` that matches the final rendered height, as a safety net.

**Why this works:** [fact] All visual elements of the voice message (button dimensions, waveform shape, duration text) are determined by TDLib metadata that arrives synchronously with the message. The audio URL only enables playback interactivity.

### Fix 2: Bubble Layout Photo/Video Dimensions

**Principle:** Pass dimension props to all PurePhotoView/PureVideoView calls, not just in MediaLayout.

**Changes to `useMessage.ts`:**

1. Add `displayWidth`, `displayHeight`, and `minithumbnail` to `BubbleRenderState`.
2. Compute them in the bubble layout section of `useMessage()` using `computeMediaSize`, same as MediaLayout.

**Changes to `Message.tsx`:**

1. In `BubbleLayout`, pass `width={state.displayWidth}`, `height={state.displayHeight}`, `minithumbnail={state.minithumbnail}` to `PurePhotoView` and `PureVideoView`.

## TODO Steps

### Step 1: Voice Message -- Always Render Full Layout

| # | What | Verification | Status |
|---|------|-------------|--------|
| 1.1 | Refactor `PureVoiceView` to render a single DOM structure regardless of `url`/`loading` state. Remove the `if (loading)` early return (line 302-313). Remove the `if (!url)` early return (line 316-353). | `grep -c 'if (loading)' VoiceView.tsx` returns 0 in the main render body | TODO |
| 1.2 | When `url` is null or loading, render the play button with a Mic icon or loading spinner instead of Play/Pause. Keep the same 42px button dimensions. | Visual inspection: button is same size in loading and loaded states | TODO |
| 1.3 | Always render waveform bars from `waveform` prop or `generateBars` fallback, regardless of URL state. | `grep 'bars.map' VoiceView.tsx` appears in a single unconditional render path | TODO |
| 1.4 | Always render duration from `tdDuration` prop, regardless of URL state. | `grep 'metaText\|displayTime' VoiceView.tsx` appears outside any url-conditional block | TODO |
| 1.5 | Conditionally render `<audio>` only when `url` is present (no layout impact). | `grep 'audio.*url' VoiceView.tsx` shows conditional rendering | TODO |
| 1.6 | Add `min-height` or fixed height to the voice container as a safety net (e.g., `min-h-[54px]`). | `grep 'min-h\|minHeight' VoiceView.tsx` returns match | TODO |
| 1.7 | `bun run typecheck` exits 0 | Run command | TODO |
| 1.8 | `bun run lint` exits 0 | Run command | TODO |

### Step 2: Bubble Layout Photo/Video Dimensions

| # | What | Verification | Status |
|---|------|-------------|--------|
| 2.1 | Add `displayWidth?: number`, `displayHeight?: number`, `minithumbnail?: string \| null` to `BubbleRenderState` in `useMessage.ts` | `grep 'displayWidth' useMessage.ts` matches in BubbleRenderState type | TODO |
| 2.2 | In the bubble section of `useMessage()`, compute dimensions using `computeMediaSize` when `msg.mediaWidth > 0 && msg.mediaHeight > 0` | `grep 'computeMediaSize' useMessage.ts` appears in bubble section | TODO |
| 2.3 | In `BubbleLayout` in `Message.tsx`, pass `width`, `height`, `minithumbnail` to `PurePhotoView` (line 378-379) | `grep -A3 'isPhoto && media' Message.tsx` shows width/height props | TODO |
| 2.4 | In `BubbleLayout` in `Message.tsx`, pass `width`, `height`, `minithumbnail` to `PureVideoView` (line 381-388) | `grep -A5 'isVideo && media' Message.tsx` shows width/height props | TODO |
| 2.5 | `bun run typecheck` exits 0 | Run command | TODO |
| 2.6 | `bun run lint` exits 0 | Run command | TODO |

### Step 3: Verification

| # | What | Verification | Status |
|---|------|-------------|--------|
| 3.1 | `bun run typecheck` exits 0 | Run command | TODO |
| 3.2 | `bun run test` exits 0 | Run command | TODO |
| 3.3 | `bun run lint` exits 0 | Run command | TODO |
| 3.4 | E2E: `distanceFromBottom < 50px` for scrollable chats | `cd apps/app && bunx playwright test --project app -g "scrolls to latest"` passes | TODO |
| 3.5 | E2E: `scrollHeight delta = 0` for all 5 chats | `cd apps/app && bunx playwright test --project app -g "no layout shift"` passes | TODO |
| 3.6 | Voice messages still play correctly when URL loads | Manual test or existing voice message E2E tests pass | TODO |

## Key Files

| File | Role |
|------|------|
| `apps/app/src/mainview/components/ui/chat/VoiceView.tsx` | Voice message renderer -- needs refactoring to always render full layout |
| `apps/app/src/mainview/components/ui/chat/PhotoView.tsx` | Photo renderer -- reference implementation for dimension reservation (no changes needed) |
| `apps/app/src/mainview/components/ui/chat/VideoView.tsx` | Video renderer -- already has dimension reservation from d886820 (no changes needed) |
| `apps/app/src/mainview/components/chat/Message.tsx` | Routes to layouts -- BubbleLayout needs dimension props for photo/video |
| `apps/app/src/mainview/hooks/useMessage.ts` | Computes render state -- BubbleRenderState needs displayWidth/Height/minithumbnail |
| `apps/app/src/mainview/hooks/useMedia.ts` | Async media URL fetching -- read-only, do not modify |
| `apps/app/src/mainview/lib/types/convert.ts` | TDLib extraction -- read-only, already extracts all needed voice/photo metadata |
| `apps/app/src/mainview/lib/media-sizing.ts` | Dimension math -- read-only, `computeMediaSize` already handles everything |
| `apps/app/src/mainview/components/chat/MessagePanel.tsx` | Scroll logic -- read-only, works correctly once dimensions are reserved |
| `apps/app/tests/e2e/app.test.ts` | E2E tests -- existing tests cover scroll-to-bottom and layout shift |

## Lessons Learned

1. **Voice message metadata is synchronous** -- waveform bytes, duration, and file size come from TDLib message content, not the audio file. There is zero reason to delay rendering the voice UI until the audio URL loads.

2. **The "three render paths" pattern causes layout shift** -- Components that render entirely different DOM trees for loading/error/loaded states are inherently shift-prone. The fix is to render the final layout structure from the start and only toggle interactivity.

3. **"No mutation" shifts are the hardest to debug** -- The 396px photo shift had no DOM mutation because the browser laid out the image using intrinsic dimensions after loading from cache. These shifts bypass Chrome's scroll anchoring because there's no MutationObserver event to trigger compensation.

4. **Defensive dimension passing is free** -- Even if the BubbleLayout photo path seems unreachable for `contentKind === 'photo'`, passing dimensions costs nothing and prevents regression if routing logic changes.

5. **The d886820 pattern is the template** -- For any visual media, the fix is always the same: extract dimensions from TDLib metadata, compute display size via `computeMediaSize`, set `aspect-ratio` CSS on the container. Voice messages are the exception because they're not visual media -- they need a fixed-height container instead of aspect-ratio.

## Context for Implementing Agents

- Run `bun run dev:hmr` (from repo root) with `run_in_background` before E2E tests.
- Read `CLAUDE.md` files in any directory before editing files there (especially `apps/app/src/mainview/components/CLAUDE.md` and `apps/app/src/mainview/lib/CLAUDE.md`).
- Run `bun run scripts/symbols.ts .` before coding.
- Use `data-testid` attributes for Playwright selectors.
- `bun run test` uses vitest. Always `bun run test`, never bare `bun test`.
- Voice message refactoring must preserve all existing functionality: play/pause, seek via waveform drag, transcription button, speech recognition status.
- The `useBarCount` hook uses a ResizeObserver callback ref -- this must continue to work with the unified render path.
