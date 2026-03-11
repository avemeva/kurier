import { describe, expect, it } from 'vitest';
import {
  ALBUM_SPACING,
  computeAlbumLayout,
  computeMediaSize,
  cornersFromSides,
  MAX_MEDIA_SIZE,
  MIN_MEDIA_SIZE,
} from './media-sizing';

describe('computeMediaSize', () => {
  const max = MAX_MEDIA_SIZE; // 430
  const min = MIN_MEDIA_SIZE; // 100

  it('scales landscape photo to fit max width', () => {
    const { width, height } = computeMediaSize(1920, 1080, max, min);
    expect(width).toBe(max);
    expect(height).toBe(Math.round((max * 1080) / 1920)); // ~223
    expect(height).toBeLessThan(width);
  });

  it('portrait photo fills max width and is square-capped', () => {
    // 591x1280 portrait: w=430, h=round(430*1280/591)=932 → square cap: h=430
    const { width, height } = computeMediaSize(591, 1280, max, min);
    expect(width).toBe(max); // fills bubble width
    expect(height).toBe(max); // square cap
  });

  it('tall portrait 1080x1920 fills max width and is square-capped', () => {
    // 1080x1920: w=430, h=round(430*1920/1080)=764 → square cap: h=430
    const { width, height } = computeMediaSize(1080, 1920, max, min);
    expect(width).toBe(max);
    expect(height).toBe(max); // square cap
  });

  it('square photo stays square', () => {
    const { width, height } = computeMediaSize(800, 800, max, min);
    expect(width).toBe(max);
    expect(height).toBe(max);
  });

  it('small photo is not upscaled', () => {
    const { width, height } = computeMediaSize(200, 150, max, min);
    expect(width).toBe(200);
    expect(height).toBe(150);
  });

  it('very small photo is clamped to min size', () => {
    const { width, height } = computeMediaSize(50, 50, max, min);
    expect(width).toBe(min);
    expect(height).toBe(min);
  });

  it('zero dimensions return min size', () => {
    const { width, height } = computeMediaSize(0, 0, max, min);
    expect(width).toBe(min);
    expect(height).toBe(min);
  });

  it('extremely narrow photo has width clamped to min, height square-capped', () => {
    // 100x2000: w=min(100,430)=100, h=round(100*2000/100)=2000 → square cap: h=100
    const { width, height } = computeMediaSize(100, 2000, max, min);
    expect(width).toBe(min);
    expect(height).toBe(min); // square cap
  });

  it('panoramic photo (very wide) fits within max width, height clamped to min', () => {
    const { width, height } = computeMediaSize(4000, 500, max, min);
    expect(width).toBe(max);
    // 430 * 500/4000 = 53.75 → rounds to 54, clamped to min=100
    expect(height).toBe(min);
  });
});

