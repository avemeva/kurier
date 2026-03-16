# Emoji Variation Selector Normalization

## Goal

All emoji in the app render as colorful emoji glyphs (never monochrome text outlines) regardless of whether TDLib sends them with or without `U+FE0F` (variation selector 16). Emoji sent back to TDLib (reactions, etc.) are stripped of `U+FE0F` to match TDLib's expected format. The solution covers all emoji surfaces: reactions, sticker labels, animated emoji, custom emoji in text, and any future emoji use.

**Success criteria:**
```bash
bun run typecheck                    # no type errors
bun run test                         # all tests pass
bun run lint                         # clean
# In browser: bare ❤ (U+2764) from TDLib renders as red heart, not monochrome outline
# In browser: clicking ❤️ reaction sends ❤ (without FE0F) to TDLib and succeeds
```

## Architecture

```
TDLib sends emoji inconsistently:
  sometimes "❤"  (U+2764, bare)
  sometimes "❤️" (U+2764 + U+FE0F)

                    ┌──────────────────────────────────────────────┐
                    │              convert.ts                       │
  TDLib raw ──────▶ │  toTGReactions()    → qualifyEmoji(emoji)    │ ──▶ TG types (display-ready)
  emoji             │  toTGContent()      → qualifyEmoji(emoji)    │     always fully-qualified
                    │  extractMediaLabel() → qualifyEmoji(emoji)   │     (FE0F present where needed)
                    └──────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────┐
                    │               store.ts                        │
  UI emoji ───────▶ │  react()  → stripVS16(emoji) → raw emoji    │ ──▶ telegram.ts → TDLib
  (with FE0F)       │  (future: any action that sends emoji)       │     always bare
                    └──────────────────────────────────────────────┘

Two utility functions:

  qualifyEmoji(emoji)  — add FE0F to text-default codepoints (for display)
                         leave ZWJ sequences, skin-toned, flags untouched
                         used at the READ boundary (convert.ts)

  stripVS16(emoji)     — remove all FE0F except inside ZWJ sequences
                         used at the WRITE boundary (store.ts)
```

### The problem

Some Unicode codepoints default to text (monochrome) presentation. They need `U+FE0F` appended to render as colorful emoji. TDLib sometimes sends them bare.

- ~219 codepoints have `Emoji=Yes` but `Emoji_Presentation=No` (text-default)
- ~78 of those are outside the BMP (2 JS chars), so the current `.length === 1` check misses them
- Examples: ❤ (U+2764), ♀ (U+2640), ♂ (U+2642), ☀ (U+2600), ✨ (U+2728), ⚡ (U+26A1)

### How tdesktop handles it

tdesktop sidesteps the problem with **sprite-based rendering** (WebP sheets). It:
1. Strips all FE0F for internal map keys (`BareIdFromInput()`)
2. Generated `Find()` function optionally skips FE0F at every position
3. Re-inserts FE0F into stored text for postfixed emoji
4. Renders from sprite sheets — never uses system fonts at display time

We use native browser emoji rendering, so we can't rely on sprites. We must ensure FE0F is present in display strings for text-default codepoints.

### How Telegram Web K (tweb) handles it

1. `cleanEmoji()` — strips all FE0F and skin tone modifiers when **sending** to server
2. `fixEmoji()` — adds FE0F back to specific characters (2640, 2642, 2764) when **displaying**
3. Emoji images have FE0F stripped from filenames

### How Telegram Web A (telegram-tt) handles it

1. `removeVS16s()` — strips FE0F **unless string contains ZWJ** (U+200D)
2. `fixNonStandardEmoji()` — adds FE0F back for 4 known broken ZWJ patterns
3. Uses custom emoji rendering (images), not native fonts

### Constraints

- CSS `font-variant-emoji: emoji` is NOT supported in Chrome or Safari — cannot use CSS-only fix
- Double-appending FE0F is invalid but harmless — guard against it
- ZWJ sequences NEED their FE0F — stripping breaks compound emoji (family, flag combos)
- Skin tone modifiers replace the need for FE0F — don't add both
- Only 3 emoji REQUIRE FE0F to be recognized: ™ (U+2122), © (U+00A9), ® (U+00AE)

## What's been done

- `normalizeEmoji()` in `convert.ts` exists but is naive: only handles `.length === 1`
- `store.ts:react()` strips FE0F with `rawEmoji = emoji.replace(/[\uFE0E\uFE0F]/g, '')` — correct for non-ZWJ emoji
- Applied only to reactions (`toTGReactions`), NOT to sticker emoji or animated emoji

### Current gaps

| Surface | File | Line | Normalized? |
|---------|------|------|-------------|
| Reaction emoji | `convert.ts` | 365 | YES (via `normalizeEmoji`, but heuristic) |
| Sticker emoji | `convert.ts` | 624 | NO |
| Animated emoji | `convert.ts` | 635 | NO |
| Dice emoji label | `convert.ts` | 93, 95 | NO (low risk — astral plane) |
| `QUICK_REACTIONS` | `reaction-bar.tsx` | 10 | Hardcoded with FE0F |
| `MENU_REACTIONS` | `message-context-menu.tsx` | 21 | Hardcoded with FE0F |
| Store `react()` outbound | `store.ts` | 536 | YES (strips FE0F) |

