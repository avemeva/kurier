# Message Component Test Harness

## Goal

A dev harness that renders `PureMessageRow` with real captured message data, without a running daemon. Playwright runs visual regression tests against it. Agent-browser inspects individual fixtures to diagnose and verify component fixes.

**Success criteria:**
```bash
# Harness index page lists all fixtures
agent-browser open http://worktree.localhost:1355/dev && agent-browser snapshot -i
# Output contains fixture links

# Single fixture renders one message, inspectable by agent-browser
agent-browser open http://worktree.localhost:1355/dev/fixture/text-incoming
agent-browser snapshot -s "[data-testid='fixture-message']"
# Output contains message accessibility tree (text, time, checkmarks, etc.)

# Playwright visual regression passes (all 48 fixtures)
cd apps/app && bunx playwright test --project dev
# All fixture screenshots match baselines

# Agent-browser can diff before/after a code change
agent-browser screenshot /tmp/before.png
# ... HMR applies code change ...
agent-browser diff screenshot --baseline /tmp/before.png
# Shows pixel diff
```

## Architecture

```
Vite multi-page app
  │
  ├── src/mainview/index.html → main.tsx → App (Telegram client, needs daemon)
  │
  └── src/mainview/dev.html → dev-main.tsx → DevHarness (standalone, no daemon)
        │
        ├── /dev                         ← Index: grid of all fixtures with thumbnails
        │     FixtureIndex component
        │
        └── /dev/fixture/:name           ← Single fixture page
              FixturePage component
              │
              ├── fetches /dev/fixtures/<name>/fixture.json
              ├── fixture.json = { message: TGMessage, showSender, groupPosition }
              ├── media co-located: /dev/fixtures/<name>/media/*
              └── renders PureMessageRow with same CSS/providers

Vite dev server
  │
  ├── Middleware rewrites /dev* → dev.html (SPA fallback for dev entry)
  ├── Serves /dev/fixtures/* as static files from public/
  └── POST /api/dev/fixture — capture endpoint (writes fixture folder, Step 5)

public/dev/fixtures/
  ├── manifest.json              ← Array of { name, description, contentKind }
  ├── text-incoming/
  │     └── fixture.json
  ├── voice-with-waveform/
  │     ├── fixture.json
  │     └── media/voice.ogg
  └── ...48 fixture folders total

Playwright
  │
  └── tests/dev/harness.test.ts  ← `dev` project in playwright.config.ts
        reads manifest.json
        navigates /dev/fixture/:name per fixture
        toHaveScreenshot() per fixture

Capture plugin (Step 5)
  │
  └── Cmd+Shift+C in running app (with daemon)
        → serialize clicked message as TGMessage
        → fetch media blobs
        → POST to /api/dev/fixture
        → fixture folder appears, manifest updated
```

**Why separate entry point (not hash routing):**
- `dev.html` has its own `<script>` tag pointing at `dev-main.tsx` — zero app code loaded
- No `initialize()`, no SSE, no daemon connection attempt — not even imported
- HMR works independently — changing a component updates both app and harness
- Vite multi-page is a first-class feature (`build.rollupOptions.input`)
- Clean URL paths (`/dev/fixture/name`) instead of hash fragments

**Constraints:**
- Vite root is `src/mainview/`. Both `index.html` and `dev.html` live there.
- Need Vite middleware to rewrite `/dev/*` → `dev.html` for client-side routing within the harness SPA.
- `PureMessageRow` imports from `@/data` (types only) and `@/lib/media-sizing` — no store/daemon dependency.
- `TooltipProvider` wraps the real app — harness needs it too for tooltip-dependent components.
- Fixtures store `TGMessage` (post-conversion), not `Td.message`. Harness never imports converters.

## What's Been Done

- `PureMessageRow` is already pure (props only, no store) — no changes needed.
- Dev media exists at `public/dev/media/` (mp4, ogg, jpg, webp) and `public/dev/photos/` (avatar jpgs).
- TDLib fixtures exist at `data/types/__tests__/fixtures.ts` — can be converted to seed TGMessage fixtures.
- Playwright config has `app` and `perf` projects — add `dev`.

## Fixture Catalog (48 fixtures)

Every fixture is a folder under `public/dev/fixtures/<name>/` containing `fixture.json` and optionally `media/` files.

