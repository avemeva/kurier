import { type BrowserContext, test as base, chromium, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared setup — single browser, single page, one navigation
// ---------------------------------------------------------------------------

let browser: ReturnType<typeof chromium.launch> extends Promise<infer T> ? T : never;
let context: BrowserContext;
let page: Page;

base.beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();

  const url = process.env.BASE_URL || base.info().project.use.baseURL || 'http://tg.localhost:1355';
  await page.goto(url);

  // Wait for app to be ready (dialogs or auth)
  try {
    await Promise.any([
      page.waitForSelector('[data-testid="dialog-item"]', { timeout: 20_000 }),
      page.waitForSelector('input[type="tel"]', { timeout: 20_000 }),
    ]);
  } catch {
    // stuck on loading
  }
});

base.afterAll(async () => {
  await browser?.close();
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

base('chat layout renders with sidebar and main area', async () => {
  const layout = page.locator('[data-testid="chat-layout"]');
  await expect(layout).toBeVisible();
});

base('sidebar shows "Chats" heading', async () => {
  await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible();
});

base('sidebar renders multiple dialog items', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();
  expect(count, 'Expected at least 5 dialogs').toBeGreaterThanOrEqual(5);
});

base('chat list can be scrolled', async () => {
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

base('each dialog item has an avatar', async () => {
  const firstDialog = page.locator('[data-testid="dialog-item"]').first();
  const avatar = firstDialog.locator('[data-testid="avatar-img"], [data-testid="dialog-item"] > *');
  await expect(avatar.first()).toBeVisible();
});

base('each dialog item shows chat name', async () => {
  const firstDialog = page.locator('[data-testid="dialog-item"]').first();
  const name = firstDialog.locator('[data-testid="dialog-name"]');
  await expect(name).toBeVisible();
  const text = await name.textContent();
  expect(text?.length).toBeGreaterThan(0);
});

base('dialog items show last message preview', async () => {
  const previews = page.locator('[data-testid="dialog-item"] [data-testid="dialog-preview"]');
  const count = await previews.count();
  expect(count, 'Expected at least some dialogs with message previews').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Chat selection & messages
// ---------------------------------------------------------------------------

base('clicking a dialog opens the chat', async () => {
  await page.locator('[data-testid="dialog-item"]').first().click();
  const header = page.locator('[data-testid="chat-title"]');
  await expect(header).toBeVisible({ timeout: 5_000 });
});

base('chat header shows chat title', async () => {
  const title = page.locator('[data-testid="chat-title"]');
  await expect(title).toBeVisible();
  const text = await title.textContent();
  expect(text?.length).toBeGreaterThan(0);
});

base('message panel renders message bubbles after selecting a chat', async () => {
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

base('messages have timestamps', async () => {
  const times = page.locator('[data-testid="message-bubble"] [data-testid="message-time"]');
  const count = await times.count();
  expect(count, 'Expected messages to have timestamps').toBeGreaterThan(0);
});

base('message input is visible when a chat is open', async () => {
  const textarea = page.locator('[data-testid="message-input"]');
  // Not all chats have an input (channels don't), so try to find one
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();

  for (let i = 0; i < Math.min(count, 5); i++) {
    await dialogs.nth(i).click();
    await page.waitForTimeout(500);
    if (await textarea.isVisible()) return;
  }

  // If no dialog has input, skip — might be all channels
  base.skip(true, 'No chat with message input found in first 5 dialogs');
});

base('send button exists when input is visible', async () => {
  const textarea = page.locator('[data-testid="message-input"]');
  if (!(await textarea.isVisible())) {
    base.skip(true, 'No message input visible');
    return;
  }
  const sendBtn = page.locator('[data-testid="send-button"]');
  await expect(sendBtn).toBeVisible();
});

// ---------------------------------------------------------------------------
// Sidebar interactions
// ---------------------------------------------------------------------------

base('clicking a different dialog switches the chat', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();
  if (count < 2) {
    base.skip(true, 'Need at least 2 dialogs to test switching');
    return;
  }

  await dialogs.first().click();
  await page.waitForTimeout(500);
  const firstTitle = await page.locator('[data-testid="chat-title"]').textContent();

  await dialogs.nth(1).click();
  await page.waitForTimeout(500);
  const secondTitle = await page.locator('[data-testid="chat-title"]').textContent();

  expect(secondTitle).not.toBe(firstTitle);
});

base('sidebar search input appears when search is activated', async () => {
  const searchBtn = page.locator('[data-testid="search-button"]');
  await searchBtn.click();

  const searchInput = page.locator('[data-testid="search-input"]');
  await expect(searchInput).toBeVisible({ timeout: 3_000 });

  await searchInput.press('Escape');
});

base('search input clears and closes on Escape', async () => {
  const searchBtn = page.locator('[data-testid="search-button"]');
  await searchBtn.click();

  const searchInput = page.locator('[data-testid="search-input"]');
  await expect(searchInput).toBeVisible({ timeout: 3_000 });

  await searchInput.fill('test query');
  await page.waitForTimeout(200);
  await searchInput.press('Escape');

  // Search input should be gone, heading should be back
  await expect(page.locator('[data-testid="sidebar-heading"]')).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// Scroll & content
// ---------------------------------------------------------------------------

base('sidebar is scrollable with many dialogs', async () => {
  const sidebar = page.locator('[data-testid="sidebar-scroll"]');
  const scrollHeight = await sidebar.evaluate((el) => el.scrollHeight);
  const clientHeight = await sidebar.evaluate((el) => el.clientHeight);
  expect(scrollHeight).toBeGreaterThanOrEqual(clientHeight);
});

base('scrolling sidebar to bottom loads more chats', async () => {
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
      base.skip(true, `Only ${initialCount} chats available (no more to load)`);
      return;
    }
  }

  const afterCount = await page.locator('[data-testid="dialog-item"]').count();
  console.log(`  Sidebar infinite scroll: ${initialCount} → ${afterCount} chats`);
  expect(afterCount).toBeGreaterThan(initialCount);
});

base('message panel is present when a chat is selected', async () => {
  await page.locator('[data-testid="dialog-item"]').first().click();
  await page.waitForTimeout(500);

  const panel = page.locator('[data-testid="message-panel"]');
  await expect(panel).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// Visual structure
// ---------------------------------------------------------------------------

base('outgoing messages have outgoing data attribute', async () => {
  const outgoing = page.locator('[data-testid="message-bubble"][data-is-outgoing="true"]');
  const count = await outgoing.count();
  if (count === 0) {
    base.skip(true, 'No outgoing messages in current chat');
    return;
  }
  await expect(outgoing.first()).toBeVisible();
});

base('incoming messages have incoming data attribute', async () => {
  const incoming = page.locator('[data-testid="message-bubble"][data-is-outgoing="false"]');
  const count = await incoming.count();
  if (count === 0) {
    base.skip(true, 'No incoming messages in current chat');
    return;
  }
  await expect(incoming.first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scroll-up history loading
// ---------------------------------------------------------------------------

for (let chatIdx = 0; chatIdx < 5; chatIdx++) {
  base(`chat ${chatIdx + 1}: does not auto-load, loads on scroll-up`, async () => {
    const dialogs = page.locator('[data-testid="dialog-item"]');
    const count = await dialogs.count();
    if (chatIdx >= count) {
      base.skip(true, `Only ${count} dialogs available`);
      return;
    }

    await dialogs.nth(chatIdx).click();
    try {
      await page.waitForSelector('[data-testid="message-bubble"]', { timeout: 5_000 });
    } catch {
      base.skip(true, `Chat ${chatIdx + 1} has no messages`);
      return;
    }

    const panel = page.locator('[data-testid="message-panel"]');
    const initialCount = await page.locator('[data-testid="message-bubble"]').count();
    const chatTitle = await page.locator('[data-testid="chat-title"]').textContent();

    // Skip chats that don't have enough messages to scroll
    const isScrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
    if (!isScrollable) {
      console.log(`  ${chatTitle}: ${initialCount} messages (not scrollable, skipping)`);
      base.skip(true, `${chatTitle} has too few messages to scroll`);
      return;
    }

    // Verify: sitting at bottom does NOT auto-load
    await page.waitForTimeout(1500);
    const afterIdle = await page.locator('[data-testid="message-bubble"]').count();
    expect(afterIdle, `${chatTitle}: should NOT auto-load`).toBe(initialCount);

    // Scroll up with mouse wheel to trigger loading
    const panelBox = await panel.boundingBox();
    if (!panelBox) {
      base.skip(true, 'Panel not visible');
      return;
    }
    // Scroll to bottom first to arm the trigger
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
    await page.mouse.wheel(0, 10000);
    await page.waitForTimeout(300);
    // Now scroll up aggressively
    await page.mouse.wheel(0, -100000);
    await page.waitForTimeout(3000);

    const afterScroll = await page.locator('[data-testid="message-bubble"]').count();
    console.log(`  ${chatTitle}: ${initialCount} → ${afterScroll} messages`);

    expect(afterScroll, `${chatTitle}: scroll-up should load more`).toBeGreaterThan(initialCount);
  });
}

// ---------------------------------------------------------------------------
// Avatar photos
// ---------------------------------------------------------------------------

base('at least some dialog avatars load as images', async () => {
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

base('voice messages render waveform bars', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();

  // Search through chats to find one with voice messages
  for (let i = 0; i < Math.min(count, 10); i++) {
    await dialogs.nth(i).click();
    await page.waitForTimeout(500);

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

  base.skip(true, 'No chat with voice messages found in first 10 dialogs');
});

base('voice messages show pre-loaded duration', async () => {
  const voiceMessages = page.locator('[data-testid="voice-message"]');
  if ((await voiceMessages.count()) === 0) {
    base.skip(true, 'No voice messages in current view');
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
  base(`chat ${chatIdx + 1}: no layout shift after messages render`, async () => {
    const dialogs = page.locator('[data-testid="dialog-item"]');
    const count = await dialogs.count();
    if (chatIdx >= count) {
      base.skip(true, `Only ${count} dialogs available`);
      return;
    }

    await dialogs.nth(chatIdx).click();
    try {
      await page.waitForSelector('[data-testid="message-bubble"]', { timeout: 5_000 });
    } catch {
      base.skip(true, `Chat ${chatIdx + 1} has no messages`);
      return;
    }

    const panel = page.locator('[data-testid="message-panel"]');

    // Skip non-scrollable chats (too few messages — trivially no shift)
    const isScrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
    if (!isScrollable) {
      base.skip(true, `Chat ${chatIdx + 1} is not scrollable`);
      return;
    }

    // Record scrollHeight after initial render
    const initialScrollHeight = await panel.evaluate((el) => el.scrollHeight);

    // Wait 2s for async media loads (images, videos, stickers)
    await page.waitForTimeout(2000);

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

base('no console errors during interaction', async () => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.locator('[data-testid="dialog-item"]').first().click();
  await page.waitForTimeout(1000);

  const realErrors = errors.filter((e) => !e.includes('net::') && !e.includes('Failed to fetch'));
  expect(realErrors, `Console errors: ${realErrors.join(', ')}`).toHaveLength(0);
});

base('no uncaught JS exceptions', async () => {
  const exceptions: string[] = [];
  page.on('pageerror', (err) => exceptions.push(err.message));

  await page.locator('[data-testid="dialog-item"]').nth(0).click();
  await page.waitForTimeout(1000);

  expect(exceptions, `Uncaught exceptions: ${exceptions.join(', ')}`).toHaveLength(0);
});
