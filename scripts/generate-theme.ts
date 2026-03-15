/**
 * Generate a complete Kurier theme from a few seed colors.
 *
 * Multi-constraint solver: each token is solved against ALL surfaces it appears
 * on simultaneously, picking the lightness that satisfies the tightest APCA
 * constraint. Solves in topological order (DAG, not iterative):
 *
 *   Phase 1: bg (anchor)
 *   Phase 2: surfaces (each solved against bg only)
 *   Phase 3: foregrounds (solved against ALL constraint surfaces)
 *   Phase 4: on-X foregrounds (solved against their parent token)
 *
 * Usage:
 *   bun run scripts/generate-theme.ts
 *
 * To create a new theme, add a new entry to THEMES below and run.
 */

import { apcach, apcachToCss, calcContrast, crToBg } from 'apcach';

// ── Theme definitions ──
// Add new themes here. All colors in oklch.
const THEMES = {
  catppuccin: {
    name: 'catppuccin',
    light: {
      bg: 'oklch(0.956 0.01 265)', // Latte base
      neutralHue: 265,
      neutralChroma: 0.02,
      accent: 'oklch(0.452 0.24 264)', // Latte blue
      accentSubtleChroma: 0.04,
      destructive: 'oklch(0.532 0.24 25)', // Latte red
      online: 'oklch(0.59 0.19 145)', // Latte green
      avatarHues: [264, 310, 145, 55, 192],
    },
    dark: {
      bg: 'oklch(0.254 0.015 275)', // Mocha base
      neutralHue: 275,
      neutralChroma: 0.02,
      accent: 'oklch(0.706 0.135 264)', // Mocha blue
      accentSubtleChroma: 0.04,
      destructive: 'oklch(0.714 0.14 15)', // Mocha red
      online: 'oklch(0.82 0.14 145)', // Mocha green
      avatarHues: [264, 310, 145, 55, 192],
    },
    layout: {
      radius: '0.75rem',
      radius2xl: '1.125rem',
      radius3xl: '1.375rem',
      radius4xl: '1.75rem',
      bubbleRSm: '6px',
      bubbleRLg: '14px',
    },
  },
} as const;

// ── Types ──

interface FlavorInput {
  bg: string;
  neutralHue: number;
  neutralChroma: number;
  accent: string;
  accentSubtleChroma: number;
  destructive: string;
  online: string;
  avatarHues: readonly number[];
}

interface Constraint {
  against: string; // token name of the background surface
  minContrast: number;
}

// ── Constraint graph ──
// Each foreground token declares ALL surfaces it must be readable on,
// with minimum APCA contrast for each.

const FOREGROUND_CONSTRAINTS: Record<string, Constraint[]> = {
  foreground: [{ against: 'background', minContrast: 90 }],
  textPrimary: [
    { against: 'background', minContrast: 85 },
    { against: 'card', minContrast: 65 },
    { against: 'messageOwn', minContrast: 60 },
    { against: 'messagePeer', minContrast: 60 },
  ],
  textSecondary: [
    { against: 'background', minContrast: 60 },
    { against: 'card', minContrast: 50 },
    { against: 'messageOwn', minContrast: 45 },
    { against: 'messagePeer', minContrast: 45 },
  ],
  textTertiary: [
    { against: 'background', minContrast: 45 },
    { against: 'card', minContrast: 35 },
    { against: 'messageOwn', minContrast: 30 },
    { against: 'messagePeer', minContrast: 30 },
  ],
  textQuaternary: [{ against: 'background', minContrast: 30 }],
  mutedForeground: [
    { against: 'background', minContrast: 50 },
    { against: 'card', minContrast: 40 },
  ],
  primary: [{ against: 'background', minContrast: 85 }],
  ring: [{ against: 'background', minContrast: 35 }],
  badgeMuted: [{ against: 'background', minContrast: 35 }],
};

// ── Helpers ──

function gen(
  bg: string,
  contrast: number,
  hue: number,
  chroma: number,
  dir: 'lighter' | 'darker' | 'auto' = 'auto',
): string {
  try {
    const c = apcach(crToBg(bg, contrast, 'apca', dir), chroma, hue, 100, 'srgb');
    return apcachToCss(c, 'oklch');
  } catch {
    return bg; // fallback
  }
}

function getContrast(fg: string, bg: string): number {
  return Math.abs(calcContrast(fg, bg, 'apca', 'srgb'));
}

/**
 * Solve for a foreground color that satisfies ALL constraints simultaneously.
 *
 * Strategy: for each constraint surface, compute the contrast we'd get if we
 * solved against that surface at the required minimum. The surface that demands
 * the HIGHEST effective contrast against bg is the tightest constraint.
 * We then solve against THAT surface.
 *
 * If we can't find a surface-based solution, we fall back to solving against bg
 * with the maximum required contrast bumped up.
 */
