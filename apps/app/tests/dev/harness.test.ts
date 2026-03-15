import type { Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fixture manifest type
// ---------------------------------------------------------------------------

interface ManifestEntry {
  name: string;
  description?: string;
  contentKind?: string;
}

// ---------------------------------------------------------------------------
// Worker-scoped fixtures — single browser context shared across all tests
// ---------------------------------------------------------------------------

type DevWorkerFixtures = {
  devPage: Page;
  consoleErrors: string[];
};

// biome-ignore lint/complexity/noBannedTypes: Playwright's extend API requires {} for no test-scoped fixtures
const devTest = base.extend<{}, DevWorkerFixtures>({
  devPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
  consoleErrors: [
    async ({ devPage }, use) => {
      const errors: string[] = [];
      devPage.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await use(errors);
    },
    { scope: 'worker' },
  ],
});

// ---------------------------------------------------------------------------
// Fetch manifest and generate tests
// ---------------------------------------------------------------------------

async function fetchManifest(page: Page, url: string): Promise<ManifestEntry[]> {
  const response = await page.request.get(`${url}/dev/fixtures/manifest.json`);
  expect(response.ok(), 'manifest.json should be accessible').toBe(true);
  return response.json();
}

devTest.describe.configure({ mode: 'serial' });

devTest.describe('dev harness fixtures', () => {
  let page: Page;
  let consoleErrors: string[];
  let manifest: ManifestEntry[];

  devTest.beforeAll(async ({ devPage, consoleErrors: errors }) => {
    page = devPage;
    consoleErrors = errors;

    const url =
      process.env.BASE_URL || devTest.info().project.use.baseURL || 'http://tg.localhost:1355';
    manifest = await fetchManifest(page, url);
    expect(manifest.length, 'manifest should contain fixtures').toBeGreaterThan(0);
  });

  devTest('manifest is loaded', () => {
    expect(manifest.length).toBeGreaterThan(0);
  });

  // We generate fixture tests dynamically inside beforeAll, but Playwright
  // requires static test definitions. Instead, we iterate in a single test
  // that runs all fixtures sequentially and reports per-fixture.
  // However, for clear per-fixture reporting, we use a loop pattern.

  // Note: Playwright does not support dynamic test generation inside describe
  // after beforeAll. So we use a single test that iterates all fixtures.
  devTest('all fixtures render correctly', async () => {
    const url =
      process.env.BASE_URL || devTest.info().project.use.baseURL || 'http://tg.localhost:1355';

    for (const entry of manifest) {
      // Clear console errors before each fixture
      consoleErrors.length = 0;

      // Navigate to the fixture page
      await page.goto(`${url}/dev/fixture/${entry.name}`);
      // Wait for either message or sidebar fixture to render
      await page.waitForSelector("[data-testid='fixture-message'], [data-testid='fixture-meta']", {
        timeout: 10_000,
      });

      // Take a screenshot with the fixture name
      // Video/animation fixtures may render different frames — allow some pixel diff
      const hasVideo =
        ['video', 'animation', 'videoNote', 'reactions'].includes(entry.contentKind ?? '') ||
        (entry.name ?? '').includes('video') ||
        (entry.name ?? '').includes('animation');
      await expect(page).toHaveScreenshot(`${entry.name}.png`, {
        fullPage: false,
        maxDiffPixelRatio: hasVideo ? 0.1 : 0.01,
      });

      // Assert no real console errors (filter out expected network noise)
      const realErrors = consoleErrors.filter(
        (e) =>
          !e.includes('net::') &&
          !e.includes('Failed to fetch') &&
          !e.includes('404') &&
          !e.includes('Outdated Optimize Dep') &&
          !e.includes('ancestor stack trace') &&
          !e.includes('cannot be a descendant'),
      );
      expect(
        realErrors,
        `Console errors on fixture "${entry.name}": ${realErrors.join(', ')}`,
      ).toHaveLength(0);
    }
  });
});
