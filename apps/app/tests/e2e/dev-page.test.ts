import type { Page } from '@playwright/test';
import { expect, devTest as test } from '../fixtures';

// ---------------------------------------------------------------------------
// Shared state — single page, one navigation
// ---------------------------------------------------------------------------

let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ devPage }) => {
  page = devPage;

  const url = process.env.BASE_URL || test.info().project.use.baseURL || 'http://tg.localhost:1355';
  await page.goto(`${url}/dev`);

  // Wait for the page to render
  await page.waitForSelector('[data-testid="dev-ui-primitives"]', { timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// Page load
// ---------------------------------------------------------------------------

test('page loads without exceptions', async () => {
  const heading = page.locator('h1:has-text("Component Dev")');
  await expect(heading).toBeVisible();
});

// ---------------------------------------------------------------------------
// Section nav
// ---------------------------------------------------------------------------

test('section nav is visible with all sections', async () => {
  const nav = page.locator('nav');
  await expect(nav).toBeVisible();

  const sections = [
    'UI Primitives',
    'Status & Presence',
    'Chat Header States',
    'Text Messages',
    'Entities',
    'Photos',
    'Videos',
    'GIFs',
    'Stickers',
    'Voice Messages',
    'Link Previews',
    'Replies',
    'Media Pure Views',
    'FormattedText',
    'Albums',
    'Reactions',
    'Forwards',
    'Bot Keyboards',
    'Timestamps',
    'Service Messages',
    'Sidebar Dialog Rows',
  ];

  for (const name of sections) {
    await expect(page.locator(`nav >> text="${name}"`)).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

test('photos load with valid dimensions', async () => {
  const section = page.locator('[data-testid="dev-photos"]');
  const images = section.locator('img');
  const count = await images.count();
  expect(count, 'Expected at least one photo in Photos section').toBeGreaterThan(0);

  // Check first image has loaded (naturalWidth > 0)
  const naturalWidth = await images.first().evaluate((el: HTMLImageElement) => el.naturalWidth);
  expect(naturalWidth, 'Photo should have loaded').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

test('albums render with loaded images', async () => {
  const section = page.locator('[data-testid="dev-albums"]');
  await expect(section).toBeVisible();

  const images = section.locator('img');
  const count = await images.count();
  expect(count, 'Expected at least 2 images in album grid').toBeGreaterThanOrEqual(2);

  // Verify at least one is loaded
  const naturalWidth = await images.first().evaluate((el: HTMLImageElement) => el.naturalWidth);
  expect(naturalWidth, 'Album photo should have loaded').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

test('video has metadata', async () => {
  const section = page.locator('[data-testid="dev-videos"]');
  const videos = section.locator('video');
  const count = await videos.count();

  if (count === 0) {
    test.skip(true, 'No videos in Videos section');
    return;
  }

  // Wait for metadata to load
  await videos.first().evaluate(
    (el: HTMLVideoElement) =>
      new Promise<void>((resolve) => {
        if (el.duration > 0) return resolve();
        el.addEventListener('loadedmetadata', () => resolve(), { once: true });
        setTimeout(resolve, 5000); // timeout fallback
      }),
  );

  const duration = await videos.first().evaluate((el: HTMLVideoElement) => el.duration);
  expect(duration, 'Video should have duration > 0').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// GIFs
// ---------------------------------------------------------------------------

test('GIF has autoplay video element', async () => {
  const section = page.locator('[data-testid="dev-gifs"]');
  const videos = section.locator('video[autoplay]');
  const count = await videos.count();

  expect(count, 'Expected at least one autoplay video in GIFs section').toBeGreaterThan(0);

  // Verify it has the right attributes for GIF-like behavior
  const attrs = await videos.first().evaluate((el: HTMLVideoElement) => ({
    autoplay: el.autoplay,
    muted: el.muted,
    loop: el.loop,
    hasSrc: !!el.src,
  }));
  expect(attrs.autoplay, 'GIF video should have autoplay').toBe(true);
  expect(attrs.muted, 'GIF video should be muted').toBe(true);
  expect(attrs.loop, 'GIF video should loop').toBe(true);
  expect(attrs.hasSrc, 'GIF video should have a src').toBe(true);
});

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

test('voice messages are present', async () => {
  const section = page.locator('[data-testid="dev-voice-messages"]');
  await expect(section).toBeVisible();
  // Voice section should have content (waveform bars or audio elements)
  const content = await section.textContent();
  expect(content?.length, 'Voice section should have content').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Text messages
// ---------------------------------------------------------------------------

test('text messages render with content', async () => {
  const section = page.locator('[data-testid="dev-text-messages"]');
  await expect(section).toBeVisible();

  // Should contain at least one message bubble with text
  const text = await section.textContent();
  expect(text).toContain('All good, take your time.');
});

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

test('entities render bold and link formatting', async () => {
  const section = page.locator('[data-testid="dev-entities"]');
  await expect(section).toBeVisible();

  // Check for bold elements
  const bolds = section.locator('strong');
  const boldCount = await bolds.count();
  expect(boldCount, 'Expected bold entities to produce <strong> tags').toBeGreaterThan(0);

  // Check for link elements
  const links = section.locator('a[href]');
  const linkCount = await links.count();
  expect(linkCount, 'Expected URL entities to produce <a> tags').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

test('reactions render with emoji and counts', async () => {
  const section = page.locator('[data-testid="dev-reactions"]');
  await expect(section).toBeVisible();

  const text = await section.textContent();
  // The thumbs up reaction should be visible
  expect(text).toContain('\u{1F44D}');
});

// ---------------------------------------------------------------------------
// Error checks
// ---------------------------------------------------------------------------

test('no console errors during page load', async ({ errors }) => {
  // Filter out network errors (expected when no daemon)
  const realErrors = errors.filter(
    (e) => !e.includes('net::') && !e.includes('Failed to fetch') && !e.includes('ERR_'),
  );
  expect(realErrors, `Console errors: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('no uncaught exceptions', async ({ exceptions }) => {
  expect(exceptions, `Uncaught exceptions: ${exceptions.join(', ')}`).toHaveLength(0);
});
