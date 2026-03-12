# Design System Cleanup

## Goal

Clean up and standardize the design system so that every production component uses semantic tokens, follows consistent styling patterns, has no dead code in the CSS, accepts `className` for flexibility, and fixes P1 accessibility gaps. After completion, the design system has one color system (OKLCH semantic tokens), zero dead CSS, and consistent component APIs.

**Success criteria:**

```bash
# No raw Radix palette colors in production components
grep -rE '(bg|text|border|fill)-(sand|blue|red|plum|green|gray|lime)-[0-9]' \
  apps/app/src/mainview/components/ --include='*.tsx' | wc -l
# → 0

# No dead imports/classes/fonts in index.css
grep -cE 'FiraCode|tw-glass|gray\.css|lime\.css|scrollbar-thin|shadow-crisp-edge|animate-fade-blur-in|fade-up|fade-blur-in' \
  apps/app/src/mainview/index.css
# → 0

# No dead CSS variables
grep -cE 'message-own-foreground|message-peer-foreground|--spoiler' \
  apps/app/src/mainview/index.css
# → 0

# All Pure* chat components accept className
for f in apps/app/src/mainview/components/ui/chat/*.tsx; do
  grep -qE 'className' "$f" || echo "MISSING: $f"
done
# → no output

# No functional tokens with color in their name
grep -cE 'accent-blue' apps/app/src/mainview/index.css
# → 0

# Typecheck passes
bun run typecheck  # exits 0

# Tests pass
bun run test  # exits 0
```

## Architecture

```
index.css (single source of truth)
├── @import tailwindcss
├── @import tw-animate-css
├── @import tw-shimmer
├── @import tw-glass              ← DEAD, remove
├── @import @radix-ui/colors
│   ├── sand / sand-dark          ← powers text-text-* aliases, remove after Step 1.4
│   ├── blue, red, plum, green    ← avatar.tsx only, remove after Step 2.1
│   ├── gray / gray-dark          ← DEAD, remove
│   └── lime / lime-dark          ← DEAD, remove
├── @font-face
│   ├── Open Sans                 ← keep
│   ├── Geist Mono                ← keep
│   └── FiraCode Nerd Font        ← DEAD, remove
├── :root / .dark                 ← semantic OKLCH tokens
├── @theme inline                 ← bridges CSS vars → Tailwind classes
├── custom classes                ← some dead
└── @keyframes                    ← some dead

components/ui/          → shadcn primitives
components/ui/chat/     → Pure* domain atoms
components/chat/        → integration layer (store-connected)
```

**Dependency chain:**
```
Step 1 (define tokens) → Step 2 (migrate components) → Step 5 (standardize) → Step 6 (remove dead code)
Step 3 (className) ── parallel, no dependencies
Step 4 (a11y) ── parallel, no dependencies
```

## What's been done

- Full color audit completed — 64 semantic tokens in use, 7 raw Radix refs in 2 production files
- All 13 dead CSS items verified dead with grep
- DESIGN.md rewritten to reflect actual codebase state
- All Pure* components inventoried for className support (2/17 have it)

## TODO

### Step 1: Define new semantic tokens in `index.css`

Add tokens that replace raw Radix colors and color-named functional tokens. Must happen first — all component migrations depend on these.

