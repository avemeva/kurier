/**
 * Media sizing utilities ported from tdesktop.
 *
 * Reference: tdesktop/Telegram/SourceFiles/ui/grouped_layout.cpp
 *
 * All functions are pure — no React, no DOM, no side effects.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Kurier's effective max media size (≈60% of 720px) */
export const MAX_MEDIA_SIZE = 430;
export const MIN_MEDIA_SIZE = 100;
export const ALBUM_SPACING = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface AlbumItem {
  geometry: Rect;
  sides: Set<Side>;
}

export interface Corners {
  topLeft: boolean;
  topRight: boolean;
  bottomLeft: boolean;
  bottomRight: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe array access — returns 1 as fallback (safe divisor for ratios). */
function at(arr: number[], i: number): number {
  return arr[i] ?? 1;
}

function sideSet(...s: Side[]): Set<Side> {
  return new Set(s);
}

// ---------------------------------------------------------------------------
// 1. computeMediaSize
// ---------------------------------------------------------------------------

/**
 * Port of tdesktop's CountDesiredMediaSize + CountPhotoMediaSize pipeline.
 *
 * 1. Downscale to fit within maxSize x maxSize box, preserving aspect ratio.
 * 2. Apply "square cap" for photos: if height > width after scaling, scale
 *    down further so height = width.
 * 3. Clamp minimum dimension to minSize.
 */
export function computeMediaSize(
  originalW: number,
  originalH: number,
  maxSize: number = MAX_MEDIA_SIZE,
  minSize: number = MIN_MEDIA_SIZE,
): Size {
  if (originalW <= 0 || originalH <= 0) {
    return { width: minSize, height: minSize };
  }

  const ratio = originalW / originalH;

  // Step 1: scale width to fill maxSize, compute height proportionally.
  let w = Math.min(originalW, maxSize);
  let h = Math.round(w / ratio);

  // Step 2: square cap — if height > width, cap height = width.
  // Portrait photos render in a square container at full bubble width.
  // The actual image is centered (object-contain) with a blurred background
  // filling the empty sides — matching tdesktop/Telegram behavior.
  if (h > w) {
    h = w;
  }

  // Step 3: clamp minimum
  if (w < minSize) w = minSize;
  if (h < minSize) h = minSize;

  return { width: w, height: h };
}

// ---------------------------------------------------------------------------
// 2. computeAlbumLayout
// ---------------------------------------------------------------------------

/**
 * Port of tdesktop's full Layouter (1-4 items) + ComplexLayouter (5+ items
 * or any ratio > 2).
 *
 * Reference: grouped_layout.cpp
 */
export function computeAlbumLayout(
  sizes: Size[],
  maxWidth: number = MAX_MEDIA_SIZE,
  minWidth: number = MIN_MEDIA_SIZE,
  spacing: number = ALBUM_SPACING,
): AlbumItem[] {
  const count = sizes.length;
  if (count === 0) return [];

  const ratios = sizes.map((s) => (s.height > 0 ? s.width / s.height : 1));
  const proportions = ratios.map((r) => (r > 1.2 ? 'w' : r < 0.8 ? 'n' : 'q')).join('');

  // tdesktop: accumulate starts at 1.0
  const averageRatio = (1 + ratios.reduce((a, b) => a + b, 0)) / count;

  const maxHeight = maxWidth; // square max for simple layouts
  const maxSizeRatio = maxWidth / maxHeight; // always 1 for square

  if (count === 1) {
    const s0 = sizes[0] ?? { width: 1, height: 1 };
    const width = maxWidth;
    const height = Math.round((s0.height * width) / s0.width) || width;
    return [
      { geometry: { x: 0, y: 0, width, height }, sides: sideSet('left', 'top', 'right', 'bottom') },
    ];
  }

  // Dispatch to ComplexLayouter if 5+ items or any ratio > 2
  if (count >= 5 || ratios.some((r) => r > 2)) {
    return complexLayout(ratios, averageRatio, maxWidth, minWidth, spacing);
  }

  if (count === 2) {
    return layoutTwo(
      ratios,
      proportions,
      averageRatio,
      maxSizeRatio,
      maxWidth,
      maxHeight,
      minWidth,
      spacing,
    );
  }
  if (count === 3) {
    return layoutThree(ratios, proportions, maxWidth, maxHeight, minWidth, spacing);
  }
  return layoutFour(ratios, proportions, maxWidth, maxHeight, minWidth, spacing);
}

// ---------------------------------------------------------------------------
// Simple layout helpers (1-4 items)
// ---------------------------------------------------------------------------

function layoutTwo(
  ratios: number[],
  proportions: string,
  averageRatio: number,
  maxSizeRatio: number,
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number,
): AlbumItem[] {
  if (
    proportions === 'ww' &&
    averageRatio > 1.4 * maxSizeRatio &&
    at(ratios, 1) - at(ratios, 0) < 0.2
  ) {
    return layoutTwoTopBottom(ratios, maxWidth, maxHeight, spacing);
  }
  if (proportions === 'ww' || proportions === 'qq') {
    return layoutTwoLeftRightEqual(ratios, maxWidth, maxHeight, spacing);
  }
  return layoutTwoLeftRight(ratios, maxWidth, maxHeight, minWidth, spacing);
}

function layoutTwoTopBottom(
  ratios: number[],
  maxWidth: number,
  maxHeight: number,
  spacing: number,
): AlbumItem[] {
  const width = maxWidth;
  const height = Math.round(
    Math.min(width / at(ratios, 0), Math.min(width / at(ratios, 1), (maxHeight - spacing) / 2)),
  );
  return [
    { geometry: { x: 0, y: 0, width, height }, sides: sideSet('left', 'top', 'right') },
    {
      geometry: { x: 0, y: height + spacing, width, height },
      sides: sideSet('left', 'bottom', 'right'),
    },
  ];
}

function layoutTwoLeftRightEqual(
  ratios: number[],
  maxWidth: number,
  maxHeight: number,
  spacing: number,
): AlbumItem[] {
  const width = Math.floor((maxWidth - spacing) / 2);
  const height = Math.round(
    Math.min(width / at(ratios, 0), Math.min(width / at(ratios, 1), maxHeight)),
  );
  return [
    { geometry: { x: 0, y: 0, width, height }, sides: sideSet('top', 'left', 'bottom') },
    {
      geometry: { x: width + spacing, y: 0, width, height },
      sides: sideSet('top', 'right', 'bottom'),
    },
  ];
}

function layoutTwoLeftRight(
  ratios: number[],
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number,
): AlbumItem[] {
  const r0 = at(ratios, 0);
  const r1 = at(ratios, 1);
  const minimalWidth = Math.round(minWidth * 1.5);
  const secondWidth = Math.min(
    Math.round(Math.max(0.4 * (maxWidth - spacing), (maxWidth - spacing) / r0 / (1 / r0 + 1 / r1))),
    maxWidth - spacing - minimalWidth,
  );
  const firstWidth = maxWidth - secondWidth - spacing;
  const height = Math.min(maxHeight, Math.round(Math.min(firstWidth / r0, secondWidth / r1)));
  return [
    {
      geometry: { x: 0, y: 0, width: firstWidth, height },
      sides: sideSet('top', 'left', 'bottom'),
    },
    {
      geometry: { x: firstWidth + spacing, y: 0, width: secondWidth, height },
      sides: sideSet('top', 'right', 'bottom'),
    },
  ];
}

function layoutThree(
  ratios: number[],
  proportions: string,
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number,
): AlbumItem[] {
  if (proportions[0] === 'n') {
    return layoutThreeLeftAndOther(ratios, maxWidth, maxHeight, minWidth, spacing);
  }
  return layoutThreeTopAndOther(ratios, maxWidth, maxHeight, spacing);
}

function layoutThreeLeftAndOther(
  ratios: number[],
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number,
): AlbumItem[] {
  const r0 = at(ratios, 0);
  const r1 = at(ratios, 1);
  const r2 = at(ratios, 2);
  const firstHeight = maxHeight;
  const thirdHeight = Math.round(
    Math.min((maxHeight - spacing) / 2, (r1 * (maxWidth - spacing)) / (r2 + r1)),
  );
  const secondHeight = firstHeight - thirdHeight - spacing;
  const rightWidth = Math.max(
    minWidth,
    Math.round(Math.min((maxWidth - spacing) / 2, Math.min(thirdHeight * r2, secondHeight * r1))),
  );
  const leftWidth = Math.min(Math.round(firstHeight * r0), maxWidth - spacing - rightWidth);
  return [
    {
      geometry: { x: 0, y: 0, width: leftWidth, height: firstHeight },
      sides: sideSet('top', 'left', 'bottom'),
    },
    {
      geometry: { x: leftWidth + spacing, y: 0, width: rightWidth, height: secondHeight },
      sides: sideSet('top', 'right'),
    },
    {
      geometry: {
        x: leftWidth + spacing,
        y: secondHeight + spacing,
        width: rightWidth,
        height: thirdHeight,
      },
      sides: sideSet('bottom', 'right'),
    },
  ];
}

function layoutThreeTopAndOther(
  ratios: number[],
  maxWidth: number,
  maxHeight: number,
  spacing: number,
): AlbumItem[] {
  const r0 = at(ratios, 0);
  const r1 = at(ratios, 1);
  const r2 = at(ratios, 2);
  const firstWidth = maxWidth;
  const firstHeight = Math.round(Math.min(firstWidth / r0, (maxHeight - spacing) * 0.66));
  const secondWidth = Math.floor((maxWidth - spacing) / 2);
  const secondHeight = Math.min(
    maxHeight - firstHeight - spacing,
    Math.round(Math.min(secondWidth / r1, secondWidth / r2)),
  );
  const thirdWidth = firstWidth - secondWidth - spacing;
  return [
    {
      geometry: { x: 0, y: 0, width: firstWidth, height: firstHeight },
      sides: sideSet('left', 'top', 'right'),
    },
    {
      geometry: { x: 0, y: firstHeight + spacing, width: secondWidth, height: secondHeight },
      sides: sideSet('bottom', 'left'),
    },
    {
      geometry: {
        x: secondWidth + spacing,
        y: firstHeight + spacing,
        width: thirdWidth,
        height: secondHeight,
      },
      sides: sideSet('bottom', 'right'),
    },
  ];
}

function layoutFour(
  ratios: number[],
  proportions: string,
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number,
): AlbumItem[] {
  if (proportions[0] === 'w') {
    return layoutFourTopAndOther(ratios, maxWidth, maxHeight, minWidth, spacing);
  }
  return layoutFourLeftAndOther(ratios, maxWidth, maxHeight, minWidth, spacing);
}

function layoutFourTopAndOther(
  ratios: number[],
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number,
): AlbumItem[] {
  const r0 = at(ratios, 0);
  const r1 = at(ratios, 1);
  const r2 = at(ratios, 2);
  const r3 = at(ratios, 3);
  const w = maxWidth;
  const h0 = Math.round(Math.min(w / r0, (maxHeight - spacing) * 0.66));
  const h = Math.round((maxWidth - 2 * spacing) / (r1 + r2 + r3));
  const w0 = Math.max(minWidth, Math.round(Math.min((maxWidth - 2 * spacing) * 0.4, h * r1)));
  const w2 = Math.round(Math.max(Math.max(minWidth, (maxWidth - 2 * spacing) * 0.33), h * r3));
  const w1 = w - w0 - w2 - 2 * spacing;
  const h1 = Math.min(maxHeight - h0 - spacing, h);

  return [
    { geometry: { x: 0, y: 0, width: w, height: h0 }, sides: sideSet('left', 'top', 'right') },
    {
      geometry: { x: 0, y: h0 + spacing, width: w0, height: h1 },
      sides: sideSet('bottom', 'left'),
    },
    {
      geometry: { x: w0 + spacing, y: h0 + spacing, width: w1, height: h1 },
      sides: sideSet('bottom'),
    },
    {
      geometry: { x: w0 + spacing + w1 + spacing, y: h0 + spacing, width: w2, height: h1 },
      sides: sideSet('right', 'bottom'),
    },
  ];
}

function layoutFourLeftAndOther(
  ratios: number[],
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number,
): AlbumItem[] {
  const r0 = at(ratios, 0);
  const r1 = at(ratios, 1);
  const r2 = at(ratios, 2);
  const r3 = at(ratios, 3);
  const h = maxHeight;
  const w0 = Math.round(Math.min(h * r0, (maxWidth - spacing) * 0.6));

  const wCalc = Math.round((maxHeight - 2 * spacing) / (1 / r1 + 1 / r2 + 1 / r3));
  const h0 = Math.round(wCalc / r1);
  const h1 = Math.round(wCalc / r2);
  const h2 = h - h0 - h1 - 2 * spacing;
  const w1 = Math.max(minWidth, Math.min(maxWidth - w0 - spacing, wCalc));

  return [
    { geometry: { x: 0, y: 0, width: w0, height: h }, sides: sideSet('top', 'left', 'bottom') },
    { geometry: { x: w0 + spacing, y: 0, width: w1, height: h0 }, sides: sideSet('top', 'right') },
    {
      geometry: { x: w0 + spacing, y: h0 + spacing, width: w1, height: h1 },
      sides: sideSet('right'),
    },
    {
      geometry: { x: w0 + spacing, y: h0 + h1 + 2 * spacing, width: w1, height: h2 },
      sides: sideSet('bottom', 'right'),
    },
  ];
}

// ---------------------------------------------------------------------------
// ComplexLayouter (5+ items or any ratio > 2)
// ---------------------------------------------------------------------------

interface Attempt {
  lineCounts: number[];
  heights: number[];
}

function cropRatios(ratios: number[], averageRatio: number): number[] {
  const maxRatio = 2.75;
  const minRatio = 0.6667;
  return ratios.map((r) =>
    averageRatio > 1.1 ? Math.min(Math.max(r, 1), maxRatio) : Math.min(Math.max(r, minRatio), 1),
  );
}

function complexLayout(
  originalRatios: number[],
  averageRatio: number,
  maxWidth: number,
  minWidth: number,
  spacing: number,
): AlbumItem[] {
  const ratios = cropRatios(originalRatios, averageRatio);
  const count = ratios.length;
  const maxHeight = Math.round((maxWidth * 4) / 3);

  const multiHeight = (offset: number, lineCount: number): number => {
    let sum = 0;
    for (let i = offset; i < offset + lineCount; i++) {
      sum += at(ratios, i);
    }
    return (maxWidth - (lineCount - 1) * spacing) / sum;
  };

  const attempts: Attempt[] = [];

  const pushAttempt = (lineCounts: number[]): void => {
    const heights: number[] = [];
    let offset = 0;
    for (const lc of lineCounts) {
      heights.push(multiHeight(offset, lc));
      offset += lc;
    }
    attempts.push({ lineCounts, heights });
  };

  // 2-row arrangements
  for (let first = 1; first < count; first++) {
    const second = count - first;
    if (first > 3 || second > 3) continue;
    pushAttempt([first, second]);
  }

  // 3-row arrangements
  for (let first = 1; first < count - 1; first++) {
    for (let second = 1; second < count - first; second++) {
      const third = count - first - second;
      if (first > 3 || second > (averageRatio < 0.85 ? 4 : 3) || third > 3) {
        continue;
      }
      pushAttempt([first, second, third]);
    }
  }

  // 4-row arrangements
  for (let first = 1; first < count - 1; first++) {
    for (let second = 1; second < count - first; second++) {
      for (let third = 1; third < count - first - second; third++) {
        const fourth = count - first - second - third;
        if (first > 3 || second > 3 || third > 3 || fourth > 3) continue;
        pushAttempt([first, second, third, fourth]);
      }
    }
  }

  // Find optimal attempt
  let optimalAttempt: Attempt | null = null;
  let optimalDiff = 0;

  for (const attempt of attempts) {
    const { heights, lineCounts } = attempt;
    const lineCount = lineCounts.length;
    const totalHeight = heights.reduce((a, b) => a + b, 0) + spacing * (lineCount - 1);
    const minLineHeight = Math.min(...heights);

    const bad1 = minLineHeight < minWidth ? 1.5 : 1;
    let bad2 = 1;
    for (let line = 1; line < lineCount; line++) {
      if (at(lineCounts, line - 1) > at(lineCounts, line)) {
        bad2 = 1.5;
        break;
      }
    }

    const diff = Math.abs(totalHeight - maxHeight) * bad1 * bad2;
    if (!optimalAttempt || diff < optimalDiff) {
      optimalAttempt = attempt;
      optimalDiff = diff;
    }
  }

  if (!optimalAttempt) {
    return sizesFallback(count, maxWidth, spacing);
  }

  // Build result from optimal attempt
  const result: AlbumItem[] = [];
  const { lineCounts: optCounts, heights: optHeights } = optimalAttempt;
  const rowCount = optCounts.length;

  let index = 0;
  let y = 0;

  for (let row = 0; row < rowCount; row++) {
    const colCount = at(optCounts, row);
    const lineHeight = at(optHeights, row);
    const height = Math.round(lineHeight);

    let x = 0;
    for (let col = 0; col < colCount; col++) {
      const s: Side[] = [];
      if (row === 0) s.push('top');
      if (row === rowCount - 1) s.push('bottom');
      if (col === 0) s.push('left');
      if (col === colCount - 1) s.push('right');

      const ratio = at(ratios, index);
      const width = col === colCount - 1 ? maxWidth - x : Math.round(ratio * lineHeight);

      result.push({
        geometry: { x, y, width, height },
        sides: new Set(s),
      });

      x += width + spacing;
      index++;
    }
    y += height + spacing;
  }

  return result;
}

/** Last-resort fallback for edge cases — single column stack. */
function sizesFallback(count: number, maxWidth: number, spacing: number): AlbumItem[] {
  const result: AlbumItem[] = [];
  const height = Math.round(maxWidth / count);
  let y = 0;
  for (let i = 0; i < count; i++) {
    const s: Side[] = ['left', 'right'];
    if (i === 0) s.push('top');
    if (i === count - 1) s.push('bottom');
    result.push({
      geometry: { x: 0, y, width: maxWidth, height },
      sides: new Set(s),
    });
    y += height + spacing;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 3. cornersFromSides
// ---------------------------------------------------------------------------

/**
 * Convert side flags to corner rounding flags.
 * A corner is rounded only if both adjacent sides are present.
 */
export function cornersFromSides(sidesSet: Set<string>): Corners {
  return {
    topLeft: sidesSet.has('top') && sidesSet.has('left'),
    topRight: sidesSet.has('top') && sidesSet.has('right'),
    bottomLeft: sidesSet.has('bottom') && sidesSet.has('left'),
    bottomRight: sidesSet.has('bottom') && sidesSet.has('right'),
  };
}