## Acceptance Criteria

### Emoji qualification (display)

| # | Criterion | Test | Verify |
|---|-----------|------|--------|
| 1 | `qualifyEmoji("❤")` (U+2764) returns `"❤️"` (U+2764+FE0F) | unit | `qualifyEmoji("\u2764") === "\u2764\uFE0F"` |
| 2 | `qualifyEmoji("❤️")` (already qualified) returns `"❤️"` (no double) | unit | `qualifyEmoji("\u2764\uFE0F") === "\u2764\uFE0F"` |
| 3 | `qualifyEmoji("🔥")` (Emoji_Presentation=Yes) returns `"🔥"` unchanged | unit | `qualifyEmoji("\uD83D\uDD25") === "\uD83D\uDD25"` |
| 4 | `qualifyEmoji("♀")` (U+2640, text-default) returns `"♀️"` | unit | `qualifyEmoji("\u2640") === "\u2640\uFE0F"` |
| 5 | `qualifyEmoji` handles supplementary plane text-default (e.g. U+1F321 thermometer) | unit | `qualifyEmoji("\uD83C\uDF21") === "\uD83C\uDF21\uFE0F"` |
| 6 | `qualifyEmoji` leaves ZWJ sequences untouched | unit | `qualifyEmoji("👨‍👩‍👧") === "👨‍👩‍👧"` |
| 7 | `qualifyEmoji` leaves flag sequences untouched | unit | `qualifyEmoji("🇺🇸") === "🇺🇸"` |
| 8 | `qualifyEmoji` leaves skin-toned emoji untouched | unit | `qualifyEmoji("👍🏽") === "👍🏽"` |

### Emoji stripping (outbound to TDLib)

| # | Criterion | Test | Verify |
|---|-----------|------|--------|
| 9 | `stripVS16("❤️")` returns `"❤"` | unit | `stripVS16("\u2764\uFE0F") === "\u2764"` |
| 10 | `stripVS16("🔥")` returns `"🔥"` (no-op) | unit | `stripVS16("\uD83D\uDD25") === "\uD83D\uDD25"` |
| 11 | `stripVS16` preserves FE0F inside ZWJ sequences | unit | `stripVS16("🏳️‍🌈")` contains `\uFE0F` (rainbow flag needs it) |
| 12 | Sending ❤️ reaction from UI results in TDLib receiving ❤ (without FE0F) | integration | No "reaction isn't available" error |

### Coverage

| # | Criterion | Test | Verify |
|---|-----------|------|--------|
| 13 | `toTGReactions` uses `qualifyEmoji` | grep | `grep -n "qualifyEmoji" apps/app/src/mainview/data/types/convert.ts` shows line ~365 |
| 14 | Sticker emoji in `toTGContent` uses `qualifyEmoji` | grep | `grep -n "qualifyEmoji" apps/app/src/mainview/data/types/convert.ts` shows lines ~624, ~635 |
| 15 | `store.ts:react()` uses `stripVS16` | grep | `grep -n "stripVS16" apps/app/src/mainview/data/store/store.ts` shows line ~536 |
| 16 | Old `normalizeEmoji` function is removed | grep | `grep -c "normalizeEmoji" apps/app/src/mainview/data/types/convert.ts` returns 0 |

### Build

| # | Criterion | Test | Verify |
|---|-----------|------|--------|
| B1 | Typecheck passes | build | `bun run typecheck` exits 0 |
| B2 | All tests pass | build | `bun run test` exits 0 |
| B3 | Lint clean | build | `bun run lint` exits 0 |

## TODO

### Step 1: Create the text-default emoji set

Depends on: nothing

Build the set of codepoints with `Emoji=Yes, Emoji_Presentation=No` — the ~219 codepoints that need FE0F for emoji rendering. This is the source of truth, replacing the `.length === 1` heuristic.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Create `apps/app/src/mainview/data/types/emoji-qualify.ts` with `TEXT_DEFAULT_EMOJI: Set<number>` containing all ~219 codepoints from Unicode emoji-data.txt | `grep "TEXT_DEFAULT_EMOJI" apps/app/src/mainview/data/types/emoji-qualify.ts` returns a match | TODO |
| 1.2 | Export `qualifyEmoji(emoji: string): string` — adds FE0F after text-default codepoints if not already present. Skips if ZWJ, skin tone, or flag sequence. | `bun run typecheck` exits 0 | TODO |
| 1.3 | Export `stripVS16(emoji: string): string` — removes FE0F unless string contains ZWJ (U+200D). Matches telegram-tt's `removeVS16s()` approach. | `bun run typecheck` exits 0 | TODO |
| 1.4 | Unit tests for `qualifyEmoji` covering AC #1-8 | `bun run test -- emoji-qualify` passes | TODO |
| 1.5 | Unit tests for `stripVS16` covering AC #9-11 | `bun run test -- emoji-qualify` passes | TODO |

