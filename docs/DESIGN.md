# Design System

> Living document — reflects the actual state of the codebase, not aspirations.
> Last verified: 2026-03-12

## Architecture

Single CSS file (`src/mainview/index.css`) is the source of truth for all design tokens, fonts, custom utilities, and keyframes. No `tailwind.config.ts` — Tailwind v4 CSS-first configuration via `@theme inline`.

| Layer | Technology |
|---|---|
| Tokens | OKLCH CSS variables in `:root` / `.dark`, bridged to Tailwind via `@theme inline` |
| Styling | Tailwind v4 utility classes + `cn()` (clsx + tailwind-merge) |
| Variants | `class-variance-authority` (Button, Badge) |
| Primitives | shadcn/ui pattern — `React.ComponentProps<>`, `data-slot`, `asChild` via Radix Slot |
| Theme | Zustand store + `.dark` class / `data-theme` on `<html>` |
| Icons | `lucide-react` direct imports |
| Animations | CSS keyframes + `tw-animate-css` + `tw-shimmer` |

## Color System

All tokens use OKLCH color space. Components use semantic Tailwind classes (`bg-background`, `text-foreground`, `bg-message-own`), never raw values.

### Semantic Tokens

**Surfaces:**

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(1 0 0)` white | `oklch(0.145 0 0)` near-black |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |

**Interactive:**

| Token | Light | Dark |
|---|---|---|
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` |
| `--secondary` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |

**Chrome:**

| Token | Light | Dark |
|---|---|---|
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` semi-transparent white |
| `--input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` |

**Telegram-specific:**

| Token | Purpose | Light | Dark |
|---|---|---|---|
| `--message-own` | Own message bubble | `oklch(0.93 0.02 250)` blue tint | `oklch(0.25 0.03 250)` |
| `--message-own-hover` | Own message hover | `oklch(0.9 0.03 250)` | `oklch(0.28 0.04 250)` |
| `--message-peer` | Peer message bubble | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--online` | Online indicator | `oklch(0.723 0.191 149.579)` green | same |
| `--unread` | Unread badge | `oklch(0.546 0.245 262.881)` blue | `oklch(0.488 0.243 264.376)` |
| `--accent-blue` | Accent (rename candidate — color in name) | `oklch(0.546 0.245 263)` | `oklch(0.488 0.243 264)` |
| `--accent-blue-subtle` | Accent subtle (rename candidate) | `oklch(0.93 0.02 250)` | `oklch(0.25 0.03 250)` |
| `--forward` | Forward indicator | `oklch(0.723 0.191 149)` green | same |
| `--code-bg` | Code block bg | `oklch(0.95 0 0)` | `oklch(0.22 0 0)` |
| `--error-text` | Error text | `oklch(0.55 0.2 25)` | `oklch(0.75 0.15 22)` |

**Text hierarchy (aliases to Radix sand scale — migration target):**

| Token | Maps to | Usage count |
|---|---|---|
| `--color-text-primary` | `var(--sand-12)` | ~20 |
| `--color-text-secondary` | `var(--sand-11)` | ~8 |
| `--color-text-tertiary` | `var(--sand-10)` | ~30 |
| `--color-text-quaternary` | `var(--sand-9)` | scattered |

### Legacy: Radix Color Scales

`@radix-ui/colors` is still imported for backward compatibility. Current state:

| Scale | Status |
|---|---|
| `sand` / `sand-dark` | Used — powers `text-text-*` aliases, plus 2 raw refs in production (`avatar.tsx`, `ChatSidebar.tsx`) |
| `blue` / `blue-dark` | Used — raw refs in `avatar.tsx` only |
| `red` / `red-dark` | Partially used — `avatar.tsx` only |
| `plum` / `plum-dark` | Used — `avatar.tsx` only |
| `green` / `green-dark` | Partially used — `avatar.tsx` only |
| `gray` / `gray-dark` | **Dead** — zero references |
| `lime` / `lime-dark` | **Dead** — zero references |

Raw Radix color usage in production code is limited to **2 files**: `avatar.tsx` (color palette) and `ChatSidebar.tsx` (1 muted badge, 1 `text-red-500` draft label).

### Color Audit Summary