describe('computeAlbumLayout', () => {
  const maxW = MAX_MEDIA_SIZE;
  const minW = MIN_MEDIA_SIZE;
  const sp = ALBUM_SPACING;

  it('single item fills full width', () => {
    const layout = computeAlbumLayout([{ width: 1920, height: 1080 }], maxW, minW, sp);
    expect(layout).toHaveLength(1);
    expect(layout[0].geometry.width).toBe(maxW);
    expect(layout[0].geometry.x).toBe(0);
    expect(layout[0].geometry.y).toBe(0);
  });

  it('2 similar landscape photos stack top-bottom (tdesktop ww + high avg ratio)', () => {
    // Both are 'w' (ratio > 1.2), similar ratios, avgRatio > 1.4 → top/bottom
    const layout = computeAlbumLayout(
      [
        { width: 1920, height: 1080 },
        { width: 1600, height: 900 },
      ],
      maxW,
      minW,
      sp,
    );
    expect(layout).toHaveLength(2);
    // Top/bottom: both full width, second below first
    expect(layout[0].geometry.width).toBe(maxW);
    expect(layout[1].geometry.width).toBe(maxW);
    expect(layout[1].geometry.y).toBeGreaterThan(0);
  });

  it('2 square photos go side by side', () => {
    const layout = computeAlbumLayout(
      [
        { width: 800, height: 800 },
        { width: 900, height: 900 },
      ],
      maxW,
      minW,
      sp,
    );
    expect(layout).toHaveLength(2);
    // Side by side: both at y=0
    expect(layout[0].geometry.y).toBe(0);
    expect(layout[1].geometry.y).toBe(0);
    expect(layout[1].geometry.x).toBeGreaterThan(0);
    expect(layout[0].geometry.width + sp + layout[1].geometry.width).toBe(maxW);
  });

  it('3 items with narrow first: left tall + 2 stacked right', () => {
    const layout = computeAlbumLayout(
      [
        { width: 600, height: 1200 }, // narrow (ratio 0.5 < 0.8 → 'n')
        { width: 1200, height: 800 }, // wide
        { width: 1000, height: 1000 }, // square
      ],
      maxW,
      minW,
      sp,
    );
    expect(layout).toHaveLength(3);
    // First item should be on the left, full height
    expect(layout[0].geometry.x).toBe(0);
    expect(layout[0].geometry.y).toBe(0);
    // Items 2 and 3 should be stacked on the right
    expect(layout[1].geometry.x).toBeGreaterThan(0);
    expect(layout[2].geometry.x).toBe(layout[1].geometry.x);
    expect(layout[2].geometry.y).toBeGreaterThan(layout[1].geometry.y);
  });

  it('4 landscape photos: top wide + 3 bottom', () => {
    const layout = computeAlbumLayout(
      [
        { width: 1920, height: 1080 }, // wide (ratio 1.78 > 1.2 → 'w')
        { width: 1600, height: 900 },
        { width: 1200, height: 800 },
        { width: 1400, height: 1000 },
      ],
      maxW,
      minW,
      sp,
    );
    expect(layout).toHaveLength(4);
    // First item spans full width on top
    expect(layout[0].geometry.width).toBe(maxW);
    expect(layout[0].geometry.y).toBe(0);
    // Items 2,3,4 on bottom row
    const bottomY = layout[1].geometry.y;
    expect(bottomY).toBeGreaterThan(0);
    expect(layout[2].geometry.y).toBe(bottomY);
    expect(layout[3].geometry.y).toBe(bottomY);
  });

  it('no gaps between album cells (cells + spacing fill full width)', () => {
    const sizes = [
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      { width: 1200, height: 1200 },
    ];
    const layout = computeAlbumLayout(sizes, maxW, minW, sp);
    // For each row, cells + spacing should equal maxWidth
    // Group by y coordinate to find rows
    const rows = new Map<number, typeof layout>();
    for (const item of layout) {
      const y = item.geometry.y;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)?.push(item);
    }
    for (const [, row] of rows) {
      if (row.length > 1) {
        const totalWidth =
          row.reduce((sum, item) => sum + item.geometry.width, 0) + sp * (row.length - 1);
        expect(totalWidth).toBe(maxW);
      }
    }
  });

  it('5+ items use complex layout with multiple rows', () => {
    const layout = computeAlbumLayout(
      Array.from({ length: 6 }, () => ({ width: 1920, height: 1080 })),
      maxW,
      minW,
      sp,
    );
    expect(layout).toHaveLength(6);
    // Should have at least 2 different y values (rows)
    const uniqueYs = new Set(layout.map((item) => item.geometry.y));
    expect(uniqueYs.size).toBeGreaterThanOrEqual(2);
  });

  it('album items have correct side flags for corner rounding', () => {
    // Use square photos to get side-by-side layout
    const layout = computeAlbumLayout(
      [
        { width: 800, height: 800 },
        { width: 900, height: 900 },
      ],
      maxW,
      minW,
      sp,
    );
    // Left item should have 'left' but not 'right'
    expect(layout[0].sides.has('left')).toBe(true);
    expect(layout[0].sides.has('right')).toBe(false);
    // Right item should have 'right' but not 'left'
    expect(layout[1].sides.has('right')).toBe(true);
    expect(layout[1].sides.has('left')).toBe(false);
    // Both should have 'top' and 'bottom' (single row)
    expect(layout[0].sides.has('top')).toBe(true);
    expect(layout[0].sides.has('bottom')).toBe(true);
  });
});

