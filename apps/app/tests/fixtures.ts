import { test as base, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the app to reach a usable state after navigation.
 * Returns "dialogs" | "auth" | "loading" (stuck on loading screen, daemon unresponsive).
 */
export async function waitForApp(page: Page): Promise<'dialogs' | 'auth' | 'loading'> {
  const result = await Promise.race([
    page
      .waitForSelector('[data-testid="dialog-item"]', { timeout: 20_000 })
      .then(() => 'dialogs' as const)
      .catch(() => null),
    page
      .waitForSelector('input[type="tel"]', { timeout: 20_000 })
      .then(() => 'auth' as const)
      .catch(() => null),
  ]);
  return result ?? 'loading';
}

/** Format ms as human-friendly string. */
export function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

/** Print a check/cross line with metric value vs budget. */
export function report(label: string, value: number | string, budget?: string) {
  const line = budget ? `  ${label}: ${value} (budget: ${budget})` : `  ${label}: ${value}`;
  console.log(line);
}

/** Extract Core Web Vitals and resource stats via Performance API. */
export async function extractWebVitals(page: Page) {
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
// App test fixture — all worker-scoped for use in beforeAll
// ---------------------------------------------------------------------------

type AppWorkerFixtures = {
  appPage: Page;
  errors: string[];
  exceptions: string[];
};

// biome-ignore lint/complexity/noBannedTypes: Playwright's extend API requires {} for no test-scoped fixtures
export const appTest = base.extend<{}, AppWorkerFixtures>({
  appPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
  errors: [
    async ({ appPage }, use) => {
      const errors: string[] = [];
      appPage.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await use(errors);
    },
    { scope: 'worker' },
  ],
  exceptions: [
    async ({ appPage }, use) => {
      const exceptions: string[] = [];
      appPage.on('pageerror', (err) => exceptions.push(err.message));
      await use(exceptions);
    },
    { scope: 'worker' },
  ],
});

// ---------------------------------------------------------------------------
// Perf test fixture — worker-scoped page, no auto-navigation
// ---------------------------------------------------------------------------

type PerfWorkerFixtures = {
  perfPage: Page;
};

// biome-ignore lint/complexity/noBannedTypes: Playwright's extend API requires {} for no test-scoped fixtures
export const perfTest = base.extend<{}, PerfWorkerFixtures>({
  perfPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
});

export { expect };
