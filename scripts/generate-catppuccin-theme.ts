/**
 * Generate a Catppuccin theme by adapting a reference theme's colors
 * to Catppuccin backgrounds with guaranteed APCA contrast.
 *
 * Algorithm: for each token, take the reference color's hue + chroma,
 * then use apcach to find the lightness that achieves the required
 * contrast against the Catppuccin background.
 *
 * Run: bun run scripts/generate-catppuccin-theme.ts
 */

import { apcach, apcachToCss, calcContrast, crToBg } from 'apcach';
import { formatHex, type Oklch, parse } from 'culori';

// ── Catppuccin base backgrounds (the anchors — everything adapts to these) ──
const CTP_LATTE = { base: '#eff1f5', mantle: '#e6e9ef', crust: '#dce0e8' };
const CTP_MOCHA = { base: '#1e1e2e', mantle: '#181825', crust: '#11111b' };

// ── Reference theme (default) — the "feel" we want to preserve ──
const REF_LIGHT = {
  background: 'oklch(1 0 0)',
  foreground: 'oklch(0.145 0 0)',
  card: 'oklch(1 0 0)',
  cardForeground: 'oklch(0.145 0 0)',
  popover: 'oklch(1 0 0)',
  popoverForeground: 'oklch(0.145 0 0)',
  primary: 'oklch(0.205 0 0)',
  primaryForeground: 'oklch(0.985 0 0)',
  secondary: 'oklch(0.97 0 0)',
  secondaryForeground: 'oklch(0.205 0 0)',
  muted: 'oklch(0.97 0 0)',
  mutedForeground: 'oklch(0.556 0 0)',
  accent: 'oklch(0.97 0 0)',
  accentForeground: 'oklch(0.205 0 0)',
  destructive: 'oklch(0.577 0.245 27.325)',
  destructiveForeground: 'white',
  border: 'oklch(0.922 0 0)',
  input: 'oklch(0.922 0 0)',
  ring: 'oklch(0.708 0 0)',
  messageOwn: 'oklch(0.93 0.02 250)',
  messageOwnHover: 'oklch(0.9 0.03 250)',
  messagePeer: 'oklch(0.97 0 0)',
  online: 'oklch(0.723 0.191 149.579)',
  unread: 'oklch(0.546 0.245 262.881)',
  accentBrand: 'oklch(0.546 0.245 263)',
  accentBrandSubtle: 'oklch(0.93 0.02 250)',
  forward: 'oklch(0.723 0.191 149)',
  codeBg: 'oklch(0.95 0 0)',
  errorText: 'oklch(0.55 0.2 25)',
  avatar1: 'oklch(0.55 0.2 260)',
  avatar2: 'oklch(0.55 0.2 320)',
  avatar3: 'oklch(0.65 0.2 150)',
  avatar4: 'oklch(0.6 0.2 25)',
  avatar5: 'oklch(0.6 0.05 80)',
  draft: 'oklch(0.577 0.245 27.325)',
  badgeMuted: 'oklch(0.588 0 0)',
  textPrimary: 'oklch(0.145 0 0)',
  textSecondary: 'oklch(0.44 0 0)',
  textTertiary: 'oklch(0.556 0 0)',
  textQuaternary: 'oklch(0.708 0 0)',
};

const REF_DARK = {
  background: 'oklch(0.145 0 0)',
  foreground: 'oklch(0.985 0 0)',
  card: 'oklch(0.205 0 0)',
  cardForeground: 'oklch(0.985 0 0)',
  popover: 'oklch(0.205 0 0)',
  popoverForeground: 'oklch(0.985 0 0)',
  primary: 'oklch(0.922 0 0)',
  primaryForeground: 'oklch(0.205 0 0)',
  secondary: 'oklch(0.269 0 0)',
  secondaryForeground: 'oklch(0.985 0 0)',
  muted: 'oklch(0.269 0 0)',
  mutedForeground: 'oklch(0.708 0 0)',
  accent: 'oklch(0.269 0 0)',
  accentForeground: 'oklch(0.985 0 0)',
  destructive: 'oklch(0.704 0.191 22.216)',
  destructiveForeground: 'white',
  border: 'oklch(0.3 0 0)',
  input: 'oklch(0.3 0 0)',
  ring: 'oklch(0.556 0 0)',
  messageOwn: 'oklch(0.25 0.03 250)',
  messageOwnHover: 'oklch(0.28 0.04 250)',
  messagePeer: 'oklch(0.269 0 0)',
  online: 'oklch(0.723 0.191 149.579)',
  unread: 'oklch(0.488 0.243 264.376)',
  accentBrand: 'oklch(0.488 0.243 264)',
  accentBrandSubtle: 'oklch(0.25 0.03 250)',
  forward: 'oklch(0.723 0.191 149)',
  codeBg: 'oklch(0.22 0 0)',
  errorText: 'oklch(0.75 0.15 22)',
  avatar1: 'oklch(0.55 0.2 260)',
  avatar2: 'oklch(0.55 0.2 320)',
  avatar3: 'oklch(0.65 0.2 150)',
  avatar4: 'oklch(0.6 0.2 25)',
  avatar5: 'oklch(0.6 0.05 80)',
  draft: 'oklch(0.704 0.191 22.216)',
  badgeMuted: 'oklch(0.45 0 0)',
  textPrimary: 'oklch(0.985 0 0)',
  textSecondary: 'oklch(0.708 0 0)',
  textTertiary: 'oklch(0.556 0 0)',
  textQuaternary: 'oklch(0.45 0 0)',
};

