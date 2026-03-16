import { describe, expect, it } from 'vitest';
import { qualifyEmoji, stripVS16, TEXT_DEFAULT_EMOJI } from './emoji-qualify';

describe('TEXT_DEFAULT_EMOJI', () => {
  it('contains the expected number of codepoints', () => {
    // Unicode 16.0 emoji-variation-sequences.txt defines 371 emoji-style sequences
    expect(TEXT_DEFAULT_EMOJI.size).toBe(371);
  });

  it('contains known text-default codepoints', () => {
    expect(TEXT_DEFAULT_EMOJI.has(0x2764)).toBe(true); // ❤
    expect(TEXT_DEFAULT_EMOJI.has(0x2640)).toBe(true); // ♀
    expect(TEXT_DEFAULT_EMOJI.has(0x2642)).toBe(true); // ♂
    expect(TEXT_DEFAULT_EMOJI.has(0x00a9)).toBe(true); // ©
    expect(TEXT_DEFAULT_EMOJI.has(0x00ae)).toBe(true); // ®
    expect(TEXT_DEFAULT_EMOJI.has(0x2122)).toBe(true); // ™
  });

  it('contains supplementary plane codepoints', () => {
    expect(TEXT_DEFAULT_EMOJI.has(0x1f321)).toBe(true); // 🌡 thermometer
    expect(TEXT_DEFAULT_EMOJI.has(0x1f573)).toBe(true); // 🕳 hole
  });
});

describe('qualifyEmoji', () => {
  it('AC#1: bare heart → qualified', () => {
    expect(qualifyEmoji('\u2764')).toBe('\u2764\uFE0F');
  });

  it('AC#2: already qualified heart → unchanged (no double FE0F)', () => {
    expect(qualifyEmoji('\u2764\uFE0F')).toBe('\u2764\uFE0F');
  });

  it('AC#3: fire (Emoji_Presentation=Yes) → unchanged', () => {
    // 🔥 U+1F525 is NOT in TEXT_DEFAULT_EMOJI (it has Emoji_Presentation=Yes)
    expect(qualifyEmoji('\uD83D\uDD25')).toBe('\uD83D\uDD25');
  });

  it('AC#4: female sign (text-default) → qualified', () => {
    expect(qualifyEmoji('\u2640')).toBe('\u2640\uFE0F');
  });

  it('AC#5: supplementary plane text-default (thermometer U+1F321) → qualified', () => {
    expect(qualifyEmoji('\uD83C\uDF21')).toBe('\uD83C\uDF21\uFE0F');
  });

  it('AC#6: ZWJ sequences → unchanged', () => {
    // 👨‍👩‍👧 family
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(qualifyEmoji(family)).toBe(family);
  });

  it('AC#7: flag sequences → unchanged', () => {
    // 🇺🇸 U+1F1FA U+1F1F8 — regional indicators, not in TEXT_DEFAULT_EMOJI
    const flag = '\uD83C\uDDFA\uD83C\uDDF8';
    expect(qualifyEmoji(flag)).toBe(flag);
  });

  it('AC#8: skin-toned emoji → unchanged (no FE0F added before skin tone)', () => {
    // 👍🏽 U+1F44D U+1F3FD
    const thumbsUp = '\u{1F44D}\u{1F3FD}';
    expect(qualifyEmoji(thumbsUp)).toBe(thumbsUp);
  });

  it('empty string → empty string', () => {
    expect(qualifyEmoji('')).toBe('');
  });

  it('handles copyright sign', () => {
    expect(qualifyEmoji('\u00A9')).toBe('\u00A9\uFE0F');
  });

  it('handles trademark sign', () => {
    expect(qualifyEmoji('\u2122')).toBe('\u2122\uFE0F');
  });
});

describe('stripVS16', () => {
  it('AC#9: qualified heart → stripped', () => {
    expect(stripVS16('\u2764\uFE0F')).toBe('\u2764');
  });

  it('AC#10: fire (no FE0F) → unchanged', () => {
    expect(stripVS16('\uD83D\uDD25')).toBe('\uD83D\uDD25');
  });

  it('AC#11: ZWJ sequence with FE0F → preserved', () => {
    // 🏳️‍🌈 rainbow flag: U+1F3F3 U+FE0F U+200D U+1F308
    const rainbow = '\u{1F3F3}\uFE0F\u200D\u{1F308}';
    expect(stripVS16(rainbow)).toBe(rainbow);
    expect(stripVS16(rainbow)).toContain('\uFE0F');
  });

  it('strips multiple FE0F when no ZWJ', () => {
    // Hypothetical string with multiple FE0F
    const multi = '\u2764\uFE0F\u2640\uFE0F';
    expect(stripVS16(multi)).toBe('\u2764\u2640');
  });

  it('empty string → empty string', () => {
    expect(stripVS16('')).toBe('');
  });
});