**File:** `apps/app/src/mainview/index.css`

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Add `--avatar-1` through `--avatar-5` in `:root` (line ~132) and `.dark` (line ~168) | `grep -c 'avatar-1' apps/app/src/mainview/index.css` returns 2 | TODO |
| 1.2 | Add `--color-avatar-1` through `--color-avatar-5` in `@theme inline` (line ~270) | `grep -c 'color-avatar' apps/app/src/mainview/index.css` returns 5 | TODO |
| 1.3 | Rename `--accent-blue` → `--accent-brand` and `--accent-blue-subtle` → `--accent-brand-subtle` in `:root` (lines 126-127), `.dark` (lines 162-163), and `@theme inline` | `grep -c 'accent-blue' apps/app/src/mainview/index.css` returns 0 | TODO |
| 1.4 | Redefine `--color-text-primary/secondary/tertiary/quaternary` (lines 261-264) as standalone OKLCH values instead of `var(--sand-*)` aliases. Ensure `text-quaternary` meets WCAG AA 4.5:1 contrast on white | `grep 'color-text-primary' apps/app/src/mainview/index.css` shows `oklch(` not `var(--sand` | TODO |
| 1.5 | Add `--draft` token in `:root` and `.dark` + `--color-draft` in `@theme inline` | `grep -c '\-\-draft' apps/app/src/mainview/index.css` returns 3+ | TODO |
| 1.6 | Add `--badge-muted` token in `:root` and `.dark` + `--color-badge-muted` in `@theme inline` | `grep -c 'badge-muted' apps/app/src/mainview/index.css` returns 3+ | TODO |

**Token values (suggested — match current visual appearance):**

```css
/* :root (light) */
--avatar-1: oklch(0.55 0.2 260);     /* was blue-9 */
--avatar-2: oklch(0.55 0.2 320);     /* was plum-9 */
--avatar-3: oklch(0.65 0.2 150);     /* was green-9 */
--avatar-4: oklch(0.6 0.2 25);       /* was red-9 */
--avatar-5: oklch(0.6 0.05 80);      /* was sand-9 */
--draft: oklch(0.577 0.245 27.325);  /* matches destructive */
--badge-muted: oklch(0.588 0 0);     /* was sand-8 */

/* .dark */
--avatar-1: oklch(0.55 0.2 260);     /* same or adjust for dark */
--avatar-2: oklch(0.55 0.2 320);
--avatar-3: oklch(0.65 0.2 150);
--avatar-4: oklch(0.6 0.2 25);
--avatar-5: oklch(0.6 0.05 80);
--draft: oklch(0.704 0.191 22.216);  /* matches destructive dark */
--badge-muted: oklch(0.45 0 0);

/* text hierarchy — standalone OKLCH, no more var(--sand-*) */
--color-text-primary: oklch(0.15 0.005 75);     /* was var(--sand-12) */
--color-text-secondary: oklch(0.44 0.01 75);    /* was var(--sand-11) */
--color-text-tertiary: oklch(0.55 0.01 75);     /* was var(--sand-10) */
--color-text-quaternary: oklch(0.65 0.005 75);  /* was var(--sand-9), bumped for contrast */
```

**Important:** The accent-brand rename in 1.3 affects many component files. The agent must do a project-wide find-and-replace of `accent-blue` → `accent-brand` in both CSS and TSX files. Check all usages first:
```bash
grep -rn 'accent-blue' apps/app/src/mainview/ --include='*.tsx' --include='*.ts' --include='*.css'
```

---

### Step 2: Migrate production components to semantic tokens

Depends on: Step 1

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | `avatar.tsx:4-8` — replace `bg-blue-9 text-white`, `bg-plum-9 text-white`, `bg-green-9 text-white`, `bg-red-9 text-white`, `bg-sand-9 text-white` with `bg-avatar-1 text-white` through `bg-avatar-5 text-white` | `grep -E '(blue\|plum\|green\|red\|sand)-9' apps/app/src/mainview/components/ui/avatar.tsx \| wc -l` returns 0 | TODO |
| 2.2 | `ChatSidebar.tsx:704` — replace `bg-sand-8` with `bg-badge-muted` | `grep 'sand-8' apps/app/src/mainview/components/chat/ChatSidebar.tsx \| wc -l` returns 0 | TODO |
| 2.3 | `ChatSidebar.tsx:101` — replace `text-red-500` with `text-draft` | `grep 'red-500' apps/app/src/mainview/components/chat/ChatSidebar.tsx \| wc -l` returns 0 | TODO |
| 2.4 | All TSX files — rename `accent-blue` → `accent-brand` and `accent-blue-subtle` → `accent-brand-subtle` in Tailwind class strings | `grep -rE 'accent-blue' apps/app/src/mainview/ --include='*.tsx' \| wc -l` returns 0 | TODO |
| 2.5 | Verify no raw Radix palette colors remain in production components | `grep -rE '(bg\|text\|border\|fill)-(sand\|blue\|red\|plum\|green)-[0-9]' apps/app/src/mainview/components/ --include='*.tsx' \| wc -l` returns 0 | TODO |
| 2.6 | `bun run typecheck` passes | exits 0 | TODO |