function solveMultiConstraint(
  surfaces: Record<string, string>,
  constraints: Constraint[],
  hue: number,
  chroma: number,
  dir: 'lighter' | 'darker',
): string {
  if (constraints.length === 0) {
    return gen(surfaces.background, 50, hue, chroma, dir);
  }

  // Single constraint — simple case
  if (constraints.length === 1) {
    const c = constraints[0];
    const bgSurface = surfaces[c.against];
    return gen(bgSurface, c.minContrast, hue, chroma, dir);
  }

  // Multi-constraint: try solving against each surface, pick the candidate
  // that satisfies ALL constraints. Among valid candidates, prefer the one
  // with the least extreme lightness (closest to midpoint).
  type Candidate = { color: string; worstMargin: number };
  let bestCandidate: Candidate | null = null;

  for (const constraint of constraints) {
    const bgSurface = surfaces[constraint.against];
    const candidate = gen(bgSurface, constraint.minContrast, hue, chroma, dir);

    // Check this candidate against ALL constraints
    let worstMargin = Infinity;
    let satisfiesAll = true;

    for (const check of constraints) {
      const checkBg = surfaces[check.against];
      const actualContrast = getContrast(candidate, checkBg);
      const margin = actualContrast - check.minContrast;
      if (margin < -0.5) {
        // small tolerance
        satisfiesAll = false;
        break;
      }
      worstMargin = Math.min(worstMargin, margin);
    }

    if (satisfiesAll) {
      // Prefer the candidate with the best (highest) worst-margin — most balanced
      if (!bestCandidate || worstMargin > bestCandidate.worstMargin) {
        bestCandidate = { color: candidate, worstMargin };
      }
    }
  }

  if (bestCandidate) {
    return bestCandidate.color;
  }

  // Fallback: find the tightest constraint by trying progressively higher
  // contrast values against bg until all constraints pass.
  // Start from the max required contrast and increment.
  const maxRequired = Math.max(...constraints.map((c) => c.minContrast));
  for (let boost = 0; boost <= 15; boost += 1) {
    const candidate = gen(surfaces.background, maxRequired + boost, hue, chroma, dir);
    let satisfiesAll = true;

    for (const check of constraints) {
      const checkBg = surfaces[check.against];
      const actualContrast = getContrast(candidate, checkBg);
      if (actualContrast < check.minContrast - 0.5) {
        satisfiesAll = false;
        break;
      }
    }

    if (satisfiesAll) return candidate;
  }

  // Last resort: solve against bg with max contrast
  console.log(
    `  ! Could not satisfy all constraints for hue=${hue} chroma=${chroma}, using max contrast fallback`,
  );
  return gen(surfaces.background, Math.min(maxRequired + 10, 100), hue, chroma, dir);
}

// ── Generator ──

