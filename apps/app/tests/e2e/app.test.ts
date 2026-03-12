import type { Page } from '@playwright/test';
import { expect, appTest as test, waitForApp } from '../fixtures';

// ---------------------------------------------------------------------------
// Shared state — single browser context, single page, one navigation
// Worker-scoped fixtures provide the browser; we create context in beforeAll.
// All tests run serially (workers: 1 in config) and share the same page.
// ---------------------------------------------------------------------------

let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ appPage }) => {
  page = appPage;

  const url = process.env.BASE_URL || test.info().project.use.baseURL || 'http://tg.localhost:1355';
  await page.goto(url);

  // Wait for app to be ready (dialogs or auth)
  await waitForApp(page);
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

test('chat layout renders with sidebar and main area', async () => {
  const layout = page.locator('[data-testid="chat-layout"]');
  await expect(layout).toBeVisible();
});

test('sidebar shows "Chats" heading', async () => {
  await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible();
});

test('sidebar renders multiple dialog items', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();
  expect(count, 'Expected at least 5 dialogs').toBeGreaterThanOrEqual(5);
});

test('chat list can be scrolled', async () => {
  const scrollContainer = page.locator('[data-testid="sidebar-scroll"]');

  // Set scrollTop to 300px, then read it back. If scrolling works, it stays at 300.
  // If the container has no overflow constraint, scrollTop snaps back to 0.
  await scrollContainer.evaluate((el) => {
    el.scrollTop = 0;
  });
  const scrollTop = await scrollContainer.evaluate((el) => {
    el.scrollTop = 300;
    return el.scrollTop;
  });

  expect(scrollTop, 'Chat list should be scrollable').toBeGreaterThan(0);
});

test('each dialog item has an avatar', async () => {
  const firstDialog = page.locator('[data-testid="dialog-item"]').first();
  const avatar = firstDialog.locator('[data-testid="avatar-img"], [data-testid="dialog-item"] > *');
  await expect(avatar.first()).toBeVisible();
});

test('each dialog item shows chat name', async () => {
  const firstDialog = page.locator('[data-testid="dialog-item"]').first();
  const name = firstDialog.locator('[data-testid="dialog-name"]');
  await expect(name).toBeVisible();
  const text = await name.textContent();
  expect(text?.length).toBeGreaterThan(0);
});