---

### Step 3: Add `className` to all `Pure*` chat components

Can run in parallel with Steps 1-2.

For each component: add `className?: string` to the props type, import `cn` from `@/lib/utils` if not already imported, and apply `cn(existingClasses, className)` on the root element.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | `BotKeyboard.tsx` — add className | `grep 'className' apps/app/src/mainview/components/ui/chat/BotKeyboard.tsx` matches | TODO |
| 3.2 | `CornerButtons.tsx` — add className to both `PureCornerButton` and `PureCornerButtonStack` | `grep -c 'className' apps/app/src/mainview/components/ui/chat/CornerButtons.tsx` ≥ 2 | TODO |
| 3.3 | `EmojiStatusIcon.tsx` — add className | grep matches | TODO |
| 3.4 | `ForwardHeader.tsx` — add className | grep matches | TODO |
| 3.5 | `LinkPreviewCard.tsx` — add className | grep matches | TODO |
| 3.6 | `MessageInput.tsx` — add className | grep matches | TODO |
| 3.7 | `MessageTime.tsx` — add className | grep matches | TODO |
| 3.8 | `PhotoView.tsx` — add className | grep matches | TODO |
| 3.9 | `ReactionBar.tsx` — add className to both `PureReactionBar` and `PureReactionPicker` | grep matches | TODO |
| 3.10 | `ReplyHeader.tsx` — add className | grep matches | TODO |
| 3.11 | `ServiceMessage.tsx` — add className | grep matches | TODO |
| 3.12 | `StatusText.tsx` — add className | grep matches | TODO |
| 3.13 | `TypingIndicator.tsx` — add className | grep matches | TODO |
| 3.14 | `VideoView.tsx` — add className | grep matches | TODO |
| 3.15 | `VoiceView.tsx` — add className | grep matches | TODO |
| 3.16 | All Pure* components accept className | `for f in apps/app/src/mainview/components/ui/chat/*.tsx; do grep -qE 'className' "$f" \|\| echo "MISSING: $f"; done` returns no output | TODO |
| 3.17 | `bun run typecheck` passes | exits 0 | TODO |

**Already have className:** `Bubble.tsx`, `OnlineDot.tsx` — skip these.

---

### Step 4: Fix P1 accessibility gaps

Can run in parallel with Steps 1-3.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | `CornerButtons.tsx:11-30` — spread `...props` on the `<button>` element so callers can pass `aria-label` | `grep '\.\.\.' apps/app/src/mainview/components/ui/chat/CornerButtons.tsx` matches | TODO |
| 4.2 | `MessageInput.tsx:43-51` — add `aria-label="Send message"` on the send `<Button>` | `grep 'Send message' apps/app/src/mainview/components/ui/chat/MessageInput.tsx` matches | TODO |
| 4.3 | `MessageInput.tsx:33-42` — add `aria-label="Type a message"` on the textarea | `grep 'Type a message' apps/app/src/mainview/components/ui/chat/MessageInput.tsx` matches | TODO |
| 4.4 | `ChatSidebar.tsx:513-519` — add `aria-label="Clear search"` on the X button | `grep 'Clear search' apps/app/src/mainview/components/chat/ChatSidebar.tsx` matches | TODO |
| 4.5 | `ChatSidebar.tsx:522-528` — add `aria-label="Close search"` on the X button | `grep 'Close search' apps/app/src/mainview/components/chat/ChatSidebar.tsx` matches | TODO |
| 4.6 | `bun run typecheck` passes | exits 0 | TODO |

