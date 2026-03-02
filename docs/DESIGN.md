# Design System: Premium Telegram Client

> Extracted from [assistant-ui](https://github.com/assistant-ui/assistant-ui) and [tool-ui](https://github.com/assistant-ui/tool-ui) — the gold standard for AI chat interfaces built on Radix/shadcn. Adapted for a **premium, minimalistic Telegram client** targeting developers, PMs, and power users.

## Philosophy

- **Monochrome-first** with selective color accents (blue for owned messages, green for online, red for destructive)
- **Monospace identity** — FiraCode Nerd Font everywhere (our differentiator)
- **OKLCH color space** — perceptually uniform, better dark mode
- **Semantic tokens only** — no hardcoded colors in components
- **Motion is restrained** — 150-300ms for UI, expo-out easing
- **Shadows are minimal** — `shadow-xs` or `shadow-sm`, never heavy
- **Dark mode native** — semi-transparent white borders (`oklch(1 0 0 / 10%)`) instead of solid dark grays

## Reference Repos

| Repo | Path | Focus |
|---|---|---|
| **tool-ui** | `/Users/andrey/Projects/tool-ui` | Component styling, animations, gradient borders, custom utilities |
| **assistant-ui** | `/Users/andrey/Projects/assistant-ui` | Chat primitives, composer, thread layout, glassmorphism, shimmer |

### Key Files to Reference

**tool-ui styling:**
- `app/styles/shadcn-theme.css` — OKLCH color tokens, radius system
- `app/styles/custom-utilities.css` — gradient borders, shadow-crisp-edge, scrollbar, animations
- `app/styles/globals.css` — import chain, base layer
- `components/tool-ui/approval-card/` — card styling pattern
- `components/tool-ui/terminal/` — code/terminal container pattern
- `components/tool-ui/shared/action-buttons.tsx` — responsive action buttons with container queries

**assistant-ui styling:**
- `apps/docs/styles/globals.css` — canonical theme
- `packages/tw-glass/src/index.css` — glassmorphism plugin (SVG displacement)
- `packages/tw-shimmer/src/index.css` — shimmer animation plugin
- `packages/ui/src/components/assistant-ui/thread.tsx` — chat thread layout
- `packages/ui/src/components/assistant-ui/markdown-text.tsx` — markdown rendering
- `packages/ui/src/components/assistant-ui/reasoning.tsx` — collapsible with shimmer

---

## Color System

### Current Problem
We use `@radix-ui/colors` (sand, gray, blue, red, plum, lime, green) which is fine but we reference raw scale numbers (`sand-3`, `blue-9`) directly in components. This creates tight coupling and makes theme switching impossible.

### Target: OKLCH Semantic Tokens

All components MUST use semantic tokens. Direct Radix color references (`sand-3`, `blue-9`) should be migrated to semantic alternatives.

```css
:root {
  --radius: 0.625rem;

  /* Surfaces */
  --background: oklch(1 0 0);           /* app background */
  --foreground: oklch(0.145 0 0);       /* primary text */
  --card: oklch(1 0 0);                 /* card surface */
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);

  /* Interactive */
  --primary: oklch(0.205 0 0);          /* primary buttons */
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);         /* secondary surfaces */
  --secondary-foreground: oklch(0.205 0 0);

  /* Neutral */
  --muted: oklch(0.97 0 0);            /* muted backgrounds */
  --muted-foreground: oklch(0.556 0 0); /* secondary text */
  --accent: oklch(0.97 0 0);           /* hover states */
  --accent-foreground: oklch(0.205 0 0);

  /* Status */
  --destructive: oklch(0.577 0.245 27.325);

  /* Chrome */
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);

  /* Telegram-specific */
  --message-own: oklch(0.93 0.02 250);       /* own message bubble (subtle blue tint) */
  --message-own-foreground: oklch(0.205 0 0);
  --message-peer: oklch(0.97 0 0);           /* peer message bubble */
  --message-peer-foreground: oklch(0.205 0 0);
  --online: oklch(0.723 0.191 149.579);      /* online indicator */
  --unread: oklch(0.546 0.245 262.881);      /* unread badge */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);        /* KEY: semi-transparent white borders */
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);

  --message-own: oklch(0.25 0.03 250);
  --message-own-foreground: oklch(0.985 0 0);
  --message-peer: oklch(0.269 0 0);
  --message-peer-foreground: oklch(0.985 0 0);
  --online: oklch(0.723 0.191 149.579);
  --unread: oklch(0.488 0.243 264.376);
}
```

### Theme Switcher

Add theme switching via `data-theme` attribute on `<html>`:
```css
@custom-variant dark (&:is(.dark *, [data-theme="dark"], [data-theme="dark"] *));
```

Implementation:
- Store theme preference in `localStorage`
- Toggle with keyboard shortcut (Cmd+Shift+T) and UI button
- Support: `light`, `dark`, `system`
- Use View Transition API for smooth theme transitions (see tool-ui `theme-transition.css`)

---

## Typography

Keep FiraCode Nerd Font. The monospace identity is our brand.

| Role | Size | Weight | Class |
|---|---|---|---|
| Sidebar title | 14px | 700 | `text-sm font-bold` |
| Chat title | 14px | 500 | `text-sm font-medium` |
| Body text (messages) | 13px | 400 | `text-[13px] leading-[18px]` |
| Timestamps | 10px | 400 | `text-[10px]` |
| UI labels | 14px | 500 | `text-sm font-medium` |
| Secondary text | 12px | 400 | `text-xs text-muted-foreground` |

---

## Radius System

```
--radius:     0.625rem  (10px base)
--radius-sm:  6px   (small badges, inline elements)
--radius-md:  8px   (buttons, inputs)
--radius-lg:  10px  (cards, containers)
--radius-xl:  14px  (large cards)
--radius-2xl: 18px  (message bubbles, composer)
--radius-3xl: 22px  (viewport footer curve)
```

| Element | Radius |
|---|---|
| Message bubbles | `rounded-2xl` (18px) |
| Composer input | `rounded-2xl` (18px) |
| Cards/containers | `rounded-xl` (14px) |
| Buttons (default) | `rounded-md` (8px) |
| Action buttons (pills) | `rounded-full` |
| Unread badge | `rounded-full` |
| Dialog rows | `rounded-lg` (10px) |

---

## Shadows

Minimal. Reference: tool-ui uses `shadow-xs` everywhere.

| Use Case | Shadow |
|---|---|
| Cards | `shadow-xs` |
| Popovers/Dropdowns | `shadow-md` |
| Floating action bars | `shadow-sm` + `border` |
| Error toasts | `shadow-md` |
| Everything else | none |

### Premium Shadow (from tool-ui)
For special elevated cards:
```css
.shadow-crisp-edge {
  box-shadow:
    0px 1px 0px -1px oklch(0 0 0 / 0.1),
    0px 1px 1px -1px oklch(0 0 0 / 0.1),
    0px 1px 2px -1px oklch(0 0 0 / 0.1),
    0px 2px 4px -2px oklch(0 0 0 / 0.1),
    0px 3px 6px -3px oklch(0 0 0 / 0.1);
  /* + inset highlight via ::after */
}
```

---

## Animation System

### Easing
- **Standard (UI)**: `ease-out` or `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out)
- **Bouncy entrance**: `cubic-bezier(0.62, -0.05, 0.71, 1.15)`
- **Never**: linear (except infinite loops like shimmer)

### Durations
- Micro-interactions: `150ms`
- Message entrance: `150ms`
- Collapsible expand/collapse: `200ms`
- Welcome screen stagger: `200ms` base + `75ms` delay
- Theme transition: `600ms`

### Standard Animations (from tool-ui/assistant-ui)

```css
/* Message entrance */
fade-in slide-in-from-bottom-1 animate-in duration-150

/* Card entrance (approval/receipt) */
motion-safe:animate-in motion-safe:fade-in motion-safe:blur-in-sm motion-safe:zoom-in-95 motion-safe:duration-300

/* Fade up (subtle) */
@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Fade blur in (premium feel) */
@keyframes fade-blur-in {
  from { opacity: 0; transform: translateY(4px); filter: blur(4px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

/* Collapsible */
@keyframes collapsible-down {
  from { height: 0; }
  to { height: var(--radix-collapsible-content-height); }
}
```

### Always Use `motion-safe:` Prefix
Respect `prefers-reduced-motion`. All animations must be wrapped in `motion-safe:`.

---

## Component Patterns

### Message Bubble

**Current:** `max-w-[55%] rounded-lg px-3 py-1.5 bg-blue-3 | bg-sand-3`
**Target:** `max-w-[55%] rounded-2xl px-4 py-2.5 bg-message-own | bg-message-peer`

Reference: assistant-ui user message bubble is `rounded-2xl bg-muted px-4 py-2.5`

### Sidebar Dialog Row

**Target pattern (from assistant-ui thread-list):**
```
h-16 flex items-center gap-3 px-4 rounded-lg transition-colors
hover:bg-accent
data-active:bg-accent
```
- Add `rounded-lg` for rounded selection highlight (not full-bleed)
- Add entrance animation for new dialogs

### Composer Input

**Target (from assistant-ui):**
```
rounded-2xl border border-input bg-background px-1 pt-2
transition-shadow
has-[textarea:focus-visible]:border-ring
has-[textarea:focus-visible]:ring-2
has-[textarea:focus-visible]:ring-ring/20
```
- Outer container gets the border and focus ring
- Inner textarea: `bg-transparent outline-none resize-none`
- Send button: `size-8 rounded-full` (circle)

### Chat Header

**Target:**
- Subtle bottom border: `border-b border-border`
- Backdrop blur for scroll-under: `backdrop-blur-sm bg-background/80`
- Status text: `text-muted-foreground text-xs`

### Scrollbar

**Target (from tool-ui):**
```css
.scrollbar-subtle {
  scrollbar-width: thin;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background-color: oklch(0.58 0 0 / 0.2);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: oklch(0.58 0 0 / 0.35);
  }
}
```

### Gradient Fade (Collapsed Content)

For any expandable/collapsible content:
```
from-background absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent pointer-events-none
```

---

## Focus States (Universal)

All interactive elements:
```
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

Error/invalid:
```
aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
```

Disabled:
```
disabled:pointer-events-none disabled:opacity-50
```

---

## Packages to Install

```
tw-glass          — glassmorphism effects (SVG displacement + blur)
tw-shimmer        — shimmer text/background animation
tw-animate-css    — animation utilities (already have)
```

### tw-glass Usage (Premium Effects)
For composer area, floating panels, header blur:
```html
<div class="glass glass-surface glass-strength-10">
  <!-- frosted glass panel -->
</div>
```

### tw-shimmer Usage
For streaming/loading states:
```html
<span class="shimmer">Thinking...</span>         <!-- text shimmer -->
<div class="shimmer shimmer-bg">Loading</div>     <!-- background shimmer -->
```

---

## Skills to Use During Implementation

| Skill | Use For |
|---|---|
| `frontend-design` | Creating distinctive, production-grade interfaces |
| `vercel-react-best-practices` | React/Next.js performance optimization |
| `vercel-composition-patterns` | Component architecture and composition |
| `agentation` | Dev toolbar for visual feedback |

---

## Tailwind v4 Upgrade

Current: `"tailwindcss": "4"` (resolves to 4.0.x)
Target: `"tailwindcss": "^4.2.1"` (matches assistant-ui/tool-ui)

### Tailwind v4.1+ Performance Improvements
- **Oxide engine**: Native Rust-based scanner (2-5x faster builds)
- **@property support**: Proper CSS custom property types
- **Container queries**: Built-in `@container` support without plugin
- **has() selector**: Native CSS `:has()` (used for composer focus ring pattern)

---

## Migration Checklist

### Phase 1: Foundation
1. Upgrade Tailwind to `^4.2.1`
2. Install `tw-glass` and `tw-shimmer`
3. Migrate color system from Radix scales to OKLCH semantic tokens
4. Add `--message-own`, `--message-peer`, `--online`, `--unread` tokens
5. Add dark mode with `data-theme` attribute support
6. Add theme switcher (light/dark/system) with View Transition API
7. Update base layer (`@layer base`) to match tool-ui pattern

### Phase 2: Core Components
8. Update Button — add `homeCTA` variant (rounded-full pill)
9. Update MessageBubble — `rounded-2xl`, semantic colors, entrance animation
10. Update Composer — container border + inner transparent textarea, circle send button
11. Update ChatSidebar — rounded dialog rows, better hover/active states
12. Update ChatHeader — backdrop blur, cleaner typography
13. Add scrollbar-subtle utility
14. Add gradient fade for expandable content

### Phase 3: Polish
15. Add `shadow-crisp-edge` utility for elevated cards
16. Add gradient border utilities from tool-ui
17. Add shimmer for loading states (typing indicator, message loading)
18. Add glass effects for floating panels (command palette, popovers)
19. Add motion-safe entrance animations to messages
20. Add container queries for responsive action layouts

### Phase 4: Theme System
21. Implement theme provider with localStorage persistence
22. Add Cmd+Shift+T shortcut for theme toggle
23. Add View Transition API for smooth theme switch
24. Test all components in both light and dark mode

---

## Component Migration Map

| Component | Current Issues | Target |
|---|---|---|
| `MessageBubble` | Raw `bg-blue-3`/`bg-sand-3`, `rounded-lg` | Semantic `bg-message-own`/`bg-message-peer`, `rounded-2xl`, entrance animation |
| `ChatSidebar` | Raw `border-sand-6`, no row rounding | Semantic `border-border`, `rounded-lg` rows, `hover:bg-accent` |
| `ChatHeader` | Raw `border-sand-6`, no blur | `border-border`, `backdrop-blur-sm bg-background/80` |
| `MessageInput` | Raw `border-sand-6 bg-sand-2`, basic focus | Container pattern with ring, `rounded-2xl`, circle send |
| `ChatLayout` | Raw `bg-background` only | Theme-aware, error toast upgrade |
| Dialog tabs | Raw `border-blue-9 text-blue-11` | Semantic active state, better animation |
| Unread badge | Raw `bg-blue-9` | `bg-unread rounded-full`, better sizing |
| Error toast | Raw `bg-red-3 text-red-11` | `bg-destructive/10 text-destructive border border-destructive`, `rounded-lg` |
| Scrollbar | Basic `.scrollbar-thin` | Premium `.scrollbar-subtle` with warm-tinted transparent colors |