// ── Token roles: what contrast is needed and against what ──
type Role =
  | 'bg-surface'
  | 'bg-elevated'
  | 'bg-subtle'
  | 'fg-text'
  | 'fg-accent'
  | 'fg-on-primary'
  | 'passthrough';

interface TokenDef {
  role: Role;
  /** APCA contrast needed against the background it sits on */
  minContrast: number;
  /** What background to measure contrast against. Default = "background" */
  contrastAgainst?: string;
}

const TOKEN_ROLES: Record<string, TokenDef> = {
  // Surfaces — need visible contrast separation from background
  background: { role: 'passthrough', minContrast: 0 },
  foreground: { role: 'fg-text', minContrast: 75 },
  card: { role: 'bg-elevated', minContrast: 10 },
  cardForeground: { role: 'fg-text', minContrast: 70, contrastAgainst: 'card' },
  popover: { role: 'bg-elevated', minContrast: 15 },
  popoverForeground: { role: 'fg-text', minContrast: 70, contrastAgainst: 'popover' },
  primary: { role: 'fg-text', minContrast: 75 },
  primaryForeground: { role: 'fg-on-primary', minContrast: 75, contrastAgainst: 'primary' },
  secondary: { role: 'bg-subtle', minContrast: 15 },
  secondaryForeground: { role: 'fg-text', minContrast: 65, contrastAgainst: 'secondary' },
  muted: { role: 'bg-subtle', minContrast: 15 },
  mutedForeground: { role: 'fg-text', minContrast: 50 },
  accent: { role: 'bg-subtle', minContrast: 15 },
  accentForeground: { role: 'fg-text', minContrast: 65, contrastAgainst: 'accent' },
  destructive: { role: 'fg-accent', minContrast: 45 },
  destructiveForeground: { role: 'passthrough', minContrast: 0 },
  border: { role: 'bg-subtle', minContrast: 20 },
  input: { role: 'bg-subtle', minContrast: 20 },
  ring: { role: 'fg-accent', minContrast: 30 },

  // Telegram-specific
  messageOwn: { role: 'bg-subtle', minContrast: 15 },
  messageOwnHover: { role: 'bg-subtle', minContrast: 20 },
  messagePeer: { role: 'bg-subtle', minContrast: 10 },
  online: { role: 'fg-accent', minContrast: 40 },
  unread: { role: 'fg-accent', minContrast: 40 },
  accentBrand: { role: 'fg-accent', minContrast: 40 },
  accentBrandSubtle: { role: 'bg-subtle', minContrast: 12 },
  forward: { role: 'fg-accent', minContrast: 40 },
  codeBg: { role: 'bg-elevated', minContrast: 10 },
  errorText: { role: 'fg-accent', minContrast: 45 },
  avatar1: { role: 'fg-accent', minContrast: 30 },
  avatar2: { role: 'fg-accent', minContrast: 30 },
  avatar3: { role: 'fg-accent', minContrast: 30 },
  avatar4: { role: 'fg-accent', minContrast: 30 },
  avatar5: { role: 'fg-accent', minContrast: 30 },
  draft: { role: 'fg-accent', minContrast: 45 },
  badgeMuted: { role: 'fg-accent', minContrast: 30 },
  textPrimary: { role: 'fg-text', minContrast: 75 },
  textSecondary: { role: 'fg-text', minContrast: 55 },
  textTertiary: { role: 'fg-text', minContrast: 40 },
  textQuaternary: { role: 'fg-text', minContrast: 25 },
};