---

### Step 5: Standardize styling patterns

Depends on: Step 2 (tokens in place, components migrated)

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | `ChatSidebar.tsx:525,540` — add `transition-colors` to hover elements | `grep -A1 'hover:bg-accent hover:text-text-secondary' apps/app/src/mainview/components/chat/ChatSidebar.tsx` shows `transition-colors` on same line | TODO |
| 5.2 | `Bubble.tsx:70` — replace inline `style={{ borderRadius }}` with Tailwind classes. Define CSS vars `--bubble-r-sm: 4px` and `--bubble-r-lg: 12px`, use `rounded-[var(--bubble-r-sm)]` / `rounded-[var(--bubble-r-lg)]` per corner, or use conditional Tailwind classes | `grep -c 'borderRadius' apps/app/src/mainview/components/ui/chat/Bubble.tsx` returns 0 | TODO |
| 5.3 | `Message.tsx:107,253,402,538` — normalize spacer spans to consistent units. Replace `h-[18px]` with `h-[1.125rem]` (same value in rem) and `w-[5.5rem]` stays as-is, so both are rem | `grep 'h-\[18px\]' apps/app/src/mainview/components/chat/Message.tsx \| wc -l` returns 0 | TODO |
| 5.4 | `PhotoView.tsx:60,90` — replace `style={{ filter: 'blur(20px)', transform: 'scale(1.1)' }}` with `blur-[20px] scale-110` | `grep "filter.*blur" apps/app/src/mainview/components/ui/chat/PhotoView.tsx \| wc -l` returns 0 | TODO |
| 5.5 | `bun run typecheck` passes | exits 0 | TODO |

---

### Step 6: Remove dead code from `index.css`

Depends on: Steps 1, 2, 5 (all migrations complete, nothing references old tokens)