### Text messages

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 1 | `text-incoming` | text | Simple incoming, single checkmark |
| 2 | `text-outgoing` | text | Outgoing, read double checkmark |
| 3 | `text-outgoing-unread` | text | Outgoing, sent but unread (single check) |
| 4 | `text-outgoing-edited` | text | Outgoing, edited label |
| 5 | `text-long` | text | Multi-paragraph long text, line breaks |
| 6 | `text-with-bold-italic` | text | Entities: bold, italic, underline, strikethrough |
| 7 | `text-with-code` | text | Entities: inline `code` and ```pre``` block |
| 8 | `text-with-url` | text | Entities: clickable URL and textUrl |
| 9 | `text-with-mention` | text | Entities: @mention and hashtag |
| 10 | `text-with-spoiler` | text | Entities: spoiler text |
| 11 | `text-with-link-preview` | text | Web preview card (site, title, description, thumb) |
| 12 | `text-with-link-preview-large` | text | Web preview with `showLargeMedia: true` |
| 13 | `text-with-reactions` | text | Multiple reactions (thumbs up, heart, fire) |
| 14 | `text-with-reactions-chosen` | text | Reactions where user has reacted (`chosen: true`) |
| 15 | `text-with-reply` | text | Reply header (sender name, quoted text) |
| 16 | `text-with-reply-media` | text | Reply to a photo (thumbnail in reply header) |
| 17 | `text-with-forward` | text | Forward header (forwarded from name) |
| 18 | `text-with-inline-keyboard` | text | Bot inline keyboard buttons |
| 19 | `text-with-sender-name` | text | Incoming in group, showSender=true, sender avatar |
| 20 | `text-channel-post` | text | Channel post, view count shown |

### Text grouping (same sender, consecutive)

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 21 | `text-group-first` | text | groupPosition='first', top corners rounded |
| 22 | `text-group-middle` | text | groupPosition='middle', small radius both sides |
| 23 | `text-group-last` | text | groupPosition='last', bottom corners rounded |

### Photo messages

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 24 | `photo-single` | photo | Just photo, no caption, timestamp overlay |
| 25 | `photo-with-caption` | photo | Photo + caption text below |
| 26 | `photo-with-caption-entities` | photo | Photo + caption with bold/links |
| 27 | `photo-outgoing` | photo | Outgoing photo, read checkmarks |
| 28 | `photo-with-reply` | photo | Photo replying to another message (framed variant) |
| 29 | `photo-with-forward` | photo | Forwarded photo (framed variant, forward header) |
| 30 | `photo-with-reactions` | photo | Photo + reactions bar |

### Video messages

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 31 | `video-single` | video | Video, no caption, play button |
| 32 | `video-with-caption` | video | Video + caption below |
| 33 | `video-outgoing` | video | Outgoing video |

### Animation (GIF)

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 34 | `animation-gif` | animation | GIF, no caption |
| 35 | `animation-with-caption` | animation | GIF + caption |

### Voice messages

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 36 | `voice-incoming` | voice | Incoming, waveform bars, duration |
| 37 | `voice-outgoing` | voice | Outgoing voice |
| 38 | `voice-with-speech` | voice | Transcribed (speechStatus='done', speechText set) |

### Video note (round video)

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 39 | `video-note-incoming` | videoNote | Round video, incoming |

### Stickers

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 40 | `sticker-webp` | sticker | Static webp sticker |
| 41 | `sticker-tgs` | sticker | Animated Lottie sticker |
| 42 | `sticker-webm` | sticker | Video sticker |
| 43 | `sticker-with-reactions` | sticker | Sticker + reactions bar |

### Albums

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 44 | `album-photos` | album | 3 photos, no caption |
| 45 | `album-with-caption` | album | 2 photos + caption text |
| 46 | `album-mixed` | album | Photo + video in same album |

### Other content types

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 47 | `document-file` | document | Document/file label |

### Special message kinds

| # | Fixture name | Content | Key variations |
|---|---|---|---|
| 48 | `service-pin` | service | "User pinned a message" |
| 49 | `pending-sending` | pending | Sending state, opacity |
| 50 | `pending-failed` | pending | Failed state, dimmed |

## Acceptance Criteria

### Per-fixture rendering (50 fixtures)

Each fixture must render without console errors and be inspectable by agent-browser.

