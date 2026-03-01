/**
 * End-to-end tests for the listen (streaming) command.
 * Requires a valid Telegram session and a running daemon.
 *
 * Streaming tests inject synthetic TDLib updates via `eval` to trigger
 * registered event handlers, avoiding dependency on real incoming messages.
 *
 * Run: bun test scripts/tg/listen.e2e.test.ts
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import path from 'node:path';

const TG = path.resolve(import.meta.dir, '../..');
const TIMEOUT = 30_000;
const STREAM_TIMEOUT = 30_000;

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

/** Spawn listen in background, collect NDJSON lines incrementally */
function listenBg(...args: string[]) {
  const proc = Bun.spawn(['bun', 'tg', 'listen', ...args], {
    cwd: TG,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const chunks: Uint8Array[] = [];
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  let reading = true;

  // Background reader — collects chunks as they arrive
  (async () => {
    try {
      while (reading) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } catch {}
  })();

  return {
    getLines(): string[] {
      const text = Buffer.concat(chunks).toString();
      return text.split('\n').filter((l) => l.trim());
    },
    async waitForLines(count: number, timeoutMs = 10_000): Promise<string[]> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const lines = this.getLines();
        if (lines.length >= count) return lines;
        await new Promise((r) => setTimeout(r, 300));
      }
      return this.getLines();
    },
    async kill() {
      reading = false;
      proc.kill();
      try {
        reader.releaseLock();
      } catch {}
      await proc.exited;
    },
    proc,
  };
}

/**
 * Inject a synthetic update into the daemon's client.
 * Uses `eval` to emit a TDLib update through the client's event system,
 * triggering registered event handlers.
 */
async function injectUpdate(code: string): Promise<TgResult> {
  return tg('eval', code);
}

/** Build eval code to inject a synthetic updateNewMessage */
function newMessageCode(opts: {
  text: string;
  chatId: number;
  msgId?: number;
  isOutgoing?: boolean;
}): string {
  return `
client.emit('update', {
  _: 'updateNewMessage',
  message: {
    _: 'message',
    id: ${opts.msgId ?? 999999},
    sender_id: { _: 'messageSenderUser', user_id: ${opts.chatId} },
    chat_id: ${opts.chatId},
    is_outgoing: ${opts.isOutgoing ?? false},
    date: Math.floor(Date.now() / 1000),
    content: {
      _: 'messageText',
      text: { _: 'formattedText', text: ${JSON.stringify(opts.text)}, entities: [] },
    },
  },
});
return { dispatched: 1 };
`;
}

/** Build eval code to inject a synthetic updateNewMessage from a group chat */
function groupMessageCode(opts: { text: string; chatId: number; msgId?: number }): string {
  return `
client.emit('update', {
  _: 'updateNewMessage',
  message: {
    _: 'message',
    id: ${opts.msgId ?? 999998},
    sender_id: { _: 'messageSenderUser', user_id: 12345 },
    chat_id: ${opts.chatId},
    is_outgoing: false,
    date: Math.floor(Date.now() / 1000),
    content: {
      _: 'messageText',
      text: { _: 'formattedText', text: ${JSON.stringify(opts.text)}, entities: [] },
    },
  },
});
return { dispatched: 1 };
`;
}

/**
 * Build eval code to ensure a chat exists in the in-memory chats map.
 * Required for --type filtering which uses getChatType(chats.get(chatId)).
 * Only the `type` field matters for filtering; other fields are stubs.
 */
function ensureChatCode(chatId: number, type: 'user' | 'group'): string {
  const chatType =
    type === 'user'
      ? `{ _: 'chatTypePrivate', user_id: ${chatId} }`
      : `{ _: 'chatTypeBasicGroup', basic_group_id: ${Math.abs(chatId)} }`;
  const title = type === 'user' ? 'Test User' : 'Test Group';
  return `
const { chats } = await import('./tdlib-client');
chats.set(${chatId}, { id: ${chatId}, type: ${chatType}, title: '${title}', positions: [] });
return { ok: true };
`;
}

// --- Shared state ---
let myId: number;

beforeAll(async () => {
  const me = await tg('me');
  expect(me.ok).toBe(true);
  myId = Number(me.data.id);
}, TIMEOUT);

// ─── Validation ───

describe('listen validation', () => {
  it(
    'no flags → INVALID_ARGS',
    async () => {
      const r = await tg('listen');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
      expect(r.error).toContain('--chat or --type');
    },
    TIMEOUT,
  );

  it(
    'bad --type → INVALID_ARGS',
    async () => {
      const r = await tg('listen', '--type', 'foo');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
      expect(r.error).toContain('foo');
    },
    TIMEOUT,
  );

  it(
    'bad --exclude-type → INVALID_ARGS',
    async () => {
      const r = await tg('listen', '--type', 'user', '--exclude-type', 'bar');
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_ARGS');
      expect(r.error).toContain('bar');
    },
    TIMEOUT,
  );
});

// ─── Streaming events ───