function generateFlavor(input: FlavorInput) {
  const {
    bg,
    neutralHue: h,
    neutralChroma: nc,
    accent,
    accentSubtleChroma: _asc,
    destructive,
    online,
    avatarHues,
  } = input;

  // Determine light/dark mode from bg lightness
  const bgLightness = parseFloat(bg.match(/oklch\(([\d.]+)/)?.[1] ?? '0.5');
  const isLight = bgLightness > 0.5;
  const surfaceDir: 'lighter' | 'darker' = isLight ? 'darker' : 'lighter';
  const textDir: 'lighter' | 'darker' = isLight ? 'darker' : 'lighter';

  const accentHue = parseFloat(accent.match(/(\d+)\s*\)$/)?.[1] ?? '264');

  // ═══════════════════════════════════════════════════════════════════
  // Phase 1: Background (anchor)
  // ═══════════════════════════════════════════════════════════════════

  // bg is the anchor — given directly.

  // ═══════════════════════════════════════════════════════════════════
  // Phase 2: Surfaces (each solved against bg only)
  // ═══════════════════════════════════════════════════════════════════

  const card = gen(bg, 8, h, nc, surfaceDir);
  const popover = gen(bg, 12, h, nc, surfaceDir);
  const secondary = gen(bg, 10, h, nc, surfaceDir);
  const muted = gen(bg, 10, h, nc, surfaceDir);
  const accentSurface = gen(bg, 10, h, nc, surfaceDir);
  const border = gen(bg, 18, h, nc, surfaceDir);
  const input_ = gen(bg, 15, h, nc, surfaceDir);
  const messageOwn = gen(bg, 15, accentHue, 0.08, surfaceDir);
  const messageOwnHov = gen(bg, 20, accentHue, 0.1, surfaceDir);
  const messagePeer = gen(bg, 10, h, nc, surfaceDir);
  const accentBrandSub = gen(bg, 12, accentHue, 0.06, surfaceDir);
  const codeBg = gen(bg, 8, h, nc, surfaceDir);

  // Build resolved surfaces map for constraint lookups
  const surfaces: Record<string, string> = {
    background: bg,
    card,
    popover,
    secondary,
    muted,
    accent: accentSurface,
    border,
    input: input_,
    messageOwn,
    messageOwnHover: messageOwnHov,
    messagePeer,
    accentBrandSubtle: accentBrandSub,
    codeBg,
  };

  // ═══════════════════════════════════════════════════════════════════
  // Phase 3: Foregrounds (multi-constraint solve)
  // ═══════════════════════════════════════════════════════════════════

  const foreground = solveMultiConstraint(
    surfaces,
    FOREGROUND_CONSTRAINTS.foreground,
    h,
    nc,
    textDir,
  );
  const textPrimary = solveMultiConstraint(
    surfaces,
    FOREGROUND_CONSTRAINTS.textPrimary,
    h,
    nc,
    textDir,
  );
  const textSecondary = solveMultiConstraint(
    surfaces,
    FOREGROUND_CONSTRAINTS.textSecondary,
    h,
    nc,
    textDir,
  );
  const textTertiary = solveMultiConstraint(
    surfaces,
    FOREGROUND_CONSTRAINTS.textTertiary,
    h,
    nc,
    textDir,
  );
  const textQuaternary = solveMultiConstraint(
    surfaces,
    FOREGROUND_CONSTRAINTS.textQuaternary,
    h,
    nc,
    textDir,
  );
  const mutedFg = solveMultiConstraint(
    surfaces,
    FOREGROUND_CONSTRAINTS.mutedForeground,
    h,
    nc,
    textDir,
  );
  const primary = solveMultiConstraint(surfaces, FOREGROUND_CONSTRAINTS.primary, h, nc, textDir);
  const ring = solveMultiConstraint(surfaces, FOREGROUND_CONSTRAINTS.ring, h, nc, textDir);
  const badgeMuted = solveMultiConstraint(
    surfaces,
    FOREGROUND_CONSTRAINTS.badgeMuted,
    h,
    nc,
    textDir,
  );

  // Accent colors — passthrough (seed colors), but verify contrast against bg
  // These are solved against bg with minimum contrast requirements
  const unread = accent;
  const accentBrand = accent;
  const draft = destructive;
  const errorText = destructive;
  const forward = online;

  // Avatars — solve against bg
  const avatars = avatarHues.map((ah) => gen(bg, 35, ah, 0.17, textDir));

  // ═══════════════════════════════════════════════════════════════════
  // Phase 4: On-X foregrounds (solved against their parent token)
  // ═══════════════════════════════════════════════════════════════════

  const primaryFg = gen(primary, 80, h, nc, isLight ? 'lighter' : 'darker');
  const cardFg = gen(card, 85, h, nc, textDir);
  const popoverFg = gen(popover, 85, h, nc, textDir);
  const secondFg = gen(secondary, 75, h, nc, textDir);
  const accentFg = gen(accentSurface, 75, h, nc, textDir);
  const destructiveFg = bg; // Use bg color for destructive buttons

  // ── Palette ramps (unchanged from original) ──
  const sandRamp = Array.from({ length: 12 }, (_, i) => {
    const contrast = 5 + i * 8;
    return gen(bg, Math.min(contrast, 90), h, nc, surfaceDir);
  });

  const blueRamp = Array.from({ length: 12 }, (_, i) => {
    const contrast = 5 + i * 8;
    return gen(bg, Math.min(contrast, 90), accentHue, 0.15, surfaceDir);
  });

  // ── Verification (built into generation) ──
  let allPass = true;
  const verify = (label: string, fg: string, bgColor: string, min: number) => {
    const cr = getContrast(fg, bgColor);
    if (cr < min - 0.5) {
      console.log(`  ! ${label}: APCA ${cr.toFixed(1)} < ${min}`);
      allPass = false;
    }
  };

  // Verify all multi-constraint tokens
  for (const [tokenName, constraints] of Object.entries(FOREGROUND_CONSTRAINTS)) {
    const tokenValue = {
      foreground,
      textPrimary,
      textSecondary,
      textTertiary,
      textQuaternary,
      mutedForeground: mutedFg,
      primary,
      ring,
      badgeMuted,
    }[tokenName];
    if (!tokenValue) continue;

    for (const c of constraints) {
      const bgSurface = surfaces[c.against];
      verify(`${tokenName} on ${c.against}`, tokenValue, bgSurface, c.minContrast);
    }
  }

  // Verify accent colors against bg
  verify('accent on bg', accentBrand, bg, 30);
  verify('destructive on bg', destructive, bg, 35);
  verify('online on bg', online, bg, 30);
  verify('border vs bg', border, bg, 12);

  // Verify on-X foregrounds
  verify('primaryFg on primary', primaryFg, primary, 75);
  verify('cardFg on card', cardFg, card, 80);
  verify('popoverFg on popover', popoverFg, popover, 80);

  if (allPass) console.log('  All checks pass');

  return {
    background: bg,
    foreground,
    card,
    cardForeground: cardFg,
    popover,
    popoverForeground: popoverFg,
    primary,
    primaryForeground: primaryFg,
    secondary,
    secondaryForeground: secondFg,
    muted,
    mutedForeground: mutedFg,
    accent: accentSurface,
    accentForeground: accentFg,
    destructive,
    destructiveForeground: destructiveFg,
    border,
    input: input_,
    ring,
    messageOwn,
    messageOwnHover: messageOwnHov,
    messagePeer,
    online,
    unread,
    accentBrand,
    accentBrandSubtle: accentBrandSub,
    forward,
    codeBg,
    errorText,
    avatar1: avatars[0],
    avatar2: avatars[1],
    avatar3: avatars[2],
    avatar4: avatars[3],
    avatar5: avatars[4],
    draft,
    badgeMuted,
    textPrimary,
    textSecondary,
    textTertiary,
    textQuaternary,
    sandRamp,
    blueRamp,
    paletteRed9: destructive,
    paletteRed11: gen(
      bg,
      55,
      parseFloat(destructive.match(/(\d+)\s*\)$/)?.[1] ?? '25'),
      0.18,
      textDir,
    ),
    palettePlum9: gen(bg, 40, 310, 0.2, textDir),
    paletteGreen9: online,
  };
}

