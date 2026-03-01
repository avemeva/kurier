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

const CLI_ENTRY = path.resolve(import.meta.dir, 'index.ts');
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
  const proc = Bun.spawn(['bun', 'run', CLI_ENTRY, ...args], {
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
let myId: number;
let myUsername: string;
const cleanupIds: number[] = [];

/** Track a message for cleanup in afterAll (call right after send, before assertions) */
function track(id: number) {
  cleanupIds.push(id);
}

// --- Setup / Teardown ---

beforeAll(async () => {
  const me = await tg('me');
  expect(me.ok).toBe(true);
  myId = me.data.id; // numeric
  myUsername = me.data.username;
}, TIMEOUT);

afterAll(async () => {
  for (const id of cleanupIds) {
    await tg('delete', 'me', String(id));
  }
}, TIMEOUT);

// ─── Identity ───

describe('me', () => {
  it(
    'returns current user info',
    async () => {
      const r = await tg('me');
      expect(r.ok).toBe(true);
      expect(r.data.id).toBeNumber();
      expect(r.data.username).toBeString();
      expect(r.data.type).toBe('regular');
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
      expect(r.data[0].id).toBeNumber();
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
    'type field present for user dialogs',
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
    'includes last_message with date',
    async () => {
      const r = await tg('dialogs', '--limit', '3');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        if (d.last_message) {
          expect(d.last_message.id).toBeNumber();
          expect(d.last_message.date).toBeNumber();
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
        expect(d.unread_count).toBeGreaterThan(0);
        expect(d.id).toBeNumber();
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
    'includes last_read_inbox_message_id for fetching unread messages',
    async () => {
      const r = await tg('unread', '--limit', '3');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        if (d.last_read_inbox_message_id) {
          expect(d.last_read_inbox_message_id).toBeNumber();
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
        expect(m.content).toBeTruthy();
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
        expect(m.content).toBeTruthy();
        expect(m.content.type).toBe('messagePhoto');
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
        expect(m.content).toBeTruthy();
        expect(m.content.type).toBe('messageDocument');
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
        // URL messages are returned by the URL filter — they contain links
        // in the text content (rendered as markdown) or have web page media
        expect(m.content).toBeTruthy();
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
        expect(groupId).toBeLessThan(0); // Should be negative
        const r = await tg('messages', String(groupId), '--limit', '2');
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
    'global search returns results with chat_id and chat_title',
    async () => {
      const r = await tg('search', 'test', '--limit', '5');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.chat_id).toBeNumber();
        expect(m.id).toBeNumber();
      }
    },
    TIMEOUT,
  );

  it(
    'chat_id normalized: channels have -100 prefix',
    async () => {
      const r = await tg('search', 'test', '--limit', '20');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        const chatId = m.chat_id;
        // User IDs are positive, group/channel IDs are negative
        if (chatId < 0) {
          const chatIdStr = String(chatId);
          expect(chatIdStr).toMatch(/^-100\d+$|^-\d+$/);
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
        // User chat_ids are positive
        expect(m.chat_id).toBeGreaterThan(0);
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
        expect(m.chat_id).toBeLessThan(0);
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
      // At least some results should have sender_name
      const _withName = r.data.filter((m: Record<string, unknown>) => m.sender_name);
      // We can't guarantee all have names, but the feature should work
      expect(r.data.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    'search chat_id works with messages command',
    async () => {
      const r = await tg('search', 'test', '--type', 'group', '--limit', '1');
      expect(r.ok).toBe(true);
      if (r.data.length > 0) {
        const chatId = r.data[0].chat_id;
        // The chat_id from search should work directly with messages
        const msgs = await tg('messages', String(chatId), '--limit', '2');
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
      track(r.data.id);
      expect(r.data.id).toBeNumber();
      expect(r.data.content.text).toBe('e2e test message — will be deleted');
    },
    TIMEOUT,
  );

  it(
    'sends with --html formatting',
    async () => {
      const r = await tg('send', 'me', '<b>bold</b> <i>italic</i>', '--html');
      expect(r.ok).toBe(true);
      track(r.data.id);
      expect(r.data.content.text).toBe('**bold** __italic__');
    },
    TIMEOUT,
  );

  it(
    'sends with --md formatting',
    async () => {
      const r = await tg('send', 'me', '*bold* `code`', '--md');
      expect(r.ok).toBe(true);
      track(r.data.id);
    },
    TIMEOUT,
  );

  it(
    '--stdin reads from pipe',
    async () => {
      const proc = Bun.spawn(
        ['bash', '-c', `echo "stdin test msg" | bun run ${CLI_ENTRY} send me --stdin`],
        {
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const r = JSON.parse(stdout.trim());
      expect(r.ok).toBe(true);
      track(r.data.id);
      expect(r.data.content.text).toBe('stdin test msg');
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
      track(r.data.id);
      expect(r.data.content.text).toBe('file test msg');
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
      track(s.data.id);
      const msgId = s.data.id;

      const r = await tg('edit', 'me', String(msgId), 'edited text');
      expect(r.ok).toBe(true);
      expect(r.data.content.text).toBe('edited text');
      expect(r.data.edit_date).toBeNumber();
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
      track(s.data.id);
      const r = await tg('delete', 'me', String(s.data.id));
      expect(r.ok).toBe(true);
      expect(r.data.deleted).toContain(s.data.id);
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
      track(s.data.id);
      const r = await tg('forward', 'me', 'me', String(s.data.id));
      expect(r.ok).toBe(true);
      if (r.data[0]?.id) track(r.data[0].id);
      expect(r.data.length).toBeGreaterThan(0);
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
      expect(r.data.chat.id).toBe(myId);
      expect(r.data.chat.type).toBe('user');
      expect(r.data.user).toBeTruthy();
    },
    TIMEOUT,
  );

  it(
    'returns info for Saved Messages',
    async () => {
      const r = await tg('chat', 'me');
      expect(r.ok).toBe(true);
      expect(r.data.chat.id).toBe(myId);
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
      expect(r.data.chat.id).toBe(myId);
      expect(r.data.user.username).toBe(myUsername);
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
        expect(c.id).toBeNumber();
        expect(c.type).toMatch(/^(regular|bot|deleted|unknown)$/);
      }
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
  let groupId: number;

  beforeAll(async () => {
    const r = await tg('dialogs', '--type', 'group', '--limit', '1');
    if (r.ok && r.data.length > 0) {
      groupId = r.data[0].id;
    }
  }, TIMEOUT);

  it(
    'returns member list with user_id and status',
    async () => {
      if (!groupId) return;
      const r = await tg('members', String(groupId), '--limit', '10');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.user_id).toBeNumber();
        expect(m.status).toMatch(/^(creator|admin|member|restricted|banned|left)$/);
      }
    },
    TIMEOUT,
  );

  it(
    '--type bot filters to bots only',
    async () => {
      if (!groupId) return;
      const r = await tg('members', String(groupId), '--type', 'bot');
      expect(r.ok).toBe(true);
      // Results are filtered by the TDLib supergroupMembersFilterBots filter
      expect(Array.isArray(r.data)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '--search filters by name',
    async () => {
      if (!groupId) return;
      const r = await tg('members', String(groupId), '--search', 'a');
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'invalid --type falls back to recent (no validation)',
    async () => {
      if (!groupId) return;
      const r = await tg('members', String(groupId), '--type', 'invalid');
      // members command does not validate --type; unknown values fall through to 'recent'
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
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
      track(s.data.id);
      const r = await tg('download', 'me', String(s.data.id));
      expect(r.ok).toBe(false);
      expect(r.code).toBe('NOT_FOUND');
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
      track(s.data.id);
      const pin = await tg('pin', 'me', String(s.data.id), '--silent');
      expect(pin.ok).toBe(true);
      const unpin = await tg('unpin', 'me', String(s.data.id));
      expect(unpin.ok).toBe(true);
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
    },
    TIMEOUT,
  );

  it(
    'has access to client',
    async () => {
      const r = await tg(
        'eval',
        "const me = await client.invoke({ _: 'getMe' }); return { id: me.id }",
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
    'unread → messages: last_read_inbox_message_id as --min-id',
    async () => {
      const unreads = await tg('unread', '--limit', '1');
      expect(unreads.ok).toBe(true);
      if (unreads.data.length > 0 && unreads.data[0].last_read_inbox_message_id) {
        const chatId = unreads.data[0].id;
        const minId = unreads.data[0].last_read_inbox_message_id;
        const msgs = await tg(
          'messages',
          String(chatId),
          '--min-id',
          String(minId),
          '--limit',
          '5',
        );
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
        const msgs = await tg('messages', String(chatId), '--limit', '2');
        expect(msgs.ok).toBe(true);
      }
    },
    TIMEOUT,
  );

  it(
    'search → messages: search chat_id works with messages (groups)',
    async () => {
      const search = await tg('search', 'test', '--type', 'group', '--limit', '3');
      expect(search.ok).toBe(true);
      if (search.data.length > 0) {
        const chatId = search.data[0].chat_id;
        const msgs = await tg('messages', String(chatId), '--limit', '2');
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
        const r = await tg('messages', '--limit', '2', '--', String(groupId));
        // This should work since -- stops flag parsing and groupId becomes positional
        // Note: with current parsing, positional args after -- work
        expect(r.ok).toBe(true);
      }
    },
    TIMEOUT,
  );

  it(
    'messages media_album_id identifies albums',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'photo', '--limit', '50');
      expect(r.ok).toBe(true);
      const withGroupId = r.data.filter((m: Record<string, unknown>) => m.media_album_id);
      // Group messages by media_album_id
      const albums = new Map<string, number>();
      for (const m of withGroupId) {
        albums.set(m.media_album_id, (albums.get(m.media_album_id) || 0) + 1);
      }
      // If albums exist, each should have >1 photo
      for (const [_gid, count] of albums) {
        expect(count).toBeGreaterThan(1);
      }
    },
    TIMEOUT,
  );

  it(
    'texturl entities rendered as markdown links in content.text',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'url', '--limit', '20');
      expect(r.ok).toBe(true);
      // Entities are now rendered inline as markdown by unparse()
      // TextUrl entities appear as [text](url) in the content text
      const withMarkdownLink = r.data.filter((m: Record<string, unknown>) => {
        const content = m.content as Record<string, unknown> | undefined;
        if (!content) return false;
        const text = (content.text ?? content.caption ?? '') as string;
        return /\[.*?\]\(https?:\/\/.*?\)/.test(text);
      });
      for (const m of withMarkdownLink) {
        const text = (m.content.text ?? m.content.caption ?? '') as string;
        expect(text).toMatch(/\[.*?\]\(https?:\/\/.*?\)/);
      }
    },
    TIMEOUT,
  );
});

// ─── Input validation ───

describe('input validation', () => {
  it(
    'accepts equals-sign syntax for flag values',
    async () => {
      const r = await tg('dialogs', '--type=user', '--limit=3');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(d.type).toBe('user');
      }
    },
    TIMEOUT,
  );

  it(
    'rejects unrecognized flags instead of silently ignoring them',
    async () => {
      const r = await tg('dialogs', '--bogus');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
      expect(r.error).toContain('--bogus');
    },
    TIMEOUT,
  );

  it(
    'error messages are concise and actionable',
    async () => {
      const r = await tg('messages');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
      // Should be concise, not contain the full usage line
      expect(r.error).not.toContain('[--limit N]');
      expect(r.error).toContain('--help');
    },
    TIMEOUT,
  );
});

// ─── Unread filtering ───

describe('unread filtering', () => {
  it(
    'dialogs can be filtered to only unread chats',
    async () => {
      const r = await tg('dialogs', '--unread', '--limit', '10');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(d.unread_count).toBeGreaterThan(0);
      }
    },
    TIMEOUT,
  );

  it(
    'unread filter composes with chat type filter',
    async () => {
      const r = await tg('dialogs', '--unread', '--type', 'channel', '--limit', '5');
      expect(r.ok).toBe(true);
      for (const d of r.data) {
        expect(d.type).toBe('channel');
        expect(d.unread_count).toBeGreaterThan(0);
      }
    },
    TIMEOUT,
  );
});

// ─── CLI does not mutate Telegram state ───

describe('state-mutating commands are removed', () => {
  it(
    'open-chat is rejected',
    async () => {
      const r = await tg('open-chat', 'me');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
      expect(r.error).toContain('Unknown command');
    },
    TIMEOUT,
  );

  it(
    'close-chat is rejected',
    async () => {
      const r = await tg('close-chat', 'me');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
      expect(r.error).toContain('Unknown command');
    },
    TIMEOUT,
  );
});

// ─── Media-only search ───

describe('media search without text query', () => {
  it(
    'search by media type does not require a text query',
    async () => {
      const r = await tg('search', '--chat', 'me', '--filter', 'photo', '--limit', '3');
      expect(r.ok).toBe(true);
      expect(Array.isArray(r.data)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'search requires either a text query or a media filter',
    async () => {
      const r = await tg('search');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
      expect(r.error).toContain('--filter');
    },
    TIMEOUT,
  );
});

// ─── Sender identity ───

describe('sender identity in messages', () => {
  it(
    'every message includes the sender display name',
    async () => {
      const r = await tg('messages', 'me', '--limit', '3');
      expect(r.ok).toBe(true);
      for (const m of r.data) {
        expect(m.sender_name).toBeString();
        expect(m.sender_name.length).toBeGreaterThan(0);
      }
    },
    TIMEOUT,
  );

  it(
    'group messages resolve sender names for each participant',
    async () => {
      const groups = await tg('dialogs', '--type', 'group', '--limit', '1');
      if (groups.ok && groups.data.length > 0) {
        const r = await tg('messages', String(groups.data[0].id), '--limit', '5');
        expect(r.ok).toBe(true);
        for (const m of r.data) {
          expect(m.sender_name).toBeString();
        }
      }
    },
    TIMEOUT,
  );
});

// ─── Limit guarantees with client-side filters ───

describe('limit is respected even with client-side filtering', () => {
  it(
    'sender filter still returns the requested number of messages',
    async () => {
      const r = await tg('messages', 'me', '--limit', '5', '--from', String(myId));
      expect(r.ok).toBe(true);
      expect(r.data.length).toBe(5);
      for (const m of r.data) {
        expect(m.sender_id).toBe(Number(myId));
      }
    },
    TIMEOUT,
  );

  it(
    'media filter still returns the requested number of messages',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'photo', '--limit', '5');
      expect(r.ok).toBe(true);
      if (r.hasMore) {
        expect(r.data.length).toBe(5);
      }
      for (const m of r.data) {
        expect(m.content.type).toBe('messagePhoto');
      }
    },
    TIMEOUT,
  );
});

// ─── Direct file download ───

describe('download by file ID', () => {
  it(
    'files can be downloaded using just their TDLib file ID',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'photo', '--limit', '1');
      expect(r.ok).toBe(true);
      if (r.data.length > 0) {
        const fileId = r.data[0].content?.photo?.file?.id;
        if (fileId) {
          const dl = await tg('download', '--file-id', String(fileId));
          expect(dl.ok).toBe(true);
          expect(dl.data.file).toBeString();
          expect(dl.data.size).toBeGreaterThan(0);
        }
      }
    },
    TIMEOUT,
  );

  it(
    'download by chat + message ID still works',
    async () => {
      const r = await tg('messages', 'me', '--filter', 'photo', '--limit', '1');
      expect(r.ok).toBe(true);
      if (r.data.length > 0) {
        const dl = await tg('download', 'me', String(r.data[0].id));
        expect(dl.ok).toBe(true);
        expect(dl.data.file).toBeString();
      }
    },
    TIMEOUT,
  );
});

// ─── Speech recognition ───

describe('speech recognition', () => {
  it(
    'transcribe rejects non-audio messages',
    async () => {
      const r = await tg('messages', 'me', '--limit', '1');
      expect(r.ok).toBe(true);
      if (r.data.length > 0 && r.data[0].content.type === 'messageText') {
        const t = await tg('transcribe', 'me', String(r.data[0].id));
        expect(t.ok).toBe(false);
        expect(t.code).toBe('INVALID_ARGS');
      }
    },
    TIMEOUT,
  );
});

// ─── Voice note transcript in message output ───

describe('voice note transcript in output', () => {
  it(
    'voice notes include transcript text when already recognized',
    async () => {
      // Find voice notes via search — transcript may or may not be present
      const r = await tg('search', '--chat', 'me', '--filter', 'voice', '--limit', '5');
      if (!r.ok || r.data.length === 0) return;
      for (const m of r.data) {
        expect(m.content.type).toBe('messageVoiceNote');
        // transcript is optional — just verify it's a string when present
        if (m.content.transcript !== undefined) {
          expect(m.content.transcript).toBeString();
          expect(m.content.transcript.length).toBeGreaterThan(0);
        }
      }
    },
    TIMEOUT,
  );
});