| Category | Count | Status |
|---|---|---|
| Semantic tokens (theme-aware) | 64 unique | Good |
| Raw Radix palette in production | 7 instances in 2 files | Migrate to semantic tokens |
| Raw Radix palette in dev/demo pages | ~22 instances in 3 files | Acceptable |
| Hardcoded `text-white`/`bg-black` on overlays | ~15 instances | Justified (known-dark surfaces) |
| Raw `oklch()`/`rgb()`/`#hex` in TSX | 0 | Clean |

## Typography

| Family | Role | Tailwind |
|---|---|---|
| **Open Sans** (400, 600) | Primary UI font, body text, messages | `--font-sans` (default) |
| **Geist Mono** (variable 100-900) | Code blocks, monospace elements | `font-mono` |

Body font is set on `<body>` in the CSS base layer. No component explicitly applies `font-sans` — everything inherits.

**Type scale:**

| Role | Size | Weight | Class |
|---|---|---|---|
| Sidebar title | 14px | 700 | `text-sm font-bold` |
| Chat title | 14px | 500 | `text-sm font-medium` |
| Body (messages) | 13px | 400 | `.tg-text-chat` (custom class: `font-size: 13px; line-height: 18px`) |
| Timestamps | 10px | 400 | `text-[10px]` |
| UI labels | 14px | 500 | `text-sm font-medium` |
| Secondary text | 12px | 400 | `text-xs text-muted-foreground` |

Two custom pixel sizes (13px, 10px) exist because Tailwind's scale has no 13px step. These are product decisions, not scale gaps.

## Radius

| Token | Value | Usage |
|---|---|---|
| `--radius` | 10px | Base |
| `--radius-sm` | 6px | Small badges, inline |
| `--radius-md` | 8px | Buttons, inputs |
| `--radius-lg` | 10px | Cards, dialog rows, sidebar items |
| `--radius-xl` | 14px | Large cards |
| `--radius-2xl` | 18px | Message bubbles, composer |
| `--radius-3xl` | 22px | — |
| `--radius-4xl` | 28px | — |

Message bubble radius is computed dynamically in `Bubble.tsx` via `bubbleRadius()` — returns `4px` (grouped) or `12px` (standalone) per corner, applied as inline `style`.

## Shadows

Minimal. Tailwind defaults only.

| Use case | Shadow |
|---|---|
| Popovers, tooltips, dialogs | `shadow-md` |
| Everything else | none or `shadow-xs` |

## Z-Index

Two tiers currently in use:

| Value | Usage |
|---|---|
| `z-10` | Sticky headers, corner buttons, reaction bars |
| `z-50` | Dialogs, popovers, tooltips, error toasts |

## Animation

| Easing | Value | When |
|---|---|---|
| Expo-out | `cubic-bezier(0.16, 1, 0.3, 1)` | UI transitions, custom keyframes |
| Default | Tailwind `ease-out` | Simple hover/color transitions |

| Duration | Usage |
|---|---|
| `duration-75` | Voice waveform bar color |
| `duration-100` | Video scrubber |
| `duration-150` | Message entrance, assistant-ui elements |
| `duration-200` | Spoiler reveal, dialog entrance, most transitions |

**Plugins:**

| Plugin | Status |
|---|---|
| `tw-animate-css` | Used — dialog/popover/tooltip enter/exit |
| `tw-shimmer` | Used — `MessagePanel.tsx`, `tool-fallback.tsx` loading states |
| `tw-glass` | **Dead** — imported but never used in any component |

## Theme Switching

Zustand store (`lib/theme.ts`), not React Context. Three modes: `light`, `dark`, `system`.

- Persists to `localStorage` under key `"theme"`
- Toggles `.dark` class + `data-theme` attribute on `<html>`
- Uses View Transition API for smooth switch (0.4s expo-out)
- Keyboard shortcut: `Cmd+Shift+T`
- Flash prevention: inline script in `index.html` reads `localStorage` before React mounts

## Component Patterns

### Two tiers

| Tier | Location | Pattern |
|---|---|---|
| **Primitives** | `components/ui/` | shadcn — `React.ComponentProps<>`, `cn()`, `data-slot`, `asChild`, CVA |
| **Domain** | `components/ui/chat/` | `Pure*` prefix — explicit typed props, no store, no side effects |

### Integration layer

| Component | Role |
|---|---|
| `Message.tsx` | Connects store to Pure components |
| `MessagePanel.tsx` | List/scroll, passes data to Messages |
| `ChatSidebar.tsx` | Sidebar with store connection |
| `ChatHeader.tsx` | Header with store connection |

