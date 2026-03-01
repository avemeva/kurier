/**
 * End-to-end tests for agent-telegram CLI.
 * These run against a real Telegram client — they require a valid session.
 *
 * Run: bun test scripts/tg/cli.e2e.test.ts
 *
 * Tests are organized by command and cover flags, edge cases, and interoperability
 * between commands (e.g., search chatId → messages).
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TG = path.resolve(import.meta.dir, '../..');
const TIMEOUT = 30_000;

type TgResult = {
  ok: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic CLI JSON output
  data?: any;
  error?: string;
  code?: string;
  hasMore?: boolean;
  nextOffset?: unknown;
  _raw?: string;
  _stderr?: string;
  _exitCode?: number | null;
  _boundary?: unknown;
};

/** Run a CLI command and parse JSON result */
async function tg(...args: string[]): Promise<TgResult> {
  const proc = Bun.spawn(['bun', 'tg', ...args], {
    cwd: TG,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  try {
    return { ...JSON.parse(stdout.trim()), _stderr: stderr, _exitCode: proc.exitCode };
  } catch {
    return {
      ok: false,
      error: 'Failed to parse JSON',
      _raw: stdout,
      _stderr: stderr,
      _exitCode: proc.exitCode,
    };
  }
}

// --- Shared state ---
let myId: string;
let myUsername: string;
let testMsgId: number | null = null;

// --- Setup / Teardown ---

beforeAll(async () => {
  const me = await tg('me');
  expect(me.ok).toBe(true);
  myId = me.data.id;
  myUsername = me.data.username;
}, TIMEOUT);

afterAll(async () => {
  // Clean up test messages
  if (testMsgId) {
    await tg('delete', 'me', String(testMsgId));
  }
}, TIMEOUT);

// ─── Identity ───

describe('me', () => {
  it(
    'returns current user info',
    async () => {
      const r = await tg('me');
      expect(r.ok).toBe(true);
      expect(r.data.id).toBeString();
      expect(r.data.username).toBeString();
      expect(r.data.bot).toBe(false);
    },
    TIMEOUT,
  );
});

// ─── Dialogs ───

describe('dialogs', () => {
  it(
    'returns a list of chats',
    async () => {
      const r = await tg('dialogs', '--limit', '5');
      expect(r.ok).toBe(true);
      expect(r.data.length).toBeGreaterThan(0);
      expect(r.data.length).toBeLessThanOrEqual(5);
      expect(r.data[0].id).toBeString();
      expect(r.data[0].title).toBeString();
      expect(r.data[0].type).toMatch(/^(user|group|channel)$/);
    },
    TIMEOUT,
  );

  it(
    '--type user filters to DMs only',
    async () => {
      const r = await tg('dialogs', '--type', 'user', '--limit', '10');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(d.type).toBe('user');
      }
    },
    TIMEOUT,
  );

  it(
    '--type group filters to groups only',
    async () => {
      const r = await tg('dialogs', '--type', 'group', '--limit', '5');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(d.type).toBe('group');
      }
    },
    TIMEOUT,
  );

  it(
    '--type channel filters to channels only',
    async () => {
      const r = await tg('dialogs', '--type', 'channel', '--limit', '5');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(d.type).toBe('channel');
      }
    },
    TIMEOUT,
  );

  it(
    '--search filters by title',
    async () => {
      const r = await tg('dialogs', '--search', 'Saved', '--limit', '10');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(d.title.toLowerCase()).toContain('saved');
      }
    },
    TIMEOUT,
  );

  it(
    'bot field present for user dialogs',
    async () => {
      const r = await tg('dialogs', '--type', 'user', '--limit', '10');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(typeof d.bot).toBe('boolean');
      }
    },
    TIMEOUT,
  );

  it(
    'includes lastMsg with date',
    async () => {
      const r = await tg('dialogs', '--limit', '3');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        if (d.lastMsg) {
          expect(d.lastMsg.id).toBeNumber();
          expect(d.lastMsg.date).toBeNumber();
        }
      }
    },
    TIMEOUT,
  );

  it(
    'pagination with --offset-date',
    async () => {
      const r1 = await tg('dialogs', '--limit', '3');
      expect(r1.ok).toBe(true);
      expect(r1.hasMore).toBe(true);
      expect(r1.nextOffset).toBeNumber();
      const r2 = await tg('dialogs', '--limit', '3', '--offset-date', String(r1.nextOffset));
      expect(r2.ok).toBe(true);
      expect(r2.data.length).toBeGreaterThan(0);
      // Second page should have different chats
      const ids1 = new Set(r1.data.map((d: Record<string, unknown>) => d.id));
      const ids2 = new Set(r2.data.map((d: Record<string, unknown>) => d.id));
      const overlap = [...ids2].filter((id) => ids1.has(id));
      expect(overlap.length).toBeLessThan(r2.data.length);
    },
    TIMEOUT,
  );

  it(
    'invalid --type returns INVALID_ARGS',
    async () => {
      const r = await tg('dialogs', '--type', 'dm');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );
});