| # | Fixture | Verify |
|---|---------|--------|
| F1 | `text-incoming` | `agent-browser open URL/dev/fixture/text-incoming && agent-browser wait "[data-testid='fixture-message']" && agent-browser snapshot -s "[data-testid='fixture-message']"` shows text content and timestamp |
| F2 | `text-outgoing` | Same pattern — snapshot shows text, double checkmark indicator |
| F3 | `text-outgoing-unread` | Snapshot shows text, single checkmark |
| F4 | `text-outgoing-edited` | Snapshot shows "edited" indicator |
| F5 | `text-long` | Snapshot shows multi-line text |
| F6 | `text-with-bold-italic` | Snapshot shows formatted text (strong/em elements) |
| F7 | `text-with-code` | Snapshot shows code element |
| F8 | `text-with-url` | Snapshot shows link element |
| F9 | `text-with-mention` | Snapshot shows mention text |
| F10 | `text-with-spoiler` | Snapshot shows spoiler element |
| F11 | `text-with-link-preview` | Snapshot shows link preview card with site name/title |
| F12 | `text-with-link-preview-large` | Snapshot shows large media preview |
| F13 | `text-with-reactions` | Snapshot shows reaction buttons |
| F14 | `text-with-reactions-chosen` | Snapshot shows reaction buttons (one highlighted/chosen) |
| F15 | `text-with-reply` | Snapshot shows reply header with sender name |
| F16 | `text-with-reply-media` | Snapshot shows reply header with thumbnail |
| F17 | `text-with-forward` | Snapshot shows forward header |
| F18 | `text-with-inline-keyboard` | Snapshot shows keyboard buttons |
| F19 | `text-with-sender-name` | Snapshot shows sender name above bubble |
| F20 | `text-channel-post` | Snapshot shows view count |
| F21 | `text-group-first` | `agent-browser get styles "[data-testid='message-bubble']"` shows asymmetric border-radius |
| F22 | `text-group-middle` | Same — smaller border-radius on grouped side |
| F23 | `text-group-last` | Same — bottom corners fully rounded |
| F24 | `photo-single` | Snapshot shows img element, timestamp overlay |
| F25 | `photo-with-caption` | Snapshot shows img + caption text |
| F26 | `photo-with-caption-entities` | Snapshot shows img + formatted caption |
| F27 | `photo-outgoing` | Snapshot shows img + read checkmarks |
| F28 | `photo-with-reply` | Snapshot shows reply header + img |
| F29 | `photo-with-forward` | Snapshot shows forward header + img |
| F30 | `photo-with-reactions` | Snapshot shows img + reaction buttons |
| F31 | `video-single` | Snapshot shows video element |
| F32 | `video-with-caption` | Snapshot shows video + caption |
| F33 | `video-outgoing` | Snapshot shows video + checkmarks |
| F34 | `animation-gif` | Snapshot shows video element (GIF rendered as video) |
| F35 | `animation-with-caption` | Snapshot shows video + caption |
| F36 | `voice-incoming` | Snapshot shows waveform/duration, play button |
| F37 | `voice-outgoing` | Snapshot shows waveform + checkmarks |
| F38 | `voice-with-speech` | Snapshot shows transcription text |
| F39 | `video-note-incoming` | Snapshot shows video element (round) |
| F40 | `sticker-webp` | Snapshot shows img element |
| F41 | `sticker-tgs` | Snapshot shows sticker container |
| F42 | `sticker-webm` | Snapshot shows video element |
| F43 | `sticker-with-reactions` | Snapshot shows sticker + reaction buttons |
| F44 | `album-photos` | Snapshot shows multiple img elements in grid |
| F45 | `album-with-caption` | Snapshot shows grid + caption |
| F46 | `album-mixed` | Snapshot shows img + video in grid |
| F47 | `document-file` | Snapshot shows document label text |
| F48 | `service-pin` | Snapshot shows service message text |
| F49 | `pending-sending` | Snapshot shows message text (sending state) |
| F50 | `pending-failed` | Snapshot shows message text (failed state) |

**Batch verification for all fixtures:**

| # | Criterion | Verify |
|---|-----------|--------|
| FA | All 50 fixtures render without console errors | Playwright `dev` project: each test asserts `errors.length === 0` |
| FB | All 50 fixtures produce a non-empty screenshot | Playwright `dev` project: `toHaveScreenshot()` per fixture, all pass |
| FC | All 50 fixture pages have `[data-testid='fixture-message']` | Playwright: `page.waitForSelector("[data-testid='fixture-message']")` succeeds for all |

### Harness entry point & routing