**File:** `apps/app/src/mainview/index.css`

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Remove FiraCode `@font-face` (lines 64-84) | `grep -c 'FiraCode' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.2 | Remove `@import "tw-glass"` (line 3) | `grep -c 'tw-glass' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.3 | Remove `@import` for gray.css, gray-dark.css (lines 7-8), lime.css, lime-dark.css (lines 17-18) | `grep -cE 'gray\.css\|lime\.css' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.4 | Remove `--color-gray-1` through `--color-gray-12` from `@theme inline` (lines 224-235) | `grep -c 'color-gray' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.5 | Remove `--message-own-foreground` from `:root` (line 121), `.dark` (line 157), `@theme inline` | `grep -c 'message-own-foreground' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.6 | Remove `--message-peer-foreground` from `:root` (line 123), `.dark` (line 159), `@theme inline` | `grep -c 'message-peer-foreground' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.7 | Remove `--spoiler` from `:root` (line 130), `.dark` (line 166), `@theme inline` | `grep -c '\-\-spoiler' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.8 | Remove dead theme tokens: `--color-red-3` (line 250), `--color-red-12` (line 253), `--color-green-10` (line 258), `--color-green-11` (line 259) | `grep -cE 'color-red-3\b\|color-red-12\|color-green-10\|color-green-11' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.9 | Remove `.scrollbar-thin` class (lines 302-314) | `grep -c 'scrollbar-thin' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.10 | Remove `.shadow-crisp-edge` class (lines 334-341) | `grep -c 'shadow-crisp-edge' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.11 | Remove `@keyframes fade-up` (lines 344-353) and `@keyframes fade-blur-in` (lines 355-366) and `.animate-fade-blur-in` (lines 387-389) | `grep -cE 'fade-blur-in\|fade-up' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.12 | Remove `tw-glass` from `apps/app/package.json` dependencies | `grep -c 'tw-glass' apps/app/package.json` returns 0 | TODO |
| 6.13 | Check if sand, blue, red, plum, green Radix imports can now be removed (after Steps 1.4 + 2.1-2.3 eliminated all references) | `grep -rE '(sand\|blue\|red\|plum\|green)-[0-9]' apps/app/src/mainview/ --include='*.tsx' --include='*.ts' \| wc -l` returns 0 → remove imports | TODO |
| 6.14 | If Radix imports removed in 6.13, also remove their `--color-*` theme tokens from `@theme inline` | `grep -cE 'color-(sand\|blue\|red\|plum\|green)-' apps/app/src/mainview/index.css` returns 0 | TODO |
| 6.15 | Remove `@radix-ui/colors` from `apps/app/package.json` if no imports remain | `grep -c 'radix-ui/colors' apps/app/package.json` returns 0 | TODO |
| 6.16 | `bun run typecheck` passes | exits 0 | TODO |
| 6.17 | `bun run test` passes | exits 0 | TODO |
| 6.18 | `bun install` runs clean after dependency removal | exits 0 | TODO |

## Context for future agents

### Instructions for agents

- Do not ask questions — figure it out yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- Run `bun run typecheck` after each step to catch breakage early.
- When renaming tokens (accent-blue → accent-brand), do a project-wide search first to find ALL references before replacing.
- Line numbers are approximate — the file may shift as earlier steps add/remove lines. Always search for the content, not the line number.
- Dev/demo pages (`Home.tsx`, `DevPage.tsx`, `DemoChat.tsx`) are out of scope — do not modify them.
- Steps 3 and 4 are independent of Steps 1-2 and can run as separate parallel subagents.
- When adding className to Pure* components, follow the existing pattern in `Bubble.tsx` and `OnlineDot.tsx` — add `className?: string` to the props destructuring and use `cn()` on the root element.
- For the accent-blue → accent-brand rename, also check test files (`*.test.tsx`, `*.test.ts`).

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/index.css` | Single source of truth for all tokens, fonts, custom classes, keyframes |
| `apps/app/src/mainview/components/ui/avatar.tsx:4-8` | Avatar color palette — raw Radix colors to migrate |
| `apps/app/src/mainview/components/chat/ChatSidebar.tsx` | Largest component, has raw `bg-sand-8`, `text-red-500`, missing transitions |
| `apps/app/src/mainview/components/ui/chat/Bubble.tsx:21-44,70` | Inline border-radius via JS function |
| `apps/app/src/mainview/components/chat/Message.tsx:107,253,402,538` | Mixed px/rem spacers |
| `apps/app/src/mainview/components/ui/chat/PhotoView.tsx:60,90` | Inline blur filter |
| `apps/app/src/mainview/components/ui/chat/CornerButtons.tsx` | Missing aria-label + prop spread |
| `apps/app/src/mainview/components/ui/chat/MessageInput.tsx:43-51` | Send button missing aria-label |
| `apps/app/src/mainview/lib/utils.ts` | `cn()` utility — needed for className additions |
| `apps/app/package.json` | Remove tw-glass, potentially @radix-ui/colors deps |

### Reference implementations

| Source | What to take |
|--------|-------------|
| `Bubble.tsx` | Pattern for accepting className on Pure* components — `cn(baseClasses, className)` |
| `OnlineDot.tsx` | Same pattern, simpler example |
| `ChatHeader.tsx:25` | Pattern for `aria-label` on icon buttons |

### Lessons learned

1. `--color-text-*` aliases currently point to `var(--sand-*)` — can't remove sand Radix import until these are standalone OKLCH values (Step 1.4 must precede Step 6.13)
2. `avatar.tsx` uses 5 different Radix scales for its color palette — all 5 scale imports can be removed only after avatar tokens are in place
3. All 13 dead CSS items have been verified dead via exhaustive grep — safe to remove without risk
4. The `accent-blue` rename touches ~15 files — must be done atomically (CSS + all TSX in one pass) or typecheck will fail
5. Bubble radius uses a JS function (`bubbleRadius`) that returns different px values per corner based on group position — Tailwind replacement needs either CSS vars or conditional class logic, not a simple 1:1 swap
