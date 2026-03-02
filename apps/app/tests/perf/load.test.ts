import { type BrowserContext, test as base, chromium, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the app to reach a usable state after navigation.
 * Returns "dialogs" | "auth" | "loading" (stuck on loading screen, daemon unresponsive).
 */
async function waitForApp(page: Page): Promise<'dialogs' | 'auth' | 'loading'> {
  try {
    return await Promise.any([
      page
        .waitForSelector('[data-testid="dialog-item"]', { timeout: 20_000 })
        .then(() => 'dialogs' as const),
      page.waitForSelector('input[type="tel"]', { timeout: 20_000 }).then(() => 'auth' as const),
    ]);
  } catch {
    return 'loading';
  }
}

/** Format ms as human-friendly string. */
function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

/** Print a check/cross line with metric value vs budget. */
function report(label: string, value: number | string, budget?: string) {
  const line = budget ? `  ${label}: ${value} (budget: ${budget})` : `  ${label}: ${value}`;
  console.log(line);
}

/** Extract Core Web Vitals and resource stats via Performance API. */
async function extractWebVitals(page: Page) {
  return page.evaluate(() => {
    return new Promise<{
      fcp: number | null;
      lcp: number | null;
      cls: number;
      longTaskCount: number;
      longTaskTotalMs: number;
      resourceCount: number;
      transferSizeKb: number;
      topResources: { name: string; duration: number; size: number }[];
    }>((resolve) => {
      // Give LCP a moment to finalize
      setTimeout(() => {
        let fcp: number | null = null;
        let lcp: number | null = null;
        let cls = 0;

        for (const entry of performance.getEntriesByType('paint')) {
          if (entry.name === 'first-contentful-paint') fcp = entry.startTime;
        }

        try {
          const entries = performance.getEntriesByType('largest-contentful-paint' as string);
          if (entries.length > 0) lcp = entries[entries.length - 1].startTime;
        } catch {}

        try {
          for (const entry of performance.getEntriesByType('layout-shift' as string)) {
            const ls = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (!ls.hadRecentInput) cls += ls.value;
          }
        } catch {}

        let longTaskCount = 0;
        let longTaskTotalMs = 0;
        try {
          const entries = performance.getEntriesByType('longtask' as string);
          longTaskCount = entries.length;
          for (const e of entries) longTaskTotalMs += e.duration;
        } catch {}

        const resourceEntries = performance.getEntriesByType(
          'resource',
        ) as PerformanceResourceTiming[];
        let transferSizeKb = 0;
        const resources: { name: string; duration: number; size: number }[] = [];
        for (const e of resourceEntries) {
          transferSizeKb += e.transferSize;
          resources.push({
            name: e.name.split('/').pop() ?? e.name,
            duration: Math.round(e.duration),
            size: e.transferSize,
          });
        }
        resources.sort((a, b) => b.duration - a.duration);

        resolve({
          fcp: fcp ? Math.round(fcp) : null,
          lcp: lcp ? Math.round(lcp) : null,
          cls: Math.round(cls * 1000) / 1000,
          longTaskCount,
          longTaskTotalMs: Math.round(longTaskTotalMs),
          resourceCount: resourceEntries.length,
          transferSizeKb: Math.round(transferSizeKb / 1024),
          topResources: resources.slice(0, 5),
        });
      }, 500);
    });
  });
}

// ---------------------------------------------------------------------------
// Tests — single navigation, all assertions against same page load
// ---------------------------------------------------------------------------

base.describe('UI Performance', () => {
  let browser: ReturnType<typeof chromium.launch> extends Promise<infer T> ? T : never;
  let context: BrowserContext;
  let page: Page;

  base.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
  });

  base.afterAll(async () => {
    await browser?.close();
  });

  base('user sees the chat list after opening the app', async () => {
    const start = Date.now();

    await page.goto(
      process.env.BASE_URL || base.info().project.use.baseURL || 'http://localhost:1355',
    );
    const result = await waitForApp(page);

    if (result === 'auth') {
      base.skip(true, 'App is on auth screen — no session available');
      return;
    }
    if (result === 'loading') {
      base.skip(true, 'Dialogs did not load — daemon may be unresponsive');
      return;
    }

    const elapsed = Date.now() - start;
    const dialogCount = await page.locator('[data-testid="dialog-item"]').count();

    console.log('\n  How long until the user sees their chat list?');
    report('Time to first dialog', fmt(elapsed), '< 5s');
    report('Dialogs rendered', `${dialogCount}`);

    expect(elapsed, `Took ${fmt(elapsed)} — user would be staring at a spinner`).toBeLessThan(5000);
  });

  base('user sees messages after clicking a chat', async () => {
    const dialogCount = await page.locator('[data-testid="dialog-item"]').count();
    if (dialogCount === 0) {
      base.skip(true, 'No dialogs loaded — skipping message test');
      return;
    }

    const start = Date.now();
    await page.click('[data-testid="dialog-item"]');
    await page.waitForSelector('[data-testid="message-bubble"]', { timeout: 10_000 });

    const elapsed = Date.now() - start;
    const msgCount = await page.locator('[data-testid="message-bubble"]').count();

    console.log('\n  How long until messages appear after clicking a chat?');
    report('Time to first message', fmt(elapsed), '< 3s');
    report('Messages rendered', `${msgCount}`);

    expect(elapsed, `Took ${fmt(elapsed)} — chat felt unresponsive`).toBeLessThan(3000);
  });

  base('page does not have layout jank or slow paints', async () => {
    const vitals = await extractWebVitals(page);

    console.log('\n  Does the page paint quickly and stay stable?');

    if (vitals.fcp !== null) report('First Contentful Paint', fmt(vitals.fcp), '< 3s');
    if (vitals.lcp !== null) report('Largest Contentful Paint', fmt(vitals.lcp), '< 5s');
    report('Cumulative Layout Shift', `${vitals.cls}`, '< 0.25');
    report('Long tasks (>50ms main thread blocks)', `${vitals.longTaskCount}`);

    console.log('\n  How heavy is the page?');
    report('Resources loaded', `${vitals.resourceCount}`);
    report('Total transfer size', `${vitals.transferSizeKb} KB`);

    if (vitals.topResources.length > 0) {
      console.log('\n  Slowest resources:');
      for (const r of vitals.topResources) {
        console.log(
          `    ${fmt(r.duration).padStart(8)}  ${r.name} (${Math.round(r.size / 1024)} KB)`,
        );
      }
    }

    if (vitals.fcp !== null) {
      expect(vitals.fcp, `FCP ${fmt(vitals.fcp)} — page is blank for too long`).toBeLessThan(3000);
    }
    if (vitals.lcp !== null) {
      expect(
        vitals.lcp,
        `LCP ${fmt(vitals.lcp)} — main content takes too long to appear`,
      ).toBeLessThan(5000);
    }
    expect(vitals.cls, `CLS ${vitals.cls} — layout is shifting around`).toBeLessThan(0.25);
  });
});