| # | Criterion | Verify |
|---|-----------|--------|
| R1 | `dev.html` exists as separate Vite entry | `ls apps/app/src/mainview/dev.html` exits 0 |
| R2 | `/dev` renders fixture index | `agent-browser open URL/dev && agent-browser wait "[data-testid='fixture-list']" && agent-browser snapshot -i` shows 50 fixture links |
| R3 | `/dev/fixture/:name` renders fixture page | `agent-browser open URL/dev/fixture/text-incoming && agent-browser wait "[data-testid='fixture-message']"` succeeds |
| R4 | `/` renders normal app | `agent-browser open URL/ && agent-browser snapshot -i` shows auth or chat |
| R5 | Unknown fixture shows error | `agent-browser open URL/dev/fixture/nonexistent && agent-browser wait "[data-testid='fixture-error']"` succeeds |
| R6 | Dev entry excluded from prod build | `bun run build && ls apps/app/dist/dev.html 2>/dev/null; echo $?` returns 1 |

### Fixture format

| # | Criterion | Verify |
|---|-----------|--------|
| FF1 | fixture.json has `{ message, showSender, groupPosition }` | `jq '.message.kind' < fixtures/text-incoming/fixture.json` returns `"message"` |
| FF2 | Media URLs resolve | `curl -s -o /dev/null -w '%{http_code}' URL/dev/fixtures/voice-incoming/media/voice.ogg` returns `200` |
| FF3 | manifest.json lists all 50 fixtures | `jq 'length' < manifest.json` returns 50 |

### Fixture page rendering

| # | Criterion | Verify |
|---|-----------|--------|
| FP1 | Message in chat-width container | `agent-browser get box "[data-testid='fixture-message']"` width <= 480 |
| FP2 | Metadata bar shows name + kind | `agent-browser get text "[data-testid='fixture-meta']"` contains fixture name |
| FP3 | State summary shows content/direction | `agent-browser get text "[data-testid='fixture-state']"` contains content kind |
| FP4 | CSS custom properties resolve | `agent-browser get styles "[data-testid='message-bubble']"` shows non-zero border-radius |

### Playwright integration

| # | Criterion | Verify |
|---|-----------|--------|
| PW1 | `dev` project in config | `grep -c "'dev'" apps/app/playwright.config.ts` >= 1 |
| PW2 | All 50 screenshots pass | `cd apps/app && bunx playwright test --project dev` exits 0 |
| PW3 | Baselines stored | `find apps/app/tests -name '*.png' -path '*harness*' \| wc -l` >= 50 |

### Agent-browser workflow

| # | Criterion | Verify |
|---|-----------|--------|
| AB1 | Scoped snapshot < 50 lines | `agent-browser snapshot -s "[data-testid='fixture-message']" \| wc -l` < 50 |
| AB2 | Annotated screenshot has refs | `agent-browser screenshot --annotate /tmp/test.png` output contains `@e` |
| AB3 | Diff screenshot works | Take screenshot, reload, diff — exits 0 |

### Build

| # | Criterion | Verify |
|---|-----------|--------|
| B1 | Typecheck | `bun run typecheck` exits 0 |
| B2 | Tests pass | `bun run test` exits 0 |
| B3 | Lint clean | `bun run lint` exits 0 |

## TODO

### Step 1: Vite multi-page setup

Depends on: nothing

Add `dev.html` as a second entry point. Add Vite middleware to rewrite `/dev/*` → `dev.html`. Configure build to exclude dev entry from production.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Create `src/mainview/dev.html` with `<script type="module" src="/dev-main.tsx">` | `ls apps/app/src/mainview/dev.html` exits 0 | TODO |
| 1.2 | Create `src/mainview/dev-main.tsx` — renders `DevHarness` inside `StrictMode` + `TooltipProvider`, imports `index.css` | `ls apps/app/src/mainview/dev-main.tsx` exits 0 | TODO |
| 1.3 | Add `devHarnessPlugin()` to `vite.config.ts` — middleware rewrites `/dev` and `/dev/*` to serve `dev.html` | `grep -c "devHarnessPlugin\|dev.html" apps/app/vite.config.ts` >= 1 | TODO |
| 1.4 | Exclude `dev.html` from production build | `bun run build && ls apps/app/dist/dev.html 2>/dev/null; echo $?` — build succeeds and dev.html not in dist | TODO |
| 1.5 | `/dev` loads the harness entry | `curl -s http://worktree.localhost:1355/dev \| grep 'dev-main.tsx'` matches | TODO |
| 1.6 | `/` still loads the main app | `curl -s http://worktree.localhost:1355/ \| grep 'main.tsx'` matches | TODO |