### Conventions

- `cn()` for class merging everywhere
- No barrel exports — direct file imports
- `data-slot` on shadcn primitives (not on Pure components)
- `asChild` via Radix `Slot.Root` on Button, Badge

---

# Production Readiness Audit

## Dead Code to Remove

### CSS (`index.css`)

| Item | Lines | Notes |
|---|---|---|
| `.scrollbar-thin` | class + pseudo-element rules | Unused — `.scrollbar-subtle` is the one in use |
| `.shadow-crisp-edge` | class + rules | Never referenced |
| `.animate-fade-blur-in` | class | Never referenced |
| `@keyframes fade-up` | keyframe block | No class uses it |
| `@keyframes fade-blur-in` | keyframe block | Only consumed by dead `.animate-fade-blur-in` |
| `FiraCode Nerd Font` | 3 `@font-face` declarations | Never applied — Open Sans is the actual UI font |
| `@import "@radix-ui/colors/gray.css"` + `gray-dark.css` | imports | Zero references to any `gray-N` class |
| `@import "@radix-ui/colors/lime.css"` + `lime-dark.css` | imports | Zero references to any `lime-N` class |
| `@import "tw-glass"` | import | `glass` class never used |
| `--color-gray-1` through `--color-gray-12` | theme tokens | Dead with gray import |
| `--message-own-foreground` / `--message-peer-foreground` | CSS vars + theme tokens | Defined but never referenced |
| `--spoiler` | CSS var + theme token | Defined but never referenced (FormattedText uses inline logic) |
| `--color-red-3`, `--color-red-12` | theme tokens | Registered, never used |
| `--color-green-10`, `--color-green-11` | theme tokens | Registered, never used |

## Styling Inconsistencies

### P1 — Fix now

| Issue | Location | Problem | Fix |
|---|---|---|---|
| Mixed light/dark token strategy | `ChatSidebar.tsx:704` | `bg-sand-8 dark:bg-unread` — raw Radix in light, semantic in dark | Use semantic token for both modes |
| Bubble radius bypasses Tailwind | `Bubble.tsx:70` | Inline `style` with hardcoded `4px`/`12px` | Define as CSS vars or Tailwind arbitrary values |
| Missing transitions on hover elements | `ChatSidebar.tsx:525,540` | `hover:bg-accent` without `transition-colors`, while adjacent identical elements have it | Add `transition-colors` |
| Mixed px/rem in same element | `Message.tsx:253,402,538` | `h-[18px]` with `w-[5.5rem]` on same element | Pick one unit system |
| Raw Radix in avatar palette | `avatar.tsx:4-8` | `bg-blue-9`, `bg-plum-9`, etc. | Create semantic avatar color tokens |

### P2 — Standardize

| Issue | Location | Problem |
|---|---|---|
| Functional tokens with color in name | `index.css` | `--accent-blue`, `--accent-blue-subtle` — should be `--accent`, `--accent-subtle` since the hue may change |
| 3 hover-opacity levels for same element type | `VoiceView.tsx:318,359`, `attachment.tsx:147` | `hover:opacity-80`, `hover:opacity-90`, `hover:opacity-75` |
| Arbitrary rounded values | `MessageTime.tsx:67-68`, `attachment.tsx:147`, `ChatSidebar.tsx:119` | `rounded-[10px]`, `rounded-[14px]`, `rounded-[3px]` — should map to scale |
| Inconsistent hover backgrounds | Many files | `hover:bg-accent` vs `hover:bg-accent/50` vs `hover:bg-accent/80` for similar elements |
| Non-standard sizes | `VoiceView.tsx:318` | `size-[42px]` — 42px is between Tailwind's 40px and 44px steps |
| `PhotoView` inline filter | `PhotoView.tsx:60,90` | `style={{ filter: 'blur(20px)' }}` could be `blur-[20px]` |
| Input radius inconsistency | Multiple | Search input `rounded-full`, compose `rounded-lg`, generic Input `rounded-md` |

### P3 — Normalize later

