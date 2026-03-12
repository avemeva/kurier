import type { Page } from '@playwright/test';
import { expect, extractWebVitals, fmt, report, perfTest as test, waitForApp } from '../fixtures';

// ---------------------------------------------------------------------------
// Tests — single navigation, all assertions against same page load
// ---------------------------------------------------------------------------

let page: Page;

test.describe('UI Performance', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ perfPage }) => {
    page = perfPage;
  });

  test('user sees the chat list after opening the app', async () => {
    const start = Date.now();

    await page.goto(
      process.env.BASE_URL || test.info().project.use.baseURL || 'http://localhost:1355',
    );
    const result = await waitForApp(page);

    if (result === 'auth') {
      test.skip(true, 'App is on auth screen — no session available');
      return;
    }
    if (result === 'loading') {
      test.skip(true, 'Dialogs did not load — daemon may be unresponsive');
      return;
    }

    const elapsed = Date.now() - start;
    const dialogCount = await page.locator('[data-testid="dialog-item"]').count();

    console.log('\n  How long until the user sees their chat list?');
    report('Time to first dialog', fmt(elapsed), '< 5s');
    report('Dialogs rendered', `${dialogCount}`);

    expect(elapsed, `Took ${fmt(elapsed)} — user would be staring at a spinner`).toBeLessThan(5000);
  });

  test('user sees messages after clicking a chat', async () => {
    const dialogCount = await page.locator('[data-testid="dialog-item"]').count();
    if (dialogCount === 0) {
      test.skip(true, 'No dialogs loaded — skipping message test');
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

  test('page does not have layout jank or slow paints', async () => {
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