### Step 2: Dev harness components

Depends on: Step 1

Create the React components: router, index page, fixture page.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Create `src/mainview/dev/dev-harness.tsx` — reads pathname, renders `FixtureIndex` or `FixturePage` | File exists and `grep -c "FixtureIndex\|FixturePage" apps/app/src/mainview/dev/dev-harness.tsx` >= 2 | TODO |
| 2.2 | Create `src/mainview/dev/fixture-index.tsx` — fetches manifest.json, renders grid of fixture cards as links, `data-testid="fixture-list"` | `grep -c "data-testid.*fixture-list" apps/app/src/mainview/dev/fixture-index.tsx` >= 1 | TODO |
| 2.3 | Create `src/mainview/dev/fixture-page.tsx` — fetches fixture.json, renders `PureMessageRow` in width-constrained container, metadata bar, state summary | `grep -c "data-testid" apps/app/src/mainview/dev/fixture-page.tsx` >= 3 | TODO |
| 2.4 | `PureMessageRow` rendered with no-op callbacks | `grep -c "PureMessageRow" apps/app/src/mainview/dev/fixture-page.tsx` >= 1 | TODO |
| 2.5 | Message width constrained to chat width (max ~420-480px) | `agent-browser open URL/dev/fixture/text-incoming && agent-browser get box "[data-testid='fixture-message']"` width <= 480 | TODO |
| 2.6 | Error state for unknown fixture `data-testid="fixture-error"` | `agent-browser open URL/dev/fixture/nonexistent && agent-browser get text "[data-testid='fixture-error']"` returns error | TODO |
| 2.7 | Index links navigate client-side | `agent-browser open URL/dev && agent-browser snapshot -i && agent-browser click @e1 && agent-browser wait "[data-testid='fixture-message']"` works | TODO |
| 2.8 | No console errors | `agent-browser open URL/dev && agent-browser errors` empty | TODO |

### Step 3: Create all 50 seed fixtures

Depends on: nothing (can run in parallel with Steps 1-2)

Write a generator script (`scripts/generate-fixtures.ts`) that creates all 50 fixture folders. The script constructs TGMessage objects directly (not via TDLib conversion), copies/symlinks media from `public/dev/media/` and `public/dev/photos/`, and writes `manifest.json`.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Create `scripts/generate-fixtures.ts` | `ls apps/app/scripts/generate-fixtures.ts` exits 0 | TODO |
| 3.2 | Script generates all 50 fixture folders | `bun apps/app/scripts/generate-fixtures.ts && ls apps/app/src/mainview/public/dev/fixtures/ \| grep -v manifest \| wc -l` returns 50 | TODO |
| 3.3 | Every fixture.json has valid `message.kind` field | `for d in apps/app/src/mainview/public/dev/fixtures/*/; do jq -e '.message.kind' "$d/fixture.json" > /dev/null || echo "FAIL: $d"; done` — no FAIL lines | TODO |
| 3.4 | Media files exist for fixtures that reference them | `jq -r '.message.content.media.url // .message.content.url // empty' fixtures/voice-incoming/fixture.json` path exists as file | TODO |
| 3.5 | manifest.json has 50 entries | `jq 'length' < apps/app/src/mainview/public/dev/fixtures/manifest.json` returns 50 | TODO |
| 3.6 | Text fixtures: entities arrays match expected entity types | `jq '.message.content.entities[].type' < fixtures/text-with-bold-italic/fixture.json` includes "bold" and "italic" | TODO |
| 3.7 | Reaction fixtures: reactions array non-empty | `jq '.message.reactions \| length' < fixtures/text-with-reactions/fixture.json` > 0 | TODO |
| 3.8 | Reply fixtures: replyTo is non-null | `jq '.message.replyTo' < fixtures/text-with-reply/fixture.json` is not null | TODO |
| 3.9 | Forward fixtures: forward is non-null | `jq '.message.forward' < fixtures/text-with-forward/fixture.json` is not null | TODO |
| 3.10 | Album fixtures: items array has multiple entries | `jq '.message.content.items \| length' < fixtures/album-photos/fixture.json` >= 2 | TODO |
| 3.11 | Service fixture: kind is 'service' | `jq '.message.kind' < fixtures/service-pin/fixture.json` returns "service" | TODO |
| 3.12 | Pending fixtures: kind is 'pending' | `jq '.message.kind' < fixtures/pending-sending/fixture.json` returns "pending" | TODO |
| 3.13 | GroupPosition fixtures: groupPosition set correctly | `jq '.groupPosition' < fixtures/text-group-first/fixture.json` returns "first" | TODO |