| Issue | Location |
|---|---|
| Two Radix import styles | `scroll-area.tsx`, `phone-input.tsx` use `@radix-ui/react-*`; everything else uses unified `radix-ui` |
| `forwardRef` legacy | `scroll-area.tsx`, `phone-input.tsx`, `tooltip-icon-button.tsx` — 4 components still use `forwardRef` |
| `data-slot` missing on older shadcn | `avatar.tsx`, `command.tsx`, `popover.tsx`, `scroll-area.tsx` |
| Boolean prop naming split | `isOutgoing`/`isCircle`/`isGif` vs bare `loading`/`cover`/`sending`/`edited` |

## Accessibility

### P1 — Keyboard + screen reader blockers

| Issue | Location |
|---|---|
| Icon-only buttons without `aria-label` | `CornerButtons.tsx`, `MessageInput.tsx` send button, `ChatSidebar.tsx` clear/close search buttons, `ReactionBar.tsx` "+" trigger |
| `PureCornerButton` doesn't spread `...props` | Callers cannot add `aria-label` even if they wanted to |
| Tab interface without ARIA roles | `ChatSidebar.tsx:572-595` — no `role="tab"`, `aria-selected`, `tablist` |
| Chat list missing accessible names | `ChatSidebar.tsx:612-711` — button per chat, no `aria-label` |
| `SpoilerText` no `aria-expanded` | `FormattedText.tsx` — toggle button with no state communicated |
| Form inputs without `<label>` | `AuthScreen.tsx` — phone and code inputs use placeholder only |

### P2 — Motion and contrast

| Issue | Scope |
|---|---|
| Zero `motion-safe:` prefixes | ~30+ animations play regardless of `prefers-reduced-motion`. Only 1 instance of `motion-reduce:animate-none` exists in the entire codebase. |
| `text-text-quaternary` contrast | Maps to `sand-9` (~`#8D8D86`) — likely fails WCAG AA (4.5:1) for small text on white |
| Opacity-based text on variable backgrounds | `MessageTime.tsx:42` (`text-white/70`), `VideoView.tsx:222` (`text-white/60`) — contrast depends on underlying content |

### P3 — Nice to have

| Issue | Location |
|---|---|
| Missing focus-visible on raw buttons | `ChatSidebar.tsx` (search, tabs, chat list), `ReactionBar.tsx`, `CornerButtons.tsx`, `ChatLayout.tsx` dismiss |
| Chat list keyboard navigation | No arrow-key nav — requires tabbing through every chat item |
| Reaction picker keyboard support | No Escape to close, no arrow-key navigation |
| No large-screen adaptation | No `lg:` or `xl:` breakpoints — chat stretches infinitely on wide displays |

## Component Architecture

### Purity violations

| Component | Location | Issue |
|---|---|---|
| `ThemeSwitcher` | `ui/theme-switcher.tsx` | Lives in `ui/` but imports from `useThemeStore` — should take theme/onToggle as props |
| `MediaLayout`, `BubbleLayout`, `AlbumLayout` | `chat/Message.tsx` | Reach into `useChatStore` for `profilePhotos`/`thumbUrls` instead of receiving via props from `Message` |
| `FormattedText > CustomEmoji` | `chat/FormattedText.tsx` | Inner sub-component imports `useChatStore` — hidden store dependency inside an otherwise pure component |

### Pure components not accepting className

All `Pure*` components except `PureBubble` reject `className`. This is a deliberate pattern (single-purpose atoms), not a bug — but it limits reuse if the same visual is needed with different spacing/sizing in different contexts.

## Recommended Token Additions

### Z-index scale

```css
--z-sticky: 10;
--z-dropdown: 20;
--z-overlay: 40;
--z-modal: 50;
```

### Duration tokens

```css
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
```

### Avatar color palette (to replace raw Radix)

Names are functional (slot-based), not color-based — the actual hues can change without renaming tokens.

```css
--avatar-1: oklch(0.55 0.2 260);
--avatar-2: oklch(0.55 0.2 320);
--avatar-3: oklch(0.65 0.2 150);
--avatar-4: oklch(0.6 0.2 25);
--avatar-5: oklch(0.6 0.05 80);
```

### Text hierarchy (standalone OKLCH, drop Radix aliases)

```css
--color-text-primary: oklch(0.15 0.01 75);
--color-text-secondary: oklch(0.44 0.01 75);
--color-text-tertiary: oklch(0.55 0.01 75);
--color-text-quaternary: oklch(0.65 0.01 75);  /* ensure 4.5:1 contrast on white */
```