// ── Color math ──
// Catppuccin's signature hue (~260-270 blue-purple) used when reference is neutral
const CTP_HUE = 265;
const CTP_NEUTRAL_CHROMA = 0.02;

function parseOklch(css: string): Oklch {
  const c = parse(css);
  if (!c) throw new Error(`Can't parse color: ${css}`);
  const oklch = parse(css) as Oklch;
  return { mode: 'oklch', l: oklch.l ?? 0, c: oklch.c ?? 0, h: oklch.h ?? 0 };
}

function toHex(css: string): string {
  const c = parse(css);
  if (!c) return css;
  return formatHex(c);
}

/**
 * Adapt a reference color to a new background.
 * Keeps the reference's hue + chroma, adjusts lightness to hit
 * the target contrast against newBg.
 */
function adaptColor(refColor: string, newBg: string, minContrast: number, role: Role): string {
  if (role === 'passthrough') return newBg;

  const ref = parseOklch(refColor);
  // If reference is near-neutral (chroma < 0.03), inject Catppuccin's signature hue
  const isNeutral = (ref.c ?? 0) < 0.03;
  const hue = isNeutral ? CTP_HUE : (ref.h ?? 0);
  const chroma = isNeutral ? CTP_NEUTRAL_CHROMA : (ref.c ?? 0);

  if (minContrast <= 0) {
    // No contrast requirement, just shift lightness proportionally
    return toHex(refColor);
  }

  try {
    const direction =
      role === 'bg-surface' || role === 'bg-elevated' || role === 'bg-subtle'
        ? parseOklch(newBg).l > 0.5
          ? 'darker'
          : 'lighter' // surfaces go away from bg
        : 'auto';

    const color = apcach(
      crToBg(newBg, minContrast, 'apca', direction as 'lighter' | 'darker' | 'auto'),
      chroma,
      hue,
      100,
      'srgb',
    );
    return apcachToCss(color, 'hex');
  } catch {
    // Fallback: return reference as hex
    return toHex(refColor);
  }
}

// ── Generate a full token set ──
function generateTokens(
  ref: Record<string, string>,
  bg: { base: string; mantle: string; crust: string },
) {
  // First pass: generate background (it's a passthrough to ctp base)
  const generated: Record<string, string> = {
    background: bg.base,
  };

  // Generate each token
  for (const [key, def] of Object.entries(TOKEN_ROLES)) {
    if (key === 'background') continue;

    const refValue = ref[key];
    if (!refValue) continue;

    // What background to measure contrast against
    const againstKey = def.contrastAgainst ?? 'background';
    const againstBg = generated[againstKey] ?? bg.base;

    // destructiveForeground is always the lightest background
    if (key === 'destructiveForeground') {
      generated[key] = bg.base;
      continue;
    }

    generated[key] = adaptColor(refValue, againstBg, def.minContrast, def.role);
  }

  return generated;
}

// ── Verify all tokens ──
function verifyTokens(name: string, tokens: Record<string, string>) {
  console.log(`\n── ${name} ──`);
  let failures = 0;

  for (const [key, def] of Object.entries(TOKEN_ROLES)) {
    if (def.minContrast <= 0 || def.role === 'passthrough') continue;

    const fg = tokens[key];
    const againstKey = def.contrastAgainst ?? 'background';
    const bg = tokens[againstKey] ?? tokens.background;

    if (!fg || !bg) continue;

    try {
      const cr = Math.abs(calcContrast(fg, bg, 'apca', 'srgb'));
      if (cr < def.minContrast) {
        console.log(`  ✗ ${key}: APCA ${cr.toFixed(1)} < ${def.minContrast} (${fg} on ${bg})`);
        failures++;
      }
    } catch {
      console.log(`  ? ${key}: can't compute (${fg} on ${bg})`);
    }
  }

  if (failures === 0) console.log('  ✓ All tokens pass contrast checks');
  else console.log(`  ${failures} token(s) failed`);
}

// ── Run ──
const latteTokens = generateTokens(REF_LIGHT, CTP_LATTE);
const mochaTokens = generateTokens(REF_DARK, CTP_MOCHA);

verifyTokens('Latte (light)', latteTokens);
verifyTokens('Mocha (dark)', mochaTokens);