### Step 4: Playwright `dev` project

Depends on: Steps 2, 3

Add `dev` project to Playwright. Create test that reads manifest, visits each fixture, verifies render + screenshot.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Add `dev` project to `playwright.config.ts` matching `dev/harness.test.ts` | `grep -c "'dev'" apps/app/playwright.config.ts` >= 1 | TODO |
| 4.2 | Create `tests/dev/harness.test.ts` — reads manifest, iterates all fixtures, navigates to each, waits for `[data-testid='fixture-message']`, calls `toHaveScreenshot()` | File exists and `grep -c "toHaveScreenshot" apps/app/tests/dev/harness.test.ts` >= 1 | TODO |
| 4.3 | Test asserts zero console errors per fixture | `grep -c "console" apps/app/tests/dev/harness.test.ts` >= 1 | TODO |
| 4.4 | Generate initial screenshot baselines for all 50 fixtures | `cd apps/app && bunx playwright test --project dev --update-snapshots` exits 0 | TODO |
| 4.5 | Tests pass cleanly against baselines | `cd apps/app && bunx playwright test --project dev` exits 0 | TODO |

### Step 5: Capture plugin (Cmd+Shift+C)

Depends on: Step 2

Dev-mode-only capture. Vite middleware endpoint + browser-side capture module.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | Add `fixtureWriterPlugin()` to `vite.config.ts` — `POST /api/dev/fixture` writes fixture folder + updates manifest | `grep -c "/api/dev/fixture" apps/app/vite.config.ts` >= 1 | TODO |
| 5.2 | Create `src/mainview/dev/capture.ts` — Cmd+Shift+C handler, hover highlight, click to serialize TGMessage + fetch media + POST | `ls apps/app/src/mainview/dev/capture.ts` exits 0 | TODO |
| 5.3 | Import capture in `app.tsx` under `import.meta.env.DEV` | `grep -c "capture" apps/app/src/mainview/app.tsx` >= 1 | TODO |
| 5.4 | Captured fixture is valid | `jq '.message.kind' < captured-fixture/fixture.json` returns `"message"` | TODO |
| 5.5 | Captured fixture in manifest | `jq '.[].name' < manifest.json` includes new fixture | TODO |
| 5.6 | Captured media files saved | `ls captured-fixture/media/` contains files | TODO |

### Step 6: Final verification

Depends on: Steps 1-5

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Typecheck | `bun run typecheck` exits 0 | TODO |
| 6.2 | Unit tests pass | `bun run test` exits 0 | TODO |
| 6.3 | Lint clean | `bun run lint` exits 0 | TODO |
| 6.4 | Harness index shows 50 fixtures | `agent-browser open URL/dev && agent-browser snapshot -i` shows 50 fixture links | TODO |
| 6.5 | Playwright dev tests pass (all 50) | `cd apps/app && bunx playwright test --project dev` exits 0 | TODO |
| 6.6 | Agent-browser full workflow | `agent-browser open URL/dev/fixture/text-incoming && agent-browser screenshot --annotate /tmp/harness.png && agent-browser snapshot -s "[data-testid='fixture-message']"` works | TODO |
| 6.7 | Normal app unaffected | `agent-browser open URL/ && agent-browser snapshot -i` shows auth (no harness) | TODO |

## Context for Future Agents