// ── CSS output ──

function camelToVar(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function renderTokens(tokens: ReturnType<typeof generateFlavor>, indent = '  '): string {
  const keys = [
    'background',
    'foreground',
    'card',
    'cardForeground',
    'popover',
    'popoverForeground',
    'primary',
    'primaryForeground',
    'secondary',
    'secondaryForeground',
    'muted',
    'mutedForeground',
    'accent',
    'accentForeground',
    'destructive',
    'destructiveForeground',
    'border',
    'input',
    'ring',
    'messageOwn',
    'messageOwnHover',
    'messagePeer',
    'online',
    'unread',
    'accentBrand',
    'accentBrandSubtle',
    'forward',
    'codeBg',
    'errorText',
    'avatar1',
    'avatar2',
    'avatar3',
    'avatar4',
    'avatar5',
    'draft',
    'badgeMuted',
    'textPrimary',
    'textSecondary',
    'textTertiary',
    'textQuaternary',
  ];

  // biome-ignore lint/suspicious/noExplicitAny: keys are a known subset of token properties
  const lines = keys.map((k) => `${indent}--${camelToVar(k)}: ${(tokens as any)[k]};`);

  // Palette ramps
  lines.push('');
  for (const [i, v] of tokens.sandRamp.entries()) {
    lines.push(`${indent}--palette-sand-${i + 1}: ${v};`);
  }
  lines.push('');
  for (const [i, v] of tokens.blueRamp.entries()) {
    lines.push(`${indent}--palette-blue-${i + 1}: ${v};`);
  }
  lines.push('');
  lines.push(`${indent}--palette-red-9: ${tokens.paletteRed9};`);
  lines.push(`${indent}--palette-red-11: ${tokens.paletteRed11};`);
  lines.push(`${indent}--palette-plum-9: ${tokens.palettePlum9};`);
  lines.push(`${indent}--palette-green-9: ${tokens.paletteGreen9};`);

  return lines.join('\n');
}

// ── Generate all themes ──
for (const [id, theme] of Object.entries(THEMES)) {
  const lightTokens = generateFlavor(theme.light);
  const darkTokens = generateFlavor(theme.dark);

  const { layout } = theme;

  const css = `/*
 * ${theme.name} theme — auto-generated (multi-constraint solver)
 *
 * Regenerate: bun run scripts/generate-theme.ts
 */

[data-color-theme="${id}"] {
  /* Typography */
  --theme-font-sans: "Open Sans", ui-sans-serif, system-ui, sans-serif;
  --theme-font-mono: "Geist Mono", ui-monospace, SFMono-Regular, monospace;

  /* Layout */
  --radius: ${layout.radius};
  --theme-radius-2xl: ${layout.radius2xl};
  --theme-radius-3xl: ${layout.radius3xl};
  --theme-radius-4xl: ${layout.radius4xl};
  --bubble-r-sm: ${layout.bubbleRSm};
  --bubble-r-lg: ${layout.bubbleRLg};

  /* Light mode */
${renderTokens(lightTokens)}
}

[data-color-theme="${id}"].dark {
  /* Dark mode */
${renderTokens(darkTokens)}
}
`;

  const path = `apps/app/src/mainview/themes/${id}.css`;
  await Bun.write(path, css);
  console.log(`\nWritten ${path}`);
}