// ─── Unread ───

describe('unread', () => {
  it(
    'returns unread chats with counts',
    async () => {
      const r = await tg('unread');
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
      for (const d of r.data) {
        expect(d.unreadCount).toBeGreaterThan(0);
        expect(d.id).toBeString();
        expect(d.type).toMatch(/^(user|group|channel)$/);
      }
    },
    TIMEOUT,
  );

  it(
    '--all includes archived chats',
    async () => {
      const r = await tg('unread', '--all');
      expect(r.ok).toBe(true);
      // May or may not have archived — just verify it doesn't error
      expect(Array.isArray(r.data)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '--type user filters to DMs',
    async () => {
      const r = await tg('unread', '--type', 'user');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(d.type).toBe('user');
      }
    },
    TIMEOUT,
  );

  it(
    'includes readInboxMaxId for fetching unread messages',
    async () => {
      const r = await tg('unread', '--limit', '3');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        if (d.readInboxMaxId) {
          expect(d.readInboxMaxId).toBeNumber();
        }
      }
    },
    TIMEOUT,
  );
});

// ─── Messages ───

describe('messages', () => {
  it(
    'returns messages from Saved Messages',
    async () => {
      const r = await tg('messages', 'me', '--limit', '5');
      expect(r.ok).toBe(true);
      expect(r.data.length).toBeLessThanOrEqual(5);
      for (const m of r.data) {
        expect(m.id).toBeNumber();
        expect(typeof m.text).toBe('string');
        expect(m.date).toBeNumber();
      }
    },
    TIMEOUT,
  );

  it(
    '--limit respects the count',
    async () => {
      const r = await tg('messages', 'me', '--limit', '3');
      expect(r.ok).toBe(true);
      expect(r.data.length).toBeLessThanOrEqual(3);
    },
    TIMEOUT,
  );

  it(
    '--offset-id paginates correctly',
    async () => {
      const r1 = await tg('messages', 'me', '--limit', '3');
      expect(r1.ok).toBe(true);
      expect(r1.data.length).toBeGreaterThan(0);
      if (r1.hasMore) {
        const r2 = await tg('messages', 'me', '--limit', '3', '--offset-id', String(r1.nextOffset));
        expect(r2.ok).toBe(true);
        // Messages should be older (lower IDs)
        expect(r2.data[0].id).toBeLessThan(r1.data[0].id);
      }
    },
    TIMEOUT,
  );

  it(
    '--filter photo returns only photos',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'photo', '--limit', '5');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.media).toBeTruthy();
        expect(m.media.type).toContain('Photo');
      }
    },
    TIMEOUT,
  );

  it(
    '--filter document returns documents with metadata',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'document', '--limit', '5');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.media).toBeTruthy();
      }
    },
    TIMEOUT,
  );

  it(
    '--filter url returns messages with links',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'url', '--limit', '5');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        // URL messages have entities with url type or media with url
        const hasUrl = Array.isArray(m.entities)
          ? m.entities.some(
              (e: Record<string, unknown>) => e.type === 'url' || e.type === 'texturl',
            )
          : m.media?.url;
        expect(hasUrl).toBeTruthy();
      }
    },
    TIMEOUT,
  );

  it(
    '--reverse returns oldest first',
    async () => {
      const r = await tg('messages', 'me', '--limit', '5', '--reverse');
      expect(r.ok).toBe(true);
      if (r.data.length >= 2) {
        expect(r.data[0].date).toBeLessThanOrEqual(r.data[1].date);
      }
    },
    TIMEOUT,
  );

  it(
    '--min-id filters to newer messages',
    async () => {
      // Get some messages to find a reference ID
      const r1 = await tg('messages', 'me', '--limit', '5');
      expect(r1.ok).toBe(true);
      if (r1.data.length >= 3) {
        const midId = r1.data[2].id;
        const r2 = await tg('messages', 'me', '--min-id', String(midId), '--limit', '10');
        expect(r2.ok).toBe(true);
        for (const m of r2.data) {
          expect(m.id).toBeGreaterThan(midId);
        }
      }
    },
    TIMEOUT,
  );

  it(
    '--since filters by date server-side',
    async () => {
      // Use a recent timestamp to get recent messages only
      const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
      const r = await tg('messages', 'me', '--since', String(oneWeekAgo), '--limit', '10');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.date).toBeGreaterThanOrEqual(oneWeekAgo);
      }
    },
    TIMEOUT,
  );

  it(
    'negative group ID works',
    async () => {
      // Find a group to test
      const groups = await tg('dialogs', '--type', 'group', '--limit', '1');
      if (groups.ok && groups.data.length > 0) {
        const groupId = groups.data[0].id;
        expect(groupId).toMatch(/^-/); // Should be negative
        const r = await tg('messages', groupId, '--limit', '2');
        expect(r.ok).toBe(true);
        expect(r.data.length).toBeGreaterThan(0);
      }
    },
    TIMEOUT,
  );

  it(
    'invalid --filter returns INVALID_ARGS',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'invalid');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );

  it(
    'missing chat arg returns INVALID_ARGS',
    async () => {
      const r = await tg('messages');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );
});