### Instructions for agents
- Do not ask questions — figure it out yourself. If you need user input or manual tasks (browser login, UI verification, etc.), use agent-browser to do it yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- The dev harness NEVER imports from `@/data/telegram` or `@/data/store`. It renders `PureMessageRow` with static JSON data only.
- Use `data-testid` attributes on all key elements — never CSS class selectors for test targeting.
- The `dev.html` entry point is separate from `index.html`. They share CSS (`index.css`) and components but not boot logic.
- The capture plugin (Step 5) runs inside the main app context (where the store exists). The harness (Steps 1-4) is completely independent.
- Fixtures are TGMessage objects (post-conversion). Do NOT import or use TDLib types or conversion functions in the harness.
- The generator script (Step 3) constructs TGMessage objects directly — it does NOT call toTGMessage/hydrateMessage.
- Add `data-testid="message-bubble"` to the `PureBubble` component if not already present.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/index.html` | Main app entry HTML — do not modify |
| `apps/app/src/mainview/main.tsx` | Main app entry JS — do not modify |
| `apps/app/src/mainview/app.tsx` | Main app shell — only modify for capture import (Step 5) |
| `apps/app/src/mainview/index.css` | Shared CSS (Tailwind + custom properties) — import in dev-main.tsx |
| `apps/app/src/mainview/components/ui/chat/pure-message-row.tsx` | `PureMessageRow` + `MessageProps` — the component under test |
| `apps/app/src/mainview/components/ui/chat/message-rendering.ts` | `computeMessageState()` — pure function called by PureMessageRow |
| `apps/app/src/mainview/components/ui/chat/bubble.tsx` | `GroupPosition` type export, `PureBubble` — add `data-testid` |
| `apps/app/src/mainview/data/types/tg.ts` | `TGMessage` type — fixture.json must match this shape exactly |
| `apps/app/src/mainview/data/types/convert.ts` | `toTGMessage()`, `hydrateMessage()` — used by capture plugin only |
| `apps/app/src/mainview/data/types/__tests__/fixtures.ts` | Existing Td.message fixtures — reference for realistic data shapes |
| `apps/app/src/mainview/public/dev/media/` | Dev media (mp4, ogg, jpg, webp) — reuse in fixtures |
| `apps/app/src/mainview/public/dev/photos/` | Dev avatar photos (keyed by user ID) |
| `apps/app/vite.config.ts` | Vite config — add devHarnessPlugin + fixtureWriterPlugin |
| `apps/app/playwright.config.ts` | Add `dev` project |
| `apps/app/tests/fixtures.ts` | Playwright fixture pattern (appTest, perfTest) |
| `apps/app/src/mainview/components/ui/tooltip.tsx` | `TooltipProvider` — needed in dev-main.tsx |

### Reference implementations

| Source | What to take |
|--------|-------------|
| `vite.config.ts` `sessionPlugin()` | Pattern for Vite dev middleware (file read/write via plugin) |
| `tests/e2e/app.test.ts` | Playwright test structure, `data-testid` usage, serial mode |
| `tests/fixtures.ts` | Worker-scoped Playwright fixture pattern (appTest.extend) |
| `data/types/__tests__/fixtures.ts` | Realistic TDLib data shapes for reference when crafting TGMessage fixtures |
| `data/types/tg.ts` | Exact TGMessage type shape — fixtures must match |
| Vite docs: multi-page app | `build.rollupOptions.input` for multiple entry points |

### Lessons learned

1. Vite root is `src/mainview/`, not `apps/app/`. HTML entry points go in `src/mainview/`. Public files served from `src/mainview/public/`.
2. `PureMessageRow` imports from `@/data` (types only) and `@/lib/media-sizing`. Pure imports — no store or daemon dependency.
3. `TooltipProvider` from `@/components/ui/tooltip` wraps the app. Harness must include it too.
4. Dev media filenames are numeric IDs: `718285.ogg`, `718801.jpg`, `719117.webp`. Avatar photos keyed by user ID: `91754006.jpg`.
5. `GroupPosition` is `'single' | 'first' | 'middle' | 'last'` — set in fixture.json.
6. Fixtures store `TGMessage` (post-conversion), not `Td.message`. Harness stays decoupled from conversion pipeline.
7. `sessionPlugin()` in vite.config.ts is the established pattern for custom dev middleware endpoints.
8. `detectBaseURL()` in playwright.config.ts reads portless routes — `dev` project uses same detection.
9. Capture plugin (Step 5) needs Zustand store + conversion functions — runs in main app, not harness.
10. `data-testid="message-bubble"` must be added to `PureBubble` if not present — needed for agent-browser style inspection.
11. `CustomEmojiInfo` type is imported from `@/data/telegram` in tg.ts. Fixture JSON just uses `Record<string, { url: string } | null>` shape — no need to import the type.
12. Existing `public/dev/media/` has: `716159.mp4`, `718076.mp4`, `719119.mp4` (videos), `718285.ogg`, `718673.ogg` (voice), `718802.jpg`, `718801.jpg`, `98779.jpg` (photos), `719117.webp` (sticker). Use these real files in fixtures for authentic rendering.