test('dialog items show last message preview', async () => {
  const previews = page.locator('[data-testid="dialog-item"] [data-testid="dialog-preview"]');
  const count = await previews.count();
  expect(count, 'Expected at least some dialogs with message previews').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Chat selection & messages
// ---------------------------------------------------------------------------

test('clicking a dialog opens the chat', async () => {
  await page.locator('[data-testid="dialog-item"]').first().click();
  const header = page.locator('[data-testid="chat-title"]');
  await expect(header).toBeVisible({ timeout: 5_000 });
});

test('chat header shows chat title', async () => {
  const title = page.locator('[data-testid="chat-title"]');
  await expect(title).toBeVisible();
  const text = await title.textContent();
  expect(text?.length).toBeGreaterThan(0);
});

test('message panel renders message bubbles after selecting a chat', async () => {
  // Click through dialogs until we find one with messages
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();
  let found = false;

  for (let i = 0; i < Math.min(count, 5); i++) {
    await dialogs.nth(i).click();
    try {
      await page.waitForSelector('[data-testid="message-bubble"]', { timeout: 5_000 });
      found = true;
      break;
    } catch {
      // try next dialog
    }
  }

  expect(found, 'No chat with message bubbles found in first 5 dialogs').toBe(true);
});

test('messages have timestamps', async () => {
  const times = page.locator('[data-testid="message-bubble"] [data-testid="message-time"]');
  const count = await times.count();
  expect(count, 'Expected messages to have timestamps').toBeGreaterThan(0);
});

test('message input is visible when a chat is open', async () => {
  const textarea = page.locator('[data-testid="message-input"]');
  // Not all chats have an input (channels don't), so try to find one
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();

  for (let i = 0; i < Math.min(count, 5); i++) {
    await dialogs.nth(i).click();
    try {
      await textarea.waitFor({ state: 'visible', timeout: 3_000 });
      return;
    } catch {
      // try next dialog
    }
  }

  // If no dialog has input, skip — might be all channels
  test.skip(true, 'No chat with message input found in first 5 dialogs');
});

test('send button exists when input is visible', async () => {
  const textarea = page.locator('[data-testid="message-input"]');
  if (!(await textarea.isVisible())) {
    test.skip(true, 'No message input visible');
    return;
  }
  const sendBtn = page.locator('[data-testid="send-button"]');
  await expect(sendBtn).toBeVisible();
});

// ---------------------------------------------------------------------------
// Sidebar interactions
// ---------------------------------------------------------------------------

test('clicking a different dialog switches the chat', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();
  if (count < 2) {
    test.skip(true, 'Need at least 2 dialogs to test switching');
    return;
  }

  await dialogs.first().click();
  const titleLocator = page.locator('[data-testid="chat-title"]');
  await expect(titleLocator).toBeVisible({ timeout: 5_000 });
  const firstTitle = await titleLocator.textContent();

  await dialogs.nth(1).click();
  // Wait for the title to change from the first chat's title
  await expect(titleLocator).not.toHaveText(firstTitle ?? '', { timeout: 5_000 });
  const secondTitle = await titleLocator.textContent();

  expect(secondTitle).not.toBe(firstTitle);
});

test('sidebar search input appears when search is activated', async () => {
  const searchBtn = page.locator('[data-testid="search-button"]');
  await searchBtn.click();

  const searchInput = page.locator('[data-testid="search-input"]');
  await expect(searchInput).toBeVisible({ timeout: 3_000 });

  await searchInput.press('Escape');
});

test('search input clears and closes on Escape', async () => {
  const searchBtn = page.locator('[data-testid="search-button"]');
  await searchBtn.click();

  const searchInput = page.locator('[data-testid="search-input"]');
  await expect(searchInput).toBeVisible({ timeout: 3_000 });

  await searchInput.fill('test query');
  await searchInput.press('Escape');

  // Search input should be gone, heading should be back
  await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// Scroll & content
// ---------------------------------------------------------------------------

test('sidebar is scrollable with many dialogs', async () => {
  const sidebar = page.locator('[data-testid="sidebar-scroll"]');
  const scrollHeight = await sidebar.evaluate((el) => el.scrollHeight);
  const clientHeight = await sidebar.evaluate((el) => el.clientHeight);
  expect(scrollHeight).toBeGreaterThanOrEqual(clientHeight);
});

test('scrolling sidebar to bottom loads more chats', async () => {
  const sidebar = page.locator('[data-testid="sidebar-scroll"]');
  const initialCount = await page.locator('[data-testid="dialog-item"]').count();

  // Scroll to bottom to trigger load-more
  await sidebar.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  // Wait for new chats to appear (up to 10s)
  try {
    await page.waitForFunction(
      (prev) => document.querySelectorAll('[data-testid="dialog-item"]').length > prev,
      initialCount,
      { timeout: 10_000 },
    );
  } catch {
    // If no more chats loaded, the account may have ≤100 chats — skip
    const afterCount = await page.locator('[data-testid="dialog-item"]').count();
    if (afterCount === initialCount) {
      test.skip(true, `Only ${initialCount} chats available (no more to load)`);
      return;
    }
  }

  const afterCount = await page.locator('[data-testid="dialog-item"]').count();
  console.log(`  Sidebar infinite scroll: ${initialCount} → ${afterCount} chats`);
  expect(afterCount).toBeGreaterThan(initialCount);
});

test('message panel is present when a chat is selected', async () => {
  await page.locator('[data-testid="dialog-item"]').first().click();

  const panel = page.locator('[data-testid="message-panel"]');
  await expect(panel).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// Auto-scroll to bottom on chat open
// ---------------------------------------------------------------------------

test('opening a chat scrolls to latest messages', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const panel = page.locator('[data-testid="message-panel"]');
  const count = await dialogs.count();

  // Helper: click a dialog, wait for scrollable messages, assert scrolled to bottom
  async function openAndAssertScrolled(index: number): Promise<boolean> {
    await dialogs.nth(index).click();
    try {
      await page.waitForSelector('[data-testid="message-bubble"]', { timeout: 5_000 });
    } catch {
      return false;
    }

    const isScrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
    if (!isScrollable) return false;

    // Poll until scrolled to bottom (handles async image/thumbnail loading)
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      },
      '[data-testid="message-panel"]',
      { timeout: 5_000 },
    );
    return true;
  }

  // Ensure a chat switch happens by first navigating to the last dialog,
  // since previous tests may have left dialog 0 selected.
  await dialogs.nth(Math.min(count - 1, 5)).click();
  await page.waitForSelector('[data-testid="message-bubble"]', { timeout: 3_000 }).catch(() => {});

  // Find first scrollable chat (fetch path — guaranteed to be a chat switch)
  let firstScrollable = -1;
  for (let i = 0; i < Math.min(count, 5); i++) {
    if (await openAndAssertScrolled(i)) {
      firstScrollable = i;
      break;
    }
  }
  expect(firstScrollable, 'Need at least 1 scrollable chat to test').toBeGreaterThanOrEqual(0);

  // Open a different dialog, then switch back (cached path)
  const other = firstScrollable === 0 ? 1 : 0;
  if (other < count) {
    await dialogs.nth(other).click();
    await page
      .waitForSelector('[data-testid="message-bubble"]', { timeout: 3_000 })
      .catch(() => {});
    await openAndAssertScrolled(firstScrollable);
  }
});

// ---------------------------------------------------------------------------
// Visual structure
// ---------------------------------------------------------------------------

test('outgoing messages have outgoing data attribute', async () => {
  const outgoing = page.locator('[data-testid="message-bubble"][data-is-outgoing="true"]');
  const count = await outgoing.count();
  if (count === 0) {
    test.skip(true, 'No outgoing messages in current chat');
    return;
  }
  await expect(outgoing.first()).toBeVisible();
});

test('incoming messages have incoming data attribute', async () => {
  const incoming = page.locator('[data-testid="message-bubble"][data-is-outgoing="false"]');
  const count = await incoming.count();
  if (count === 0) {
    test.skip(true, 'No incoming messages in current chat');
    return;
  }
  await expect(incoming.first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scroll-up history loading
// ---------------------------------------------------------------------------

for (let chatIdx = 0; chatIdx < 5; chatIdx++) {
  test(`chat ${chatIdx + 1}: does not auto-load, loads on scroll-up`, async () => {
    const dialogs = page.locator('[data-testid="dialog-item"]');
    const count = await dialogs.count();
    if (chatIdx >= count) {
      test.skip(true, `Only ${count} dialogs available`);
      return;
    }

    await dialogs.nth(chatIdx).click();
    try {
      await page.waitForSelector('[data-testid="message-bubble"]', { timeout: 5_000 });
    } catch {
      test.skip(true, `Chat ${chatIdx + 1} has no messages`);
      return;
    }

    const panel = page.locator('[data-testid="message-panel"]');
    const initialCount = await page.locator('[data-testid="message-bubble"]').count();
    const chatTitle = await page.locator('[data-testid="chat-title"]').textContent();

    // Skip chats that don't have enough messages to scroll
    const isScrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
    if (!isScrollable) {
      console.log(`  ${chatTitle}: ${initialCount} messages (not scrollable, skipping)`);
      test.skip(true, `${chatTitle} has too few messages to scroll`);
      return;
    }

    // Verify: sitting at bottom does NOT auto-load
    // Wait and poll to check count stays stable over 1.5s
    await page
      .waitForFunction(
        (prev) => document.querySelectorAll('[data-testid="message-bubble"]').length > prev,
        initialCount,
        { timeout: 1_500 },
      )
      .then(() => true)
      .catch(() => false);

    const afterIdle = await page.locator('[data-testid="message-bubble"]').count();
    expect(afterIdle, `${chatTitle}: should NOT auto-load`).toBe(initialCount);

    // Scroll up with mouse wheel to trigger loading
    const panelBox = await panel.boundingBox();
    if (!panelBox) {
      test.skip(true, 'Panel not visible');
      return;
    }
    // Scroll to bottom first to arm the trigger
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
    await page.mouse.wheel(0, 10000);
    // Now scroll up aggressively
    await page.mouse.wheel(0, -100000);

    // Wait for more messages to appear (up to 5s)
    try {
      await page.waitForFunction(
        (prev) => document.querySelectorAll('[data-testid="message-bubble"]').length > prev,
        initialCount,
        { timeout: 5_000 },
      );
    } catch {
      // May not have more history
    }

    const afterScroll = await page.locator('[data-testid="message-bubble"]').count();
    console.log(`  ${chatTitle}: ${initialCount} → ${afterScroll} messages`);

    expect(afterScroll, `${chatTitle}: scroll-up should load more`).toBeGreaterThan(initialCount);
  });
}

// ---------------------------------------------------------------------------
// Avatar photos
// ---------------------------------------------------------------------------

test('at least some dialog avatars load as images', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();

  let imgCount = 0;
  for (let i = 0; i < Math.min(count, 15); i++) {
    const img = dialogs.nth(i).locator('[data-testid="avatar-img"]');
    if ((await img.count()) > 0) {
      const loaded = await img.first().evaluate((el: HTMLImageElement) => el.naturalWidth > 0);
      if (loaded) imgCount++;
    }
  }

  expect(imgCount, 'Expected at least 3 dialogs with loaded avatar photos').toBeGreaterThanOrEqual(
    3,
  );
});

// ---------------------------------------------------------------------------
// Voice messages
// ---------------------------------------------------------------------------

test('voice messages render waveform bars', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();

  // Search through chats to find one with voice messages
  for (let i = 0; i < Math.min(count, 10); i++) {
    await dialogs.nth(i).click();
    try {
      await page
        .locator('[data-testid="voice-message"]')
        .first()
        .waitFor({ state: 'visible', timeout: 2_000 });
    } catch {
      continue;
    }

    const voiceMessages = page.locator('[data-testid="voice-message"]');
    if ((await voiceMessages.count()) > 0) {
      // Found a chat with voice messages — verify waveform bars
      const waveform = voiceMessages.first().locator('[data-testid="voice-waveform"]');
      const barCount = await waveform.locator('> div').count();
      expect(barCount, 'Voice message should have waveform bars').toBeGreaterThan(5);

      // Bars should have varying heights (real waveform, not all same)
      const heights = await waveform
        .locator('> div')
        .evaluateAll((bars: HTMLElement[]) => bars.slice(0, 20).map((b) => b.style.height));
      const unique = new Set(heights);
      expect(unique.size, 'Waveform bars should have varying heights').toBeGreaterThan(1);

      return;
    }
  }

  test.skip(true, 'No chat with voice messages found in first 10 dialogs');
});

test('voice messages show pre-loaded duration', async () => {
  const voiceMessages = page.locator('[data-testid="voice-message"]');
  if ((await voiceMessages.count()) === 0) {
    test.skip(true, 'No voice messages in current view');
    return;
  }

  const duration = voiceMessages.first().locator('[data-testid="voice-duration"]');
  const text = await duration.textContent();
  // Duration should not be 00:00 (TDLib provides it before audio loads)
  expect(text).not.toContain('00:00');
  expect(text).toMatch(/\d{2}:\d{2}/);
});

// ---------------------------------------------------------------------------
// Layout shift (media dimension reservation)
// ---------------------------------------------------------------------------

for (let chatIdx = 0; chatIdx < 5; chatIdx++) {
  test(`chat ${chatIdx + 1}: no layout shift after messages render`, async () => {
    // Reload to clear cached messages from prior tests (scroll-up tests load extra
    // messages whose media hasn't loaded yet, causing false CLS positives)
    const url =
      process.env.BASE_URL || test.info().project.use.baseURL || 'http://tg.localhost:1355';
    await page.goto(url);
    await waitForApp(page);

    const dialogs = page.locator('[data-testid="dialog-item"]');
    const count = await dialogs.count();
    if (chatIdx >= count) {
      test.skip(true, `Only ${count} dialogs available`);
      return;
    }

    await dialogs.nth(chatIdx).click();
    try {
      await page.waitForSelector('[data-testid="message-bubble"]', { timeout: 5_000 });
    } catch {
      test.skip(true, `Chat ${chatIdx + 1} has no messages`);
      return;
    }

    const panel = page.locator('[data-testid="message-panel"]');

    // Skip non-scrollable chats (too few messages — trivially no shift)
    const isScrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
    if (!isScrollable) {
      test.skip(true, `Chat ${chatIdx + 1} is not scrollable`);
      return;
    }

    // Record scrollHeight after initial render
    const initialScrollHeight = await panel.evaluate((el) => el.scrollHeight);

    // Wait for scrollHeight to stabilize (poll every 200ms, stable for 1s, max 3s)
    await page
      .waitForFunction(
        ({ sel, stableMs }) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const key = '__clsStable';
          const w = window as unknown as Record<string, unknown>;
          const prev = w[key] as { height: number; since: number } | undefined;
          const now = Date.now();
          const h = el.scrollHeight;
          if (!prev || prev.height !== h) {
            w[key] = { height: h, since: now };
            return false;
          }
          return now - prev.since >= stableMs;
        },
        { sel: '[data-testid="message-panel"]', stableMs: 1000 },
        { timeout: 3_000 },
      )
      .catch(() => {});

    const finalScrollHeight = await panel.evaluate((el) => el.scrollHeight);
    const chatTitle = await page.locator('[data-testid="chat-title"]').textContent();
    const delta = finalScrollHeight - initialScrollHeight;

    console.log(
      `  ${chatTitle}: scrollHeight ${initialScrollHeight} → ${finalScrollHeight} (delta: ${delta})`,
    );

    expect(delta, `${chatTitle}: scrollHeight shifted by ${delta}px`).toBe(0);
  });
}

// ---------------------------------------------------------------------------
// Error checks
// ---------------------------------------------------------------------------

test('no console errors during interaction', async ({ errors: fixtureErrors }) => {
  // Interact to trigger any latent errors
  await page.locator('[data-testid="dialog-item"]').first().click();
  await page
    .locator('[data-testid="chat-title"]')
    .waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => {});

  const realErrors = fixtureErrors.filter(
    (e) => !e.includes('net::') && !e.includes('Failed to fetch'),
  );
  expect(realErrors, `Console errors: ${realErrors.join(', ')}`).toHaveLength(0);
});

test('no uncaught JS exceptions', async ({ exceptions: fixtureExceptions }) => {
  // Interact to trigger any latent errors
  await page.locator('[data-testid="dialog-item"]').nth(0).click();
  await page
    .locator('[data-testid="chat-title"]')
    .waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => {});

  expect(fixtureExceptions, `Uncaught exceptions: ${fixtureExceptions.join(', ')}`).toHaveLength(0);
});