### Step 2: Apply qualifyEmoji at the read boundary

Depends on: Step 1

Replace `normalizeEmoji` with `qualifyEmoji` in all emoji extraction points in `convert.ts`.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Replace `normalizeEmoji(r.type.emoji)` with `qualifyEmoji(r.type.emoji)` in `toTGReactions()` (line ~365) | `grep "qualifyEmoji" convert.ts` shows the line | TODO |
| 2.2 | Add `qualifyEmoji()` to sticker emoji in `toTGContent` messageSticker (line ~624) | `grep "qualifyEmoji" convert.ts` matches line ~624 | TODO |
| 2.3 | Add `qualifyEmoji()` to animated emoji in `toTGContent` messageAnimatedEmoji (line ~635) | `grep "qualifyEmoji" convert.ts` matches line ~635 | TODO |
| 2.4 | Remove old `normalizeEmoji` function | `grep -c "normalizeEmoji" convert.ts` returns 0 | TODO |
| 2.5 | `bun run typecheck` exits 0 | run command | TODO |

### Step 3: Apply stripVS16 at the write boundary

Depends on: Step 1

Replace the inline `.replace(/[\uFE0E\uFE0F]/g, '')` in `store.ts:react()` with `stripVS16`.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Replace inline strip in `store.ts:react()` with `stripVS16(emoji)` import | `grep "stripVS16" store.ts` matches | TODO |
| 3.2 | Verify reaction round-trip works: add ❤️ from UI, TDLib accepts | `agent-browser` test: right-click message → click ❤️ → no error toast | TODO |
| 3.3 | `bun run typecheck` exits 0 | run command | TODO |

### Step 4: Final verification

Depends on: Steps 1-3

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Typecheck | `bun run typecheck` exits 0 | TODO |
| 4.2 | All tests pass | `bun run test` exits 0 | TODO |
| 4.3 | Lint | `bun run lint` exits 0 | TODO |
| 4.4 | No references to old `normalizeEmoji` | `grep -r "normalizeEmoji" apps/app/src/` returns nothing | TODO |
| 4.5 | Reaction emoji round-trip works | Send reaction from UI, no TDLib error | TODO |

## Context for future agents

### Instructions for agents
- The `TEXT_DEFAULT_EMOJI` set should be derived from Unicode emoji-data.txt (`Emoji=Yes` minus `Emoji_Presentation=Yes`). Use the codepoint list, not regex heuristics.
- `qualifyEmoji` must handle both BMP and supplementary plane codepoints. Use `codePointAt()`, not `.length` or `.charCodeAt()`.
- `stripVS16` must preserve FE0F in ZWJ sequences — check for presence of `\u200D` before stripping. This is what telegram-tt does and it's the safest approach.
- Do not use CSS `font-variant-emoji` — not supported in Chrome/Safari.
- Do not add emoji sprite sheets — we use native browser rendering.

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/data/types/convert.ts` | Read boundary — TDLib raw → TG types. Lines 356-369 (current `normalizeEmoji`), 624 (sticker emoji), 635 (animated emoji) |
| `apps/app/src/mainview/data/store/store.ts` | Write boundary — `react()` action strips FE0F at line ~536 |
| `apps/app/src/mainview/data/telegram.ts` | TDLib API calls — `sendReaction()` at line ~331, receives pre-stripped emoji |
| `apps/app/src/mainview/components/ui/chat/reaction-bar.tsx` | `QUICK_REACTIONS` constant with hardcoded FE0F emoji |
| `apps/app/src/mainview/components/ui/chat/message-context-menu.tsx` | `MENU_REACTIONS` constant with hardcoded FE0F emoji |

### Reference implementations

| Source | What to take |
|--------|-------------|
| tdesktop `BareIdFromInput()` | Strip-all-FE0F approach for map keys |
| tdesktop `postfixed` property | Track which emoji need FE0F for canonical form |
| telegram-tt `removeVS16s()` | Strip FE0F unless ZWJ present — our `stripVS16` model |
| telegram-tt `fixNonStandardEmoji()` | 4 specific ZWJ patterns that need FE0F re-inserted |
| tweb `fixEmoji()` | Simple add-FE0F-to-3-chars approach (minimal but incomplete) |
| Unicode `emoji-data.txt` | Definitive list of `Emoji_Presentation=No` codepoints |

### Lessons learned

1. TDLib sends emoji inconsistently — sometimes with FE0F, sometimes without. Must handle both.
2. The `.length === 1` heuristic in `normalizeEmoji` misses 78 supplementary-plane text-default emoji.
3. Stripping FE0F from ZWJ sequences breaks compound emoji (rainbow flag, family emoji, etc.).
4. The store must hold raw TDLib format (no FE0F). Normalize at read boundary (convert.ts), denormalize at write boundary (store.ts).
5. `font-variant-emoji: emoji` CSS property is not viable — Chrome and Safari don't support it.
6. Double-appending FE0F is technically invalid — `qualifyEmoji` must check before appending.