describe('listen streaming', () => {
  it(
    'receives synthetic new_message',
    async () => {
      const handle = listenBg('--chat', String(myId));

      try {
        // Wait for handlers to register in daemon
        await new Promise((r) => setTimeout(r, 2000));

        const nonce = `listen-new-${Date.now()}`;
        const inject = await injectUpdate(newMessageCode({ text: nonce, chatId: myId }));
        expect(inject.ok).toBe(true);
        expect(inject.data.dispatched).toBeGreaterThan(0);

        const lines = await handle.waitForLines(1, 5000);
        expect(lines.length).toBeGreaterThanOrEqual(1);

        const events = lines.map((l) => JSON.parse(l));
        const match = events.find(
          // biome-ignore lint/suspicious/noExplicitAny: parsed JSON
          (e: any) => e.type === 'new_message' && e.message?.content?.text?.text === nonce,
        );
        expect(match).toBeTruthy();
        expect(match.chat_id).toBe(myId);
      } finally {
        await handle.kill();
      }
    },
    STREAM_TIMEOUT,
  );

  // Edit message tests are skipped because updateMessageContent and
  // updateMessageEdited both call client.invoke({ _: "getMessage" }),
  // which fails for synthetic (non-existent) message IDs.

  it(
    '--type group excludes user messages',
    async () => {
      // Ensure myId chat is in the map as a private chat
      await injectUpdate(ensureChatCode(myId, 'user'));

      const handle = listenBg('--type', 'group');

      try {
        await new Promise((r) => setTimeout(r, 2000));

        // Inject a user message (should be excluded by --type group)
        const nonce = `listen-exclude-${Date.now()}`;
        await injectUpdate(newMessageCode({ text: nonce, chatId: myId }));

        // Wait briefly and verify no matching events
        await new Promise((r) => setTimeout(r, 2000));
        const lines = handle.getLines();
        const events = lines
          .map((l) => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        const match = events.find(
          // biome-ignore lint/suspicious/noExplicitAny: parsed JSON
          (e: any) => e.type === 'new_message' && e.message?.content?.text?.text === nonce,
        );
        expect(match).toBeUndefined();
      } finally {
        await handle.kill();
      }
    },
    STREAM_TIMEOUT,
  );

  it(
    '--chat filter includes specific chat',
    async () => {
      const handle = listenBg('--chat', String(myId));

      try {
        await new Promise((r) => setTimeout(r, 2000));

        const nonce = `listen-chat-${Date.now()}`;
        await injectUpdate(newMessageCode({ text: nonce, chatId: myId }));

        const lines = await handle.waitForLines(1, 5000);
        expect(lines.length).toBeGreaterThanOrEqual(1);

        const events = lines.map((l) => JSON.parse(l));
        const match = events.find(
          // biome-ignore lint/suspicious/noExplicitAny: parsed JSON
          (e: any) => e.type === 'new_message' && e.message?.content?.text?.text === nonce,
        );
        expect(match).toBeTruthy();
        expect(match.chat_id).toBe(myId);
      } finally {
        await handle.kill();
      }
    },
    STREAM_TIMEOUT,
  );

  it(
    '--type user receives user messages but not group',
    async () => {
      const groupChatId = -100_123_456;

      // Ensure both chats are in the map with correct types
      await injectUpdate(ensureChatCode(myId, 'user'));
      await injectUpdate(ensureChatCode(groupChatId, 'group'));

      const handle = listenBg('--type', 'user');

      try {
        await new Promise((r) => setTimeout(r, 2000));

        // Inject a group message (should be excluded)
        const groupNonce = `listen-group-${Date.now()}`;
        await injectUpdate(groupMessageCode({ text: groupNonce, chatId: groupChatId }));

        // Inject a user message (should be included)
        const userNonce = `listen-user-${Date.now()}`;
        await injectUpdate(newMessageCode({ text: userNonce, chatId: myId }));

        const lines = await handle.waitForLines(1, 5000);
        const events = lines.map((l) => JSON.parse(l));

        // User message should appear
        expect(
          events.find(
            // biome-ignore lint/suspicious/noExplicitAny: parsed JSON
            (e: any) => e.type === 'new_message' && e.message?.content?.text?.text === userNonce,
          ),
        ).toBeTruthy();
        // Group message should not
        expect(
          events.find(
            // biome-ignore lint/suspicious/noExplicitAny: parsed JSON
            (e: any) => e.type === 'new_message' && e.message?.content?.text?.text === groupNonce,
          ),
        ).toBeUndefined();
      } finally {
        await handle.kill();
      }
    },
    STREAM_TIMEOUT,
  );
});

// ─── Daemon survival ───

describe('listen cleanup', () => {
  it(
    'daemon stays alive after listen stops',
    async () => {
      const handle = listenBg('--type', 'user');

      // Let it run briefly then kill
      await new Promise((r) => setTimeout(r, 2000));
      await handle.kill();

      // Daemon should still work
      const me = await tg('me');
      expect(me.ok).toBe(true);
      expect(me.data.id).toBeTruthy();
    },
    TIMEOUT,
  );
});