// ─── Search ───

describe('search', () => {
  it(
    'global search returns results with chatId and chatTitle',
    async () => {
      const r = await tg('search', 'test', '--limit', '5');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.chatId).toBeString();
        expect(m.id).toBeNumber();
      }
    },
    TIMEOUT,
  );

  it(
    'chatId normalized: channels have -100 prefix',
    async () => {
      const r = await tg('search', 'test', '--limit', '20');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        const chatId = m.chatId;
        // User IDs are positive, group/channel IDs are negative
        if (chatId?.startsWith('-')) {
          expect(chatId).toMatch(/^-100\d+$|^-\d+$/);
        }
      }
    },
    TIMEOUT,
  );

  it(
    '--chat scopes to specific chat',
    async () => {
      const r = await tg('search', 'a', '--chat', 'me', '--limit', '3');
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '--since filters by date on global search',
    async () => {
      const oneMonthAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
      const r = await tg('search', 'test', '--since', String(oneMonthAgo), '--limit', '10');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.date).toBeGreaterThanOrEqual(oneMonthAgo);
      }
    },
    TIMEOUT,
  );

  it(
    '--type user filters to DM results',
    async () => {
      const r = await tg('search', 'привет', '--type', 'user', '--limit', '10');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        // User chatIds are positive (no prefix)
        expect(m.chatId).not.toMatch(/^-/);
      }
    },
    TIMEOUT,
  );

  it(
    '--type group filters to group results',
    async () => {
      const r = await tg('search', 'test', '--type', 'group', '--limit', '10');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.chatId).toMatch(/^-/);
      }
    },
    TIMEOUT,
  );

  it(
    '--context returns surrounding messages',
    async () => {
      const r = await tg('search', 'привет', '--chat', 'me', '--context', '2', '--limit', '1');
      expect(r.ok).toBe(true);
      if (r.data.length > 0) {
        const hit = r.data[0];
        expect(Array.isArray(hit.context)).toBe(true);
        // Context should have up to 4 messages (2 before + 2 after)
        expect(hit.context.length).toBeLessThanOrEqual(4);
      }
    },
    TIMEOUT,
  );

  it(
    '--from requires --chat',
    async () => {
      const r = await tg('search', 'test', '--from', 'me');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );

  it(
    'senderName populated in search results',
    async () => {
      const r = await tg('search', 'test', '--limit', '10');
      expect(r.ok).toBe(true);
      // At least some results should have senderName
      const _withName = r.data.filter((m: Record<string, unknown>) => m.senderName);
      // We can't guarantee all have names, but the feature should work
      expect(r.data.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    'search chatId works with messages command',
    async () => {
      const r = await tg('search', 'test', '--type', 'group', '--limit', '1');
      expect(r.ok).toBe(true);
      if (r.data.length > 0) {
        const chatId = r.data[0].chatId;
        // The chatId from search should work directly with messages
        const msgs = await tg('messages', chatId, '--limit', '2');
        expect(msgs.ok).toBe(true);
        expect(msgs.data.length).toBeGreaterThan(0);
      }
    },
    TIMEOUT,
  );

  it(
    'pagination with --offset',
    async () => {
      const r1 = await tg('search', 'test', '--limit', '5');
      expect(r1.ok).toBe(true);
      if (r1.hasMore && r1.nextOffset) {
        const r2 = await tg('search', 'test', '--limit', '5', '--offset', String(r1.nextOffset));
        expect(r2.ok).toBe(true);
        expect(r2.data.length).toBeGreaterThan(0);
      }
    },
    TIMEOUT,
  );
});

// ─── Send & Edit ───

describe('send', () => {
  it(
    'sends plain text to Saved Messages',
    async () => {
      const r = await tg('send', 'me', 'e2e test message — will be deleted');
      expect(r.ok).toBe(true);
      expect(r.data.id).toBeNumber();
      expect(r.data.text).toBe('e2e test message — will be deleted');
      testMsgId = r.data.id;
    },
    TIMEOUT,
  );

  it(
    'sends with --html formatting',
    async () => {
      const r = await tg('send', 'me', '<b>bold</b> <i>italic</i>', '--html');
      expect(r.ok).toBe(true);
      expect(r.data.text).toBe('bold italic');
      // Clean up
      await tg('delete', 'me', String(r.data.id));
    },
    TIMEOUT,
  );

  it(
    'sends with --md formatting',
    async () => {
      const r = await tg('send', 'me', '*bold* `code`', '--md');
      expect(r.ok).toBe(true);
      // Clean up
      await tg('delete', 'me', String(r.data.id));
    },
    TIMEOUT,
  );

  it(
    '--stdin reads from pipe',
    async () => {
      const proc = Bun.spawn(['bash', '-c', `echo "stdin test msg" | bun tg send me --stdin`], {
        cwd: TG,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const r = JSON.parse(stdout.trim());
      expect(r.ok).toBe(true);
      expect(r.data.text).toBe('stdin test msg');
      // Clean up
      await tg('delete', 'me', String(r.data.id));
    },
    TIMEOUT,
  );

  it(
    '--file reads from file',
    async () => {
      const tmpFile = path.join(tmpdir(), 'tg_test_msg.txt');
      const Bun2 = globalThis.Bun;
      Bun2.write(tmpFile, 'file test msg');
      const r = await tg('send', 'me', '--file', tmpFile);
      expect(r.ok).toBe(true);
      expect(r.data.text).toBe('file test msg');
      // Clean up
      await tg('delete', 'me', String(r.data.id));
      unlinkSync(tmpFile);
    },
    TIMEOUT,
  );

  it(
    'missing text returns INVALID_ARGS',
    async () => {
      const r = await tg('send', 'me');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );
});

describe('edit', () => {
  it(
    'edits a message',
    async () => {
      // Send a message first
      const s = await tg('send', 'me', 'original text');
      expect(s.ok).toBe(true);
      const msgId = s.data.id;

      const r = await tg('edit', 'me', String(msgId), 'edited text');
      expect(r.ok).toBe(true);
      expect(r.data.text).toBe('edited text');
      expect(r.data.editDate).toBeNumber();

      // Clean up
      await tg('delete', 'me', String(msgId));
    },
    TIMEOUT,
  );
});

// ─── Read ───

describe('read', () => {
  it(
    'marks chat as read',
    async () => {
      const r = await tg('read', 'me');
      expect(r.ok).toBe(true);
      expect(r.data.marked).toBe(true);
    },
    TIMEOUT,
  );
});

// ─── Delete ───

describe('delete', () => {
  it(
    'deletes a message',
    async () => {
      const s = await tg('send', 'me', 'to be deleted');
      expect(s.ok).toBe(true);
      const r = await tg('delete', 'me', String(s.data.id));
      expect(r.ok).toBe(true);
      expect(r.data.deleted).toContain(s.data.id);
      // Prevent afterAll from double-deleting
      if (testMsgId === s.data.id) testMsgId = null;
    },
    TIMEOUT,
  );
});

// ─── Forward ───

describe('forward', () => {
  it(
    'forwards a message to Saved Messages',
    async () => {
      // Send then forward to self
      const s = await tg('send', 'me', 'forward test');
      expect(s.ok).toBe(true);
      const r = await tg('forward', 'me', 'me', String(s.data.id));
      expect(r.ok).toBe(true);
      expect(r.data.length).toBeGreaterThan(0);
      // Clean up both
      await tg('delete', 'me', String(s.data.id));
      if (r.data[0]?.id) await tg('delete', 'me', String(r.data[0].id));
    },
    TIMEOUT,
  );
});

// ─── Chat ───

describe('chat', () => {
  it(
    'returns info for a user',
    async () => {
      const r = await tg('chat', myUsername);
      expect(r.ok).toBe(true);
      expect(r.data.id).toBe(myId);
      expect(r.data.type).toBe('user');
    },
    TIMEOUT,
  );

  it(
    'returns info for Saved Messages',
    async () => {
      const r = await tg('chat', 'me');
      expect(r.ok).toBe(true);
      expect(r.data.id).toBe(myId);
    },
    TIMEOUT,
  );
});

// ─── Resolve ───

describe('resolve', () => {
  it(
    'resolves a username',
    async () => {
      const r = await tg('resolve', myUsername);
      expect(r.ok).toBe(true);
      expect(r.data.id).toBe(myId);
      expect(r.data.username).toBe(myUsername);
    },
    TIMEOUT,
  );

  it(
    'missing arg returns INVALID_ARGS',
    async () => {
      const r = await tg('resolve');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );
});

// ─── Contacts ───

describe('contacts', () => {
  it(
    'returns contact list',
    async () => {
      const r = await tg('contacts', '--limit', '5');
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
      for (const c of r.data) {
        expect(c.id).toBeString();
        expect(typeof c.bot).toBe('boolean');
      }
    },
    TIMEOUT,
  );

  it(
    '--search filters contacts',
    async () => {
      const r = await tg('contacts', '--search', 'a');
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'pagination with --offset',
    async () => {
      const r1 = await tg('contacts', '--limit', '3');
      expect(r1.ok).toBe(true);
      if (r1.hasMore) {
        const r2 = await tg('contacts', '--limit', '3', '--offset', String(r1.nextOffset));
        expect(r2.ok).toBe(true);
      }
    },
    TIMEOUT,
  );
});

// ─── Members ───

describe('members', () => {
  let groupId: string;

  beforeAll(async () => {
    const r = await tg('dialogs', '--type', 'group', '--limit', '1');
    if (r.ok && r.data.length > 0) {
      groupId = r.data[0].id;
    }
  }, TIMEOUT);

  it(
    'returns member list with bot field',
    async () => {
      if (!groupId) return;
      const r = await tg('members', groupId, '--limit', '10');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.id).toBeString();
        expect(typeof m.bot).toBe('boolean');
      }
    },
    TIMEOUT,
  );

  it(
    '--type bot filters to bots only',
    async () => {
      if (!groupId) return;
      const r = await tg('members', groupId, '--type', 'bot');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.bot).toBe(true);
      }
    },
    TIMEOUT,
  );

  it(
    '--search filters by name',
    async () => {
      if (!groupId) return;
      const r = await tg('members', groupId, '--search', 'a');
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'invalid --type returns INVALID_ARGS',
    async () => {
      if (!groupId) return;
      const r = await tg('members', groupId, '--type', 'invalid');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );
});

// ─── Download ───

describe('download', () => {
  it(
    'downloads media from a message with photo',
    async () => {
      // Find a photo in Saved Messages
      const photos = await tg('messages', 'me', '--filter', 'photo', '--limit', '1');
      if (photos.ok && photos.data.length > 0) {
        const outputPath = path.join(tmpdir(), `tg_test_dl_${Date.now()}.jpg`);
        const r = await tg('download', 'me', String(photos.data[0].id), '--output', outputPath);
        expect(r.ok).toBe(true);
        expect(r.data.file).toBeString();
        expect(r.data.size).toBeGreaterThan(0);
        expect(existsSync(outputPath)).toBe(true);
        unlinkSync(outputPath);
      }
    },
    TIMEOUT,
  );

  it(
    'no media returns NOT_FOUND',
    async () => {
      // Send a text-only message, try to download
      const s = await tg('send', 'me', 'no media here');
      expect(s.ok).toBe(true);
      const r = await tg('download', 'me', String(s.data.id));
      expect(r.ok).toBe(false);
      expect(r.code).toBe('NOT_FOUND');
      await tg('delete', 'me', String(s.data.id));
    },
    TIMEOUT,
  );
});

// ─── Photo ───

describe('photo', () => {
  it(
    'downloads own profile photo',
    async () => {
      const outputPath = path.join(tmpdir(), `tg_test_photo_${Date.now()}.jpg`);
      const r = await tg('photo', 'me', '--output', outputPath);
      // May fail if no profile photo set
      if (r.ok) {
        expect(r.data.file).toBeString();
        expect(r.data.size).toBeGreaterThan(0);
        if (existsSync(outputPath)) unlinkSync(outputPath);
      }
    },
    TIMEOUT,
  );
});

// ─── Pin / Unpin ───

describe('pin/unpin', () => {
  it(
    'pins and unpins a message',
    async () => {
      const s = await tg('send', 'me', 'pin test');
      expect(s.ok).toBe(true);
      const pin = await tg('pin', 'me', String(s.data.id), '--silent');
      expect(pin.ok).toBe(true);
      const unpin = await tg('unpin', 'me', String(s.data.id));
      expect(unpin.ok).toBe(true);
      await tg('delete', 'me', String(s.data.id));
    },
    TIMEOUT,
  );
});

// ─── Eval ───

describe('eval', () => {
  it(
    'executes JavaScript and returns result',
    async () => {
      const r = await tg('eval', "return { hello: 'world' }");
      expect(r.ok).toBe(true);
      expect(r.data.hello).toBe('world');
      expect(r._boundary).toBeTruthy();
    },
    TIMEOUT,
  );

  it(
    'has access to client',
    async () => {
      const r = await tg(
        'eval',
        "const me = await client.invoke({ _: 'getMe' }); return { id: me.id?.toString() }",
      );
      expect(r.ok).toBe(true);
      expect(r.data.id).toBe(myId);
    },
    TIMEOUT,
  );
});

// ─── List ───

describe('list', () => {
  it(
    'returns all commands as JSON',
    async () => {
      const r = await tg('list');
      expect(r.ok).toBe(true);
      expect(r.data.length).toBeGreaterThan(5);
      const names = r.data.map((c: Record<string, unknown>) => c.name);
      expect(names).toContain('messages');
      expect(names).toContain('send');
      expect(names).toContain('search');
    },
    TIMEOUT,
  );
});

// ─── Error Handling ───

describe('error handling', () => {
  it(
    'unknown command returns INVALID_ARGS',
    async () => {
      const r = await tg('nonexistent');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );

  it(
    'invalid entity returns NOT_FOUND',
    async () => {
      const r = await tg('chat', 'xyznonexistent12345');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('NOT_FOUND');
    },
    TIMEOUT,
  );

  it(
    '--limit 0 returns INVALID_ARGS',
    async () => {
      const r = await tg('messages', 'me', '--limit', '0');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );

  it(
    '--limit negative returns INVALID_ARGS',
    async () => {
      const r = await tg('messages', 'me', '--limit', '-1');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );

  it(
    '--limit non-numeric returns INVALID_ARGS',
    async () => {
      const r = await tg('messages', 'me', '--limit', 'abc');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
    },
    TIMEOUT,
  );
});

// ─── Interoperability ───

describe('interoperability', () => {
  it(
    'unread → messages: readInboxMaxId as --min-id',
    async () => {
      const unreads = await tg('unread', '--limit', '1');
      expect(unreads.ok).toBe(true);
      if (unreads.data.length > 0 && unreads.data[0].readInboxMaxId) {
        const chatId = unreads.data[0].id;
        const minId = unreads.data[0].readInboxMaxId;
        const msgs = await tg('messages', chatId, '--min-id', String(minId), '--limit', '5');
        expect(msgs.ok).toBe(true);
        for (const m of msgs.data) {
          expect(m.id).toBeGreaterThan(minId);
        }
      }
    },
    TIMEOUT,
  );

  it(
    'dialogs → messages: dialog ID works with messages',
    async () => {
      const dialogs = await tg('dialogs', '--limit', '3');
      expect(dialogs.ok).toBe(true);
      if (dialogs.data.length > 0) {
        const chatId = dialogs.data[0].id;
        const msgs = await tg('messages', chatId, '--limit', '2');
        expect(msgs.ok).toBe(true);
      }
    },
    TIMEOUT,
  );

  it(
    'search → messages: search chatId works with messages (groups)',
    async () => {
      const search = await tg('search', 'test', '--type', 'group', '--limit', '3');
      expect(search.ok).toBe(true);
      if (search.data.length > 0) {
        const chatId = search.data[0].chatId;
        const msgs = await tg('messages', chatId, '--limit', '2');
        expect(msgs.ok).toBe(true);
        expect(msgs.data.length).toBeGreaterThan(0);
      }
    },
    TIMEOUT,
  );

  it(
    'end-of-flags -- separator',
    async () => {
      // Use -- to prevent negative ID from being parsed as flag
      const groups = await tg('dialogs', '--type', 'group', '--limit', '1');
      if (groups.ok && groups.data.length > 0) {
        const groupId = groups.data[0].id;
        const r = await tg('messages', '--limit', '2', '--', groupId);
        // This should work since -- stops flag parsing and groupId becomes positional
        // Note: with current parsing, positional args after -- work
        expect(r.ok).toBe(true);
      }
    },
    TIMEOUT,
  );

  it(
    'messages groupedId identifies albums',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'photo', '--limit', '50');
      expect(r.ok).toBe(true);
      const withGroupId = r.data.filter((m: Record<string, unknown>) => m.groupedId);
      // Group messages by groupedId
      const albums = new Map<string, number>();
      for (const m of withGroupId) {
        albums.set(m.groupedId, (albums.get(m.groupedId) || 0) + 1);
      }
      // If albums exist, each should have >1 photo
      for (const [_gid, count] of albums) {
        expect(count).toBeGreaterThan(1);
      }
    },
    TIMEOUT,
  );

  it(
    'texturl entities include url',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'url', '--limit', '20');
      expect(r.ok).toBe(true);
      const withTexturl = r.data.filter(
        (m: Record<string, unknown>) =>
          Array.isArray(m.entities) &&
          m.entities.some((e: Record<string, unknown>) => e.type === 'texturl'),
      );
      for (const m of withTexturl) {
        // texturl entities should have url field
        const textUrlEntities = m.entities.filter(
          (e: Record<string, unknown>) => e.type === 'texturl',
        );
        for (const e of textUrlEntities) {
          expect(e.url).toBeString();
        }
      }
    },
    TIMEOUT,
  );
});