describe('computeMediaSize — MAX_MEDIA_SIZE=430 verification', () => {
  it('1920x1080 at max=430 returns {430, 242}', () => {
    const { width, height } = computeMediaSize(1920, 1080, 430, 100);
    expect(width).toBe(430);
    expect(height).toBe(242); // 430 * 1080/1920 = 241.875 → 242
  });
});

describe('computeAlbumLayout — comprehensive gap tests', () => {
  const maxW = MAX_MEDIA_SIZE;
  const minW = MIN_MEDIA_SIZE;
  const sp = ALBUM_SPACING;

  /** Group layout items into rows by y coordinate. */
  function getRows(layout: ReturnType<typeof computeAlbumLayout>) {
    const rows = new Map<number, typeof layout>();
    for (const item of layout) {
      const y = item.geometry.y;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)?.push(item);
    }
    return rows;
  }

  /** Mixed sizes to stress-test different layout paths. */
  const mixedSizes = [
    { width: 1920, height: 1080 },
    { width: 1080, height: 1920 },
    { width: 1200, height: 1200 },
    { width: 800, height: 600 },
    { width: 600, height: 800 },
    { width: 3000, height: 1000 },
    { width: 500, height: 500 },
    { width: 1600, height: 900 },
    { width: 400, height: 1200 },
    { width: 2000, height: 2000 },
  ];

  for (let count = 2; count <= 10; count++) {
    it(`${count}-item album: cells + spacing = maxWidth per row, no overlapping, height > 0`, () => {
      const sizes = mixedSizes.slice(0, count);
      const layout = computeAlbumLayout(sizes, maxW, minW, sp);
      expect(layout).toHaveLength(count);

      const rows = getRows(layout);

      for (const [, row] of rows) {
        // Sort by x for overlap check
        row.sort((a, b) => a.geometry.x - b.geometry.x);

        if (row.length > 1) {
          // Cells + spacing should equal maxWidth
          const totalWidth =
            row.reduce((sum, item) => sum + item.geometry.width, 0) + sp * (row.length - 1);
          expect(totalWidth).toBe(maxW);
        }

        // No overlapping cells
        for (let i = 1; i < row.length; i++) {
          const prev = row[i - 1].geometry;
          const curr = row[i].geometry;
          expect(curr.x).toBeGreaterThanOrEqual(prev.x + prev.width + sp);
        }

        // Every cell has positive dimensions
        for (const item of row) {
          expect(item.geometry.width).toBeGreaterThan(0);
          expect(item.geometry.height).toBeGreaterThan(0);
        }
      }

      // Total layout height > 0
      const maxY = Math.max(...layout.map((item) => item.geometry.y + item.geometry.height));
      expect(maxY).toBeGreaterThan(0);
    });
  }

  it('last cell in each row fills remaining width (no fractional gap)', () => {
    // Test with 5 items which forces complex layout
    const sizes = mixedSizes.slice(0, 5);
    const layout = computeAlbumLayout(sizes, maxW, minW, sp);
    const rows = getRows(layout);

    for (const [, row] of rows) {
      if (row.length <= 1) continue;
      row.sort((a, b) => a.geometry.x - b.geometry.x);
      const lastItem = row[row.length - 1];
      // Last cell's right edge should exactly reach maxWidth
      expect(lastItem.geometry.x + lastItem.geometry.width).toBe(maxW);
    }
  });
});

describe('cornersFromSides', () => {
  it('all sides → all corners rounded', () => {
    const corners = cornersFromSides(new Set(['top', 'bottom', 'left', 'right']));
    expect(corners).toEqual({ topLeft: true, topRight: true, bottomLeft: true, bottomRight: true });
  });

  it('top+left only → only topLeft rounded', () => {
    const corners = cornersFromSides(new Set(['top', 'left']));
    expect(corners).toEqual({
      topLeft: true,
      topRight: false,
      bottomLeft: false,
      bottomRight: false,
    });
  });

  it('no sides → no corners rounded', () => {
    const corners = cornersFromSides(new Set());
    expect(corners).toEqual({
      topLeft: false,
      topRight: false,
      bottomLeft: false,
      bottomRight: false,
    });
  });
});
