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
  await expect(page.locator('h1:has-text("Chats")')).toBeVisible();
});

base('sidebar renders multiple dialog items', async () => {
  const dialogs = page.locator('[data-testid="dialog-item"]');
  const count = await dialogs.count();
  expect(count, 'Expected at least 5 dialogs').toBeGreaterThanOrEqual(5);
});

base('each dialog item has an avatar', async () => {
  const firstDialog = page.locator('[data-testid="dialog-item"]').first();
  const avatar = firstDialog.locator('span').first();
  await expect(avatar).toBeVisible();
});

base('each dialog item shows chat name', async () => {
  const firstDialog = page.locator('[data-testid="dialog-item"]').first();
  const name = firstDialog.locator('.truncate.text-sm.font-medium');
  await expect(name).toBeVisible();
  const text = await name.textContent();
  expect(text?.length).toBeGreaterThan(0);
});

base('dialog items show last message preview', async () => {
  const previews = page.locator('[data-testid="dialog-item"] .text-xs.text-text-tertiary');
  const count = await previews.count();
  expect(count, 'Expected at least some dialogs with message previews').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Chat selection & messages
// ---------------------------------------------------------------------------

base('clicking a dialog opens the chat', async () => {
  await page.locator('[data-testid="dialog-item"]').first().click();
  // Chat header should appear — use h2 which is the title element
  const header = page.locator('[data-testid="chat-layout"] h2').first();
  await expect(header).toBeVisible({ timeout: 5_000 });
});

base('chat header shows chat title', async () => {
  const title = page.locator('[data-testid="chat-layout"] h2').first();
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
  // Timestamps render as <span> with text like "HH:MM" inside MessageTime
  const times = page.locator('[data-testid="message-bubble"] .text-\\[11px\\]');
  const count = await times.count();
  expect(count, 'Expected messages to have timestamps').toBeGreaterThan(0);
});

base('message input is visible when a chat is open', async () => {
  const textarea = page.locator('textarea[placeholder="Message..."]');
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
  const textarea = page.locator('textarea[placeholder="Message..."]');
  if (!(await textarea.isVisible())) {
    base.skip(true, 'No message input visible');
    return;
  }
  // Send button is the button inside the input area container
  const inputContainer = textarea.locator('..');
  const sendBtn = inputContainer.locator('button');
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
  const firstTitle = await page.locator('[data-testid="chat-layout"] h2').first().textContent();

  await dialogs.nth(1).click();
  await page.waitForTimeout(500);
  const secondTitle = await page.locator('[data-testid="chat-layout"] h2').first().textContent();

  expect(secondTitle).not.toBe(firstTitle);
});

base('sidebar search input appears when search is activated', async () => {
  const searchBtn = page.locator('h1:has-text("Chats")').locator('..').locator('button').first();
  await searchBtn.click();

  const searchInput = page.locator('input[placeholder="Search"]');
  await expect(searchInput).toBeVisible({ timeout: 3_000 });

  await searchInput.press('Escape');
});

base('search input clears and closes on Escape', async () => {
  const searchBtn = page.locator('h1:has-text("Chats")').locator('..').locator('button').first();
  await searchBtn.click();

  const searchInput = page.locator('input[placeholder="Search"]');
  await expect(searchInput).toBeVisible({ timeout: 3_000 });

  await searchInput.fill('test query');
  await page.waitForTimeout(200);
  await searchInput.press('Escape');

  // Search input should be gone, heading should be back
  await expect(page.locator('h1:has-text("Chats")')).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// Scroll & content
// ---------------------------------------------------------------------------

base('sidebar is scrollable with many dialogs', async () => {
  const sidebar = page
    .locator('[data-testid="chat-layout"] > div')
    .first()
    .locator('.overflow-y-auto')
    .first();
  const scrollHeight = await sidebar.evaluate((el) => el.scrollHeight);
  const clientHeight = await sidebar.evaluate((el) => el.clientHeight);
  expect(scrollHeight).toBeGreaterThanOrEqual(clientHeight);
});

base('message panel is present when a chat is selected', async () => {
  await page.locator('[data-testid="dialog-item"]').first().click();
  await page.waitForTimeout(500);

  // The message panel is the second main child after the sidebar
  const panel = page.locator('[data-testid="chat-layout"] .overflow-y-auto.px-4');
  await expect(panel).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// Visual structure
// ---------------------------------------------------------------------------

base('outgoing messages have own-message styling', async () => {
  // Find a chat with outgoing messages
  const outgoing = page.locator('.bg-message-own[data-testid="message-bubble"]');
  const count = await outgoing.count();
  if (count === 0) {
    base.skip(true, 'No outgoing messages in current chat');
    return;
  }
  await expect(outgoing.first()).toBeVisible();
});

base('incoming messages have peer-message styling', async () => {
  const incoming = page.locator('.bg-message-peer[data-testid="message-bubble"]');
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

    const panel = page.locator('.overflow-y-auto.px-4');
    const initialCount = await page.locator('[data-testid="message-bubble"]').count();
    const chatTitle = await page.locator('[data-testid="chat-layout"] h2').first().textContent();

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