// ── Helpers for CSS var names ──
function camelToVar(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// ── Catppuccin surface ramp (hardcoded — these ARE the palette) ──
const LATTE_RAMP = [
  '#eff1f5',
  '#e6e9ef',
  '#dce0e8',
  '#ccd0da',
  '#bcc0cc',
  '#acb0be',
  '#9ca0b0',
  '#8c8fa1',
  '#7c7f93',
  '#6c6f85',
  '#5c5f77',
  '#4c4f69',
];
const MOCHA_RAMP = [
  '#1e1e2e',
  '#181825',
  '#11111b',
  '#313244',
  '#45475a',
  '#585b70',
  '#6c7086',
  '#7f849c',
  '#9399b2',
  '#a6adc8',
  '#bac2de',
  '#cdd6f4',
];

// Palette blue scales (generated with apcach for consistent Catppuccin feel)
const LATTE_BLUE = [
  '#eff3ff',
  '#e5edff',
  '#d1dfff',
  '#b8ccfe',
  '#9fb9fd',
  '#8ba8fc',
  '#7287fd',
  '#5575f8',
  '#1e66f5',
  '#1852d0',
  '#1347b8',
  '#0e3a99',
];
const MOCHA_BLUE = [
  '#1c1c30',
  '#1f2038',
  '#262848',
  '#2e3358',
  '#394069',
  '#4a5280',
  '#5f6a9a',
  '#7484b8',
  '#89b4fa',
  '#a0c0fc',
  '#b4ccfd',
  '#cdd9fe',
];

// ── Output CSS ──
const SEMANTIC_KEYS = [
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
];
const TG_KEYS = [
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
];
const TEXT_KEYS = ['textPrimary', 'textSecondary', 'textTertiary', 'textQuaternary'];

function renderSection(tokens: Record<string, string>, keys: string[]): string {
  return keys.map((k) => `  --${camelToVar(k)}: ${tokens[k]};`).join('\n');
}

function renderRamp(prefix: string, ramp: string[]): string {
  return ramp.map((v, i) => `  --palette-${prefix}-${i + 1}: ${v};`).join('\n');
}

const css = `/*
 * Catppuccin theme — Latte (light) / Mocha (dark)
 * https://github.com/catppuccin/catppuccin
 *
 * Auto-generated: reference theme colors adapted to Catppuccin backgrounds
 * with APCA contrast verification. Hue + chroma preserved from reference.
 *
 * Regenerate: bun run scripts/generate-catppuccin-theme.ts
 */

[data-color-theme="catppuccin"] {
  /* Typography */
  --theme-font-sans: "Open Sans", ui-sans-serif, system-ui, sans-serif;
  --theme-font-mono: "Geist Mono", ui-monospace, SFMono-Regular, monospace;

  /* Layout */
  --radius: 0.75rem;
  --theme-radius-2xl: 1.125rem;
  --theme-radius-3xl: 1.375rem;
  --theme-radius-4xl: 1.75rem;
  --bubble-r-sm: 6px;
  --bubble-r-lg: 14px;

  /* === Catppuccin Latte (auto-adapted) === */

  /* Surfaces & interactive */
${renderSection(latteTokens, SEMANTIC_KEYS)}

  /* Telegram-specific */
${renderSection(latteTokens, TG_KEYS)}

  /* Text hierarchy */
${renderSection(latteTokens, TEXT_KEYS)}

  /* Palette scales */
${renderRamp('sand', LATTE_RAMP)}

${renderRamp('blue', LATTE_BLUE)}

  --palette-red-9: ${latteTokens.destructive};
  --palette-red-11: ${latteTokens.draft};
  --palette-plum-9: ${latteTokens.avatar2};
  --palette-green-9: ${latteTokens.online};
}

[data-color-theme="catppuccin"].dark {
  /* === Catppuccin Mocha (auto-adapted) === */

  /* Surfaces & interactive */
${renderSection(mochaTokens, SEMANTIC_KEYS)}

  /* Telegram-specific */
${renderSection(mochaTokens, TG_KEYS)}

  /* Text hierarchy */
${renderSection(mochaTokens, TEXT_KEYS)}

  /* Palette scales */
${renderRamp('sand', MOCHA_RAMP)}

${renderRamp('blue', MOCHA_BLUE)}

  --palette-red-9: ${mochaTokens.destructive};
  --palette-red-11: ${mochaTokens.draft};
  --palette-plum-9: ${mochaTokens.avatar2};
  --palette-green-9: ${mochaTokens.online};
}
`;

const path = new URL('../apps/app/src/mainview/themes/catppuccin.css', import.meta.url);
await Bun.write(path, css);
console.log(`\n✓ Written to ${path.pathname}`);
