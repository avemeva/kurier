/**
 * Command definitions for telegram-ai-v2 CLI.
 * Each command is self-contained with description, usage, flags, and handler.
 *
 * Uses TDLib via the daemon proxy. All Telegram API calls use client.invoke().
 */

import { copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TelegramClient } from '@tg/protocol';
import type * as Td from 'tdlib-types';
import { fail, strip, success, warn } from './output';
import { resolveChatId, resolveEntity } from './resolve';
import {
  slimChat,
  slimChats,
  slimMembers,
  slimMessage,
  slimMessages,
  slimUser,
  slimUsers,
} from './slim';

// --- Flag parsing helpers ---

function parseLimit(flags: Record<string, string>, defaultVal: number): number {
  const raw = flags['--limit'];
  if (raw === undefined) return defaultVal;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n !== Math.floor(n)) {
    fail('--limit must be a positive integer', 'INVALID_ARGS');
  }
  return n;
}

const VALID_CHAT_TYPES = new Set(['user', 'group', 'channel']);

// --- Command type ---

export interface Command {
  name: string;
  description: string;
  usage: string;
  flags?: Record<string, string>;
  /** Minimum positional args required (validated before connect) */
  minArgs?: number;
  /** If true, this is a streaming command (long-lived NDJSON output) */
  streaming?: boolean;
  run: (client: TelegramClient, args: string[], flags: Record<string, string>) => Promise<void>;
}

// --- TDLib helper: get chat type string (used for --type filtering) ---

function getChatType(chat: Td.chat): 'user' | 'group' | 'channel' | 'unknown' {
  switch (chat.type._) {
    case 'chatTypePrivate':
    case 'chatTypeSecret':
      return 'user';
    case 'chatTypeBasicGroup':
      return 'group';
    case 'chatTypeSupergroup':
      return chat.type.is_channel ? 'channel' : 'group';
    default:
      return 'unknown';
  }
}

const AUTO_DOWNLOAD_MAX_SIZE = 1_048_576; // 1MB

// --- Helper: get file from message content ---

function getFile(content: Td.MessageContent): Td.file | null {
  switch (content._) {
    case 'messagePhoto': {
      const sizes = content.photo.sizes;
      if (!sizes.length) return null;
      return sizes[sizes.length - 1]?.photo ?? null;
    }
    case 'messageDocument':
      return content.document.document;
    case 'messageVideo':
      return content.video.video;
    case 'messageAudio':
      return content.audio.audio;
    case 'messageAnimation':
      return content.animation.animation;
    case 'messageVoiceNote':
      return content.voice_note.voice;
    case 'messageVideoNote':
      return content.video_note.video;
    case 'messageSticker':
      return content.sticker.sticker;
    default:
      return null;
  }
}

// --- Helper: auto-download small files (≤1MB, not yet downloaded) ---

async function autoDownloadSmall(client: TelegramClient, rawMsgs: Td.message[]): Promise<void> {
  const targets: { file: Td.file }[] = [];
  for (const msg of rawMsgs) {
    const file = getFile(msg.content);
    if (!file) continue;
    if (file.local.is_downloading_completed) continue;
    const size = file.size || file.expected_size;
    if (size > 0 && size <= AUTO_DOWNLOAD_MAX_SIZE) {
      targets.push({ file });
    }
  }
  if (!targets.length) return;

  const CONCURRENCY = 3;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (target) => {
        try {
          const updated = await client.invoke({
            _: 'downloadFile',
            file_id: target.file.id,
            priority: 1,
            offset: 0,
            limit: 0,
            synchronous: true,
          });
          // Patch the original file object so slimFile sees the download
          target.file.local = updated.local;
        } catch {}
      }),
    );
  }
}

// --- Helper: get file_id from message content ---

function getFileId(content: Td.MessageContent): number | null {
  switch (content._) {
    case 'messagePhoto': {
      // Get largest photo size
      const sizes = content.photo.sizes;
      if (!sizes.length) return null;
      const largest = sizes[sizes.length - 1];
      return largest ? largest.photo.id : null;
    }
    case 'messageDocument':
      return content.document.document.id;
    case 'messageVideo':
      return content.video.video.id;
    case 'messageAudio':
      return content.audio.audio.id;
    case 'messageAnimation':
      return content.animation.animation.id;
    case 'messageVoiceNote':
      return content.voice_note.voice.id;
    case 'messageVideoNote':
      return content.video_note.video.id;
    case 'messageSticker':
      return content.sticker.sticker.id;
    default:
      return null;
  }
}

// --- Helper: get MIME type from content ---

function getContentMimeType(content: Td.MessageContent): string {
  switch (content._) {
    case 'messagePhoto':
      return 'image/jpeg';
    case 'messageDocument':
      return content.document.mime_type || 'application/octet-stream';
    case 'messageVideo':
      return content.video.mime_type || 'video/mp4';
    case 'messageAudio':
      return content.audio.mime_type || 'audio/mpeg';
    case 'messageAnimation':
      return content.animation.mime_type || 'video/mp4';
    case 'messageVoiceNote':
      return content.voice_note.mime_type || 'audio/ogg';
    case 'messageVideoNote':
      return 'video/mp4';
    case 'messageSticker':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

// --- Helper: should auto-download ---

function shouldAutoDownloadContent(content: Td.MessageContent): boolean {
  switch (content._) {
    case 'messagePhoto':
      return true;
    case 'messageSticker':
      return true;
    case 'messageVoiceNote':
      return true;
    case 'messageVideoNote':
      return true;
    default:
      return false;
  }
}

// --- Helper: auto-download media for messages ---

async function autoDownloadMessages(client: TelegramClient, rawMsgs: Td.message[]): Promise<void> {
  const downloadable: Array<{ fileId: number }> = [];
  for (const msg of rawMsgs) {
    if (!shouldAutoDownloadContent(msg.content)) continue;
    const fileId = getFileId(msg.content);
    if (!fileId) continue;
    downloadable.push({ fileId });
  }

  const CONCURRENCY = 3;
  for (let batch = 0; batch < downloadable.length; batch += CONCURRENCY) {
    const chunk = downloadable.slice(batch, batch + CONCURRENCY);
    await Promise.all(
      chunk.map(async ({ fileId }) => {
        try {
          await client.invoke({
            _: 'downloadFile',
            file_id: fileId,
            priority: 1,
            offset: 0,
            limit: 0,
            synchronous: true,
          });
        } catch {
          /* skip failed downloads */
        }
      }),
    );
  }
}

// --- Context helpers for search --context ---

async function enrichWithContext(
  client: TelegramClient,
  chatId: number,
  results: Record<string, unknown>[],
  contextN: number,
): Promise<Record<string, unknown>[]> {
  const MAX_CONTEXT = 5;
  const enriched: Record<string, unknown>[] = [];
  for (let i = 0; i < results.length; i++) {
    const hit = results[i];
    if (!hit) continue;
    if (i >= MAX_CONTEXT) {
      enriched.push({ ...hit, context: [] });
      continue;
    }
    const msgId = hit.id as number;
    try {
      const ctx = await client.invoke({
        _: 'getChatHistory',
        chat_id: chatId,
        from_message_id: msgId,
        offset: -contextN,
        limit: contextN * 2 + 1,
        only_local: false,
      });
      const context = strip(
        slimMessages(
          ctx.messages.filter((m): m is Td.message => m !== undefined && m.id !== msgId),
        ),
      );
      enriched.push({ ...hit, context });
    } catch {
      enriched.push({ ...hit, context: [] });
    }
  }
  return enriched;
}

// --- Truncation helper for search results ---

function truncateContent(result: Record<string, unknown>, maxLen = 500): Record<string, unknown> {
  const content = result.content as Record<string, unknown> | undefined;
  if (!content) return result;
  const type = content._ as string;
  if (type === 'messageText' && typeof content.text === 'string' && content.text.length > maxLen) {
    return {
      ...result,
      content: { ...content, text: content.text.slice(0, maxLen) },
      truncated: true,
    };
  }
  if (
    (type === 'messagePhoto' ||
      type === 'messageVideo' ||
      type === 'messageDocument' ||
      type === 'messageAudio' ||
      type === 'messageAnimation' ||
      type === 'messageVoiceNote') &&
    typeof content.caption === 'string' &&
    content.caption.length > maxLen
  ) {
    return {
      ...result,
      content: { ...content, caption: content.caption.slice(0, maxLen) },
      truncated: true,
    };
  }
  return result;
}

// --- Commands ---

export const commands: Command[] = [
  // --- Identity ---
  {
    name: 'me',
    description: 'Get current user info',
    usage: 'tg me',
    run: async (client) => {
      const me = await client.invoke({ _: 'getMe' });
      success(strip(slimUser(me)));
    },
  },

  // --- Dialogs ---
  {
    name: 'dialogs',
    description: 'List chats and conversations',
    usage:
      'tg dialogs [--limit N] [--archived] [--type user|group|channel] [--search text] [--offset-date N]',
    flags: {
      '--limit': 'Max chats to return (default: 40)',
      '--archived': 'Show archived chats',
      '--type': 'Filter by chat type: user, group, or channel',
      '--search': 'Filter by chat title (client-side substring match)',
      '--offset-date': "Paginate: unix timestamp from previous response's nextOffset",
    },
    run: async (client, _args, flags) => {
      const limit = parseLimit(flags, 40);
      const archived = '--archived' in flags;
      const typeFilter = flags['--type'];
      const searchQuery = flags['--search']?.toLowerCase();
      const offsetDate = flags['--offset-date'] ? Number(flags['--offset-date']) : undefined;
      if (offsetDate !== undefined && (!Number.isFinite(offsetDate) || offsetDate < 0)) {
        fail('--offset-date must be a non-negative unix timestamp', 'INVALID_ARGS');
      }
      if (typeFilter && !VALID_CHAT_TYPES.has(typeFilter)) {
        fail(`Invalid --type "${typeFilter}". Expected: user, group, or channel`, 'INVALID_ARGS');
      }
      const chatList: Td.ChatList = archived ? { _: 'chatListArchive' } : { _: 'chatListMain' };
      const isFiltered = !!(typeFilter || searchQuery || offsetDate);

      if (isFiltered) {
        // Iterative fetch: keep loading batches until we have enough matching chats
        const BATCH_SIZE = 50;
        const MAX_SCAN = 500;
        const matched: Td.chat[] = [];
        let totalLoaded = 0;
        let exhausted = false;

        while (matched.length < limit && totalLoaded < MAX_SCAN && !exhausted) {
          try {
            await client.invoke({
              _: 'loadChats',
              chat_list: chatList,
              limit: BATCH_SIZE,
            });
          } catch {
            // loadChats throws 404 when there are no more chats
            exhausted = true;
          }

          const chatIds = await client.invoke({
            _: 'getChats',
            chat_list: chatList,
            limit: totalLoaded + BATCH_SIZE,
          });

          // Only process newly loaded chats (skip already-seen ones)
          const newIds = chatIds.chat_ids.slice(totalLoaded);
          if (newIds.length === 0) {
            exhausted = true;
            break;
          }
          totalLoaded = chatIds.chat_ids.length;

          for (const id of newIds) {
            try {
              const chat = await client.invoke({ _: 'getChat', chat_id: id });
              let passes = true;
              // offset-date: skip chats whose last message is at or after the offset
              if (offsetDate && (chat.last_message?.date ?? 0) >= offsetDate) passes = false;
              if (passes && typeFilter && getChatType(chat) !== typeFilter) passes = false;
              if (passes && searchQuery && !chat.title.toLowerCase().includes(searchQuery))
                passes = false;
              if (passes) matched.push(chat);
            } catch {
              /* skip chats we can't load */
            }
          }
        }

        const filtered = matched.slice(0, limit);
        const hasMore = !exhausted && filtered.length >= limit;

        const lastChat = filtered[filtered.length - 1];
        const lastDate = lastChat?.last_message?.date;

        success(strip(slimChats(filtered)), {
          hasMore,
          nextOffset: hasMore && lastDate ? lastDate : undefined,
        });
      } else {
        // No filter — single fetch
        try {
          await client.invoke({
            _: 'loadChats',
            chat_list: chatList,
            limit,
          });
        } catch {
          // loadChats throws when there are no more chats — that's ok
        }

        const chatIds = await client.invoke({
          _: 'getChats',
          chat_list: chatList,
          limit,
        });

        const chatObjects: Td.chat[] = [];
        for (const id of chatIds.chat_ids) {
          try {
            const chat = await client.invoke({ _: 'getChat', chat_id: id });
            chatObjects.push(chat);
          } catch {
            /* skip chats we can't load */
          }
        }

        const hasMore = chatIds.chat_ids.length >= limit;
        const lastChat = chatObjects[chatObjects.length - 1];
        const lastDate = lastChat?.last_message?.date;

        success(strip(slimChats(chatObjects)), {
          hasMore,
          nextOffset: hasMore && lastDate ? lastDate : undefined,
        });
      }
    },
  },

  // --- Unread ---
  {
    name: 'unread',
    description: 'List chats with unread messages',
    usage: 'tg unread [--all] [--type user|group|channel] [--limit N]',
    flags: {
      '--all': 'Include archived chats',
      '--type': 'Filter by chat type: user, group, or channel',
      '--limit': 'Max chats to return',
    },
    run: async (client, _args, flags) => {
      const includeArchived = '--all' in flags;
      const typeFilter = flags['--type'];
      if (typeFilter && !VALID_CHAT_TYPES.has(typeFilter)) {
        fail(`Invalid --type "${typeFilter}". Expected: user, group, or channel`, 'INVALID_ARGS');
      }
      const limit = parseLimit(flags, 50);
      const scanLimit = 500;

      // Load chats from main list
      try {
        await client.invoke({
          _: 'loadChats',
          chat_list: { _: 'chatListMain' },
          limit: scanLimit,
        });
      } catch {
        // no more chats
      }

      const chatIds = await client.invoke({
        _: 'getChats',
        chat_list: { _: 'chatListMain' },
        limit: scanLimit,
      });

      // Also load archived if --all
      let archivedIds: number[] = [];
      if (includeArchived) {
        try {
          await client.invoke({
            _: 'loadChats',
            chat_list: { _: 'chatListArchive' },
            limit: scanLimit,
          });
        } catch {
          // no more chats
        }
        const archived = await client.invoke({
          _: 'getChats',
          chat_list: { _: 'chatListArchive' },
          limit: scanLimit,
        });
        archivedIds = archived.chat_ids;
      }

      const allIds = [...chatIds.chat_ids, ...archivedIds];
      const chatObjects: Td.chat[] = [];
      for (const id of allIds) {
        try {
          const chat = await client.invoke({ _: 'getChat', chat_id: id });
          if (chat.unread_count > 0) chatObjects.push(chat);
        } catch {
          // skip
        }
      }

      let unread = chatObjects;
      if (typeFilter) {
        unread = unread.filter((c) => getChatType(c) === typeFilter);
      }

      const totalUnread = unread.length;
      unread = unread.slice(0, limit);

      success(strip(slimChats(unread)), { hasMore: totalUnread > limit });
    },
  },

  // --- Messages ---
  {
    name: 'messages',
    description: 'Get message history from a chat',
    usage:
      'tg messages <chat> [--limit N] [--offset-id N] [--from <user>] [--search text] [--filter photo|video|document|url|voice|gif] [--since N] [--reverse]',
    flags: {
      '--limit': 'Max messages (default: 20)',
      '--offset-id': 'Start from this message ID',
      '--from': 'Filter by sender (username or ID)',
      '--search': 'Search text within this chat',
      '--filter': 'Filter by media type: photo, video, document, url, voice, gif, music',
      '--min-id': 'Minimum message ID (exclusive)',
      '--max-id': 'Maximum message ID (exclusive)',
      '--since': 'Only messages after this unix timestamp (server-side filter)',
      '--reverse': 'Oldest messages first',
      '--download-media': 'Auto-download photos, stickers, voice messages; adds localPath to media',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const limit = parseLimit(flags, 20);

      // Search mode (--search or --since)
      if (flags['--search'] || flags['--since']) {
        const query = flags['--search'] ?? '';
        let filter: Td.SearchMessagesFilter = { _: 'searchMessagesFilterEmpty' };
        if (flags['--filter']) {
          const filterMap: Record<string, Td.SearchMessagesFilter> = {
            photo: { _: 'searchMessagesFilterPhoto' },
            video: { _: 'searchMessagesFilterVideo' },
            document: { _: 'searchMessagesFilterDocument' },
            url: { _: 'searchMessagesFilterUrl' },
            voice: { _: 'searchMessagesFilterVoiceNote' },
            gif: { _: 'searchMessagesFilterAnimation' },
            music: { _: 'searchMessagesFilterAudio' },
          };
          const f = filterMap[flags['--filter']];
          if (!f)
            fail(
              `Invalid --filter "${flags['--filter']}". Expected: ${Object.keys(filterMap).join(', ')}`,
              'INVALID_ARGS',
            );
          filter = f;
        }

        // Resolve sender filter
        let senderOption: Td.MessageSender | undefined;
        if (flags['--from']) {
          const fromId = await resolveEntity(client, flags['--from']);
          if (fromId > 0) {
            senderOption = { _: 'messageSenderUser', user_id: fromId };
          } else {
            senderOption = { _: 'messageSenderChat', chat_id: fromId };
          }
        }

        const result = await client.invoke({
          _: 'searchChatMessages',
          chat_id: chatId,
          query,
          sender_id: senderOption,
          from_message_id: flags['--offset-id'] ? Number(flags['--offset-id']) : 0,
          offset: 0,
          limit,
          filter,
          message_thread_id: 0,
        } as Td.searchChatMessages);

        let messages = result.messages.filter(
          (m: Td.message | null): m is Td.message => m !== null,
        );
        // Client-side date filter
        if (flags['--since']) {
          const since = Number(flags['--since']);
          messages = messages.filter((m: Td.message) => m.date >= since);
        }

        await autoDownloadSmall(client, messages);
        if ('--download-media' in flags) {
          await autoDownloadMessages(client, messages);
        }
        const hasMore = result.total_count > messages.length;
        success(strip(slimMessages(messages)), {
          hasMore,
          ...(hasMore && messages.length > 0
            ? { nextOffset: messages[messages.length - 1]?.id }
            : {}),
        });
        return;
      }

      // Standard history mode
      const fromMessageId = flags['--offset-id'] ? Number(flags['--offset-id']) : 0;

      // Media filter in history mode
      if (flags['--filter']) {
        const filterMap: Record<string, Td.SearchMessagesFilter> = {
          photo: { _: 'searchMessagesFilterPhoto' },
          video: { _: 'searchMessagesFilterVideo' },
          document: { _: 'searchMessagesFilterDocument' },
          url: { _: 'searchMessagesFilterUrl' },
          voice: { _: 'searchMessagesFilterVoiceNote' },
          gif: { _: 'searchMessagesFilterAnimation' },
          music: { _: 'searchMessagesFilterAudio' },
        };
        const f = filterMap[flags['--filter']];
        if (!f)
          fail(
            `Invalid --filter "${flags['--filter']}". Expected: ${Object.keys(filterMap).join(', ')}`,
            'INVALID_ARGS',
          );

        const result = await client.invoke({
          _: 'searchChatMessages',
          chat_id: chatId,
          query: '',
          from_message_id: fromMessageId,
          offset: 0,
          limit,
          filter: f,
          message_thread_id: 0,
        } as Td.searchChatMessages);

        let messages = result.messages.filter(
          (m: Td.message | null): m is Td.message => m !== null,
        );
        // Client-side filters
        if (flags['--min-id'])
          messages = messages.filter((m: Td.message) => m.id > Number(flags['--min-id']));
        if (flags['--max-id'])
          messages = messages.filter((m: Td.message) => m.id < Number(flags['--max-id']));
        if (flags['--from']) {
          const fromEntity = await resolveEntity(client, flags['--from']);
          messages = messages.filter((m: Td.message) =>
            m.sender_id._ === 'messageSenderUser'
              ? m.sender_id.user_id === fromEntity
              : m.sender_id._ === 'messageSenderChat'
                ? m.sender_id.chat_id === fromEntity
                : false,
          );
        }

        await autoDownloadSmall(client, messages);
        if ('--download-media' in flags) {
          await autoDownloadMessages(client, messages);
        }
        const hasMore = messages.length >= limit;
        success(strip(slimMessages(messages)), {
          hasMore,
          ...(hasMore && messages.length > 0
            ? { nextOffset: messages[messages.length - 1]?.id }
            : {}),
        });
        return;
      }

      const result = await client.invoke({
        _: 'getChatHistory',
        chat_id: chatId,
        from_message_id: fromMessageId,
        offset: 0,
        limit,
        only_local: false,
      });

      let messages = result.messages.filter((m): m is Td.message => m != null);

      // Client-side filters
      if (flags['--min-id'])
        messages = messages.filter((m: Td.message) => m.id > Number(flags['--min-id']));
      if (flags['--max-id'])
        messages = messages.filter((m: Td.message) => m.id < Number(flags['--max-id']));
      if (flags['--from']) {
        const fromEntity = await resolveEntity(client, flags['--from']);
        messages = messages.filter((m: Td.message) =>
          m.sender_id._ === 'messageSenderUser'
            ? m.sender_id.user_id === fromEntity
            : m.sender_id._ === 'messageSenderChat'
              ? m.sender_id.chat_id === fromEntity
              : false,
        );
      }
      const isReverse = '--reverse' in flags;
      if (isReverse) messages.reverse();

      await autoDownloadSmall(client, messages);
      if ('--download-media' in flags) {
        await autoDownloadMessages(client, messages);
      }
      const hasMore = messages.length >= limit;
      // When reversed, messages are [oldest...newest]. The next page needs messages
      // older than the oldest in this batch, so nextOffset = messages[0].id (the oldest).
      // When not reversed, messages are [newest...oldest], so nextOffset = last element.
      const nextOffsetMsg = isReverse ? messages[0] : messages[messages.length - 1];
      success(strip(slimMessages(messages)), {
        hasMore,
        ...(hasMore && nextOffsetMsg ? { nextOffset: nextOffsetMsg.id } : {}),
      });
    },
  },
  {
    name: 'message',
    description: 'Get a single message by ID',
    usage: 'tg message <chat> <message_id>',
    flags: {},
    minArgs: 2,
    run: async (client, args) => {
      const chatId = await resolveChatId(client, args[0] as string);
      const messageId = Number(args[1]);
      if (!messageId) fail('Invalid message ID', 'INVALID_ARGS');
      const msg = await client.invoke({
        _: 'getMessage',
        chat_id: chatId,
        message_id: messageId,
      });
      await autoDownloadSmall(client, [msg]);
      success(strip(slimMessage(msg)));
    },
  },

  // --- Send ---
  {
    name: 'send',
    description: 'Send a message to a chat',
    usage:
      'tg send <chat> "<text>" [--reply-to N] [--md] [--html] [--silent] [--no-preview] [--stdin] [--file path]',
    flags: {
      '--reply-to': 'Reply to a specific message ID',
      '--md': 'Parse Telegram MarkdownV2: *bold* _italic_ `code` ~strike~ ||spoiler||',
      '--html': 'Parse HTML: <b>bold</b> <i>italic</i> <code>code</code>',
      '--silent': 'Send without notification',
      '--no-preview': 'Disable link preview',
      '--stdin': 'Read message text from stdin (pipe input)',
      '--file': 'Read message text from file path',
    },
    minArgs: 2,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <text>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const text = args[1];

      // Parse mode
      let formattedText: Td.formattedText;
      if ('--md' in flags) {
        formattedText = await client.invoke({
          _: 'parseTextEntities',
          text,
          parse_mode: { _: 'textParseModeMarkdown', version: 2 },
        });
      } else if ('--html' in flags) {
        formattedText = await client.invoke({
          _: 'parseTextEntities',
          text,
          parse_mode: { _: 'textParseModeHTML' },
        });
      } else {
        formattedText = { _: 'formattedText', text, entities: [] };
      }

      // Build input content
      const inputContent: Td.inputMessageText = {
        _: 'inputMessageText',
        text: formattedText,
        disable_web_page_preview: '--no-preview' in flags,
        clear_draft: true,
      };

      // sendMessage returns a provisional local message with a temporary ID.
      // The real server-assigned ID arrives via updateMessageSendSucceeded.
      // We subscribe to updates BEFORE sending so we can't miss the event.
      const SEND_TIMEOUT_MS = 5_000;

      const serverMessage = await new Promise<Td.message>((resolve, reject) => {
        let provisionalId: number | undefined;
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
          settled = true;
          if (timer) clearTimeout(timer);
          client.off('update', handler);
        };

        function handler(update: Td.Update) {
          if (provisionalId === undefined) return;
          if (
            update._ === 'updateMessageSendSucceeded' &&
            update.old_message_id === provisionalId
          ) {
            cleanup();
            resolve(update.message);
          } else if (
            update._ === 'updateMessageSendFailed' &&
            update.old_message_id === provisionalId
          ) {
            cleanup();
            reject(new Error(update.error_message || `Send failed (code ${update.error_code})`));
          }
        }

        // Subscribe before sending so we don't miss the update
        client.on('update', handler);

        client
          .invoke({
            _: 'sendMessage',
            chat_id: chatId,
            message_thread_id: 0,
            reply_to: flags['--reply-to']
              ? { _: 'inputMessageReplyToMessage', message_id: Number(flags['--reply-to']) }
              : undefined,
            options: {
              _: 'messageSendOptions',
              disable_notification: '--silent' in flags,
              from_background: false,
              protect_content: false,
              update_order_of_installed_sticker_sets: false,
              scheduling_state: undefined,
              effect_id: '0',
              sending_id: 0,
              only_preview: false,
            },
            input_message_content: inputContent,
          } as Td.sendMessage)
          .then(
            (result) => {
              if (settled) return;
              provisionalId = result.id;
              // Start timeout only after we have the provisional ID
              timer = setTimeout(() => {
                if (settled) return;
                cleanup();
                warn('Timed out waiting for server ID; returning provisional message');
                resolve(result);
              }, SEND_TIMEOUT_MS);
            },
            (err) => {
              if (settled) return;
              cleanup();
              reject(err);
            },
          );
      });

      success(strip(slimMessage(serverMessage)));
    },
  },

  // --- Search ---
  {
    name: 'search',
    description: 'Search messages globally or in a specific chat',
    usage:
      'tg search "<query>" [--chat <id>] [--limit N] [--from <user>] [--since N] [--type user|group|channel] [--filter photo|video|document|url|voice|gif|music] [--context N] [--offset-id N] [--offset "cursor"] [--offset-cursor "cursor"] [--full]',
    flags: {
      '--chat': 'Search in a specific chat (default: global)',
      '--limit': 'Max results (default: 20)',
      '--from': 'Filter by sender (requires --chat)',
      '--since': 'Only messages after this unix timestamp',
      '--type': 'Filter by chat type: user, group, or channel (global search only)',
      '--filter':
        'Filter by media type: photo, video, document, url, voice, gif, music (per-chat only)',
      '--context': 'Include N messages before and after each hit',
      '--offset-id': 'Paginate per-chat search: message ID from previous nextOffset',
      '--offset': 'Paginate global search: cursor from previous nextOffset',
      '--offset-cursor': 'Alias for --offset',
      '--full': 'Return full message text (default: truncated to 500 chars)',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <query>', 'INVALID_ARGS');
      const query = args[0];
      const limit = parseLimit(flags, 20);
      const contextN = flags['--context'] ? Number(flags['--context']) : 0;
      if (
        contextN &&
        (!Number.isFinite(contextN) || contextN < 1 || contextN !== Math.floor(contextN))
      ) {
        fail('--context must be a positive integer', 'INVALID_ARGS');
      }

      if (flags['--chat']) {
        // Per-chat search
        const chatId = await resolveChatId(client, flags['--chat']);

        let senderOption: Td.MessageSender | undefined;
        if (flags['--from']) {
          const fromId = await resolveEntity(client, flags['--from']);
          if (fromId > 0) {
            senderOption = { _: 'messageSenderUser', user_id: fromId };
          } else {
            senderOption = { _: 'messageSenderChat', chat_id: fromId };
          }
        }

        let searchFilter: Td.SearchMessagesFilter = {
          _: 'searchMessagesFilterEmpty',
        };
        if (flags['--filter']) {
          const filterMap: Record<string, Td.SearchMessagesFilter> = {
            photo: { _: 'searchMessagesFilterPhoto' },
            video: { _: 'searchMessagesFilterVideo' },
            document: { _: 'searchMessagesFilterDocument' },
            url: { _: 'searchMessagesFilterUrl' },
            voice: { _: 'searchMessagesFilterVoiceNote' },
            gif: { _: 'searchMessagesFilterAnimation' },
            music: { _: 'searchMessagesFilterAudio' },
          };
          const f = filterMap[flags['--filter']];
          if (!f)
            fail(
              `Invalid --filter "${flags['--filter']}". Expected: ${Object.keys(filterMap).join(', ')}`,
              'INVALID_ARGS',
            );
          searchFilter = f;
        }

        const result = await client.invoke({
          _: 'searchChatMessages',
          chat_id: chatId,
          query,
          sender_id: senderOption ?? null,
          from_message_id: flags['--offset-id'] ? Number(flags['--offset-id']) : 0,
          offset: 0,
          limit,
          filter: searchFilter,
          message_thread_id: 0,
        } as Td.searchChatMessages);

        let messages = result.messages.filter((m): m is Td.message => m !== null);
        if (flags['--since']) {
          const since = Number(flags['--since']);
          messages = messages.filter((m) => m.date >= since);
        }

        const full = '--full' in flags;
        let results: Record<string, unknown>[] = messages.map((m) => {
          const slim = {
            ...(strip(slimMessage(m)) as Record<string, unknown>),
            chat_id: m.chat_id,
          };
          return full ? slim : truncateContent(slim);
        });

        if (contextN > 0) {
          results = await enrichWithContext(client, chatId, results, contextN);
        }

        const hasMore = messages.length >= limit;
        success(results, {
          hasMore,
          ...(hasMore && messages.length > 0
            ? { nextOffset: messages[messages.length - 1]?.id }
            : {}),
        });
      } else {
        // Global search
        if (flags['--from']) {
          fail(
            '--from requires --chat for per-chat search. Global search does not support sender filtering.',
            'INVALID_ARGS',
          );
        }
        const typeFilter = flags['--type'];
        if (typeFilter && !VALID_CHAT_TYPES.has(typeFilter)) {
          fail(`Invalid --type "${typeFilter}". Expected: user, group, or channel`, 'INVALID_ARGS');
        }

        const cursor = flags['--offset'] ?? flags['--offset-cursor'] ?? '';

        const result = await client.invoke({
          _: 'searchMessages',
          chat_list: undefined,
          query,
          offset: cursor,
          limit,
          filter: undefined,
          min_date: flags['--since'] ? Number(flags['--since']) : 0,
          max_date: 0,
        } as Td.searchMessages);

        let messages = result.messages.filter((m): m is Td.message => m !== null);

        // Filter by chat type — need on-demand chat lookups
        if (typeFilter) {
          const filtered: Td.message[] = [];
          for (const m of messages) {
            try {
              const chat = await client.invoke({
                _: 'getChat',
                chat_id: m.chat_id,
              });
              if (getChatType(chat) === typeFilter) {
                filtered.push(m);
              }
            } catch {
              // skip messages from chats we can't resolve
            }
          }
          messages = filtered;
        }

        const full = '--full' in flags;
        const formattedPromises = messages.map(async (m) => {
          let chatTitle = '';
          try {
            const chat = await client.invoke({
              _: 'getChat',
              chat_id: m.chat_id,
            });
            chatTitle = chat.title;
          } catch {
            // skip
          }
          const slim = {
            ...(strip(slimMessage(m)) as Record<string, unknown>),
            chat_id: m.chat_id,
            chat_title: chatTitle,
          };
          return full ? slim : truncateContent(slim);
        });
        let formatted = await Promise.all(formattedPromises);

        if (contextN > 0) {
          // For global search, enrich each result with context from its chat
          const MAX_CONTEXT = 5;
          const enriched: Record<string, unknown>[] = [];
          for (let i = 0; i < formatted.length; i++) {
            if (i >= MAX_CONTEXT) {
              enriched.push({ ...formatted[i], context: [] });
              continue;
            }
            const msg = messages[i];
            if (!msg) continue;
            const msgChatId = msg.chat_id;
            const msgId = msg.id;
            try {
              const ctx = await client.invoke({
                _: 'getChatHistory',
                chat_id: msgChatId,
                from_message_id: msgId,
                offset: -contextN,
                limit: contextN * 2 + 1,
                only_local: false,
              });
              const context = strip(
                slimMessages(
                  ctx.messages.filter(
                    (cm): cm is Td.message => cm !== undefined && cm.id !== msgId,
                  ),
                ),
              );
              enriched.push({ ...formatted[i], context });
            } catch {
              enriched.push({ ...formatted[i], context: [] });
            }
          }
          formatted = enriched as typeof formatted;
        }

        const hasMore = messages.length >= limit;
        success(formatted, {
          hasMore,
          ...(hasMore && result.next_offset ? { nextOffset: result.next_offset } : {}),
        });
      }
    },
  },

  // --- Search Global (alias) ---
  {
    name: 'search-global',
    description: 'Search messages globally (alias for search without --chat)',
    usage:
      'tg search-global "<query>" [--limit N] [--since N] [--type user|group|channel] [--offset "cursor"]',
    flags: {
      '--limit': 'Max results (default: 20)',
      '--since': 'Only messages after this unix timestamp',
      '--type': 'Filter by chat type: user, group, or channel',
      '--offset': 'Paginate: cursor from previous nextOffset',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      // Delegate to search command (global mode = no --chat)
      const searchCmd = commands.find((c) => c.name === 'search');
      if (!searchCmd) fail('Internal error: search command not found', 'UNKNOWN');
      // Remove --chat if accidentally passed
      const cleanFlags = { ...flags };
      delete cleanFlags['--chat'];
      await searchCmd.run(client, args, cleanFlags);
    },
  },

  // --- Search Contacts ---
  {
    name: 'search-contacts',
    description: 'Search contacts and global users',
    usage: 'tg search-contacts "<query>" [--limit N]',
    flags: {
      '--limit': 'Max results (default: 50)',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <query>', 'INVALID_ARGS');
      const query = args[0];
      const limit = parseLimit(flags, 50);

      const result = await client.invoke({
        _: 'searchContacts',
        query,
        limit,
      });

      const myResults: Td.user[] = [];
      const globalResults: Td.user[] = [];

      for (const userId of result.user_ids) {
        const user = await client.invoke({ _: 'getUser', user_id: userId });
        // Contacts with phone numbers are "my" contacts
        if (user.phone_number) {
          myResults.push(user);
        } else {
          globalResults.push(user);
        }
      }

      success(strip({ myResults: slimUsers(myResults), globalResults: slimUsers(globalResults) }));
    },
  },

  // --- Chat info ---
  {
    name: 'chat',
    description: 'Get detailed info about a chat or user',
    usage: 'tg chat <id|username>',
    minArgs: 1,
    run: async (client, args) => {
      if (!args[0]) fail('Missing required argument: <id|username>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
      if (chat.type._ === 'chatTypePrivate') {
        const user = await client.invoke({
          _: 'getUser',
          user_id: chat.type.user_id,
        });
        success(strip({ chat: slimChat(chat), user: slimUser(user) }));
      } else {
        success(strip({ chat: slimChat(chat) }));
      }
    },
  },

  // --- Resolve ---
  {
    name: 'resolve',
    description: 'Resolve a username, phone, or t.me link to entity info',
    usage: 'tg resolve <username|phone|link>',
    minArgs: 1,
    run: async (client, args) => {
      if (!args[0]) fail('Missing required argument: <username|phone|link>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
      if (chat.type._ === 'chatTypePrivate') {
        const user = await client.invoke({
          _: 'getUser',
          user_id: chat.type.user_id,
        });
        success(strip({ chat: slimChat(chat), user: slimUser(user) }));
      } else {
        success(strip({ chat: slimChat(chat) }));
      }
    },
  },

  // --- Read ---
  {
    name: 'read',
    description: 'Mark messages as read in a chat',
    usage: 'tg read <chat>',
    minArgs: 1,
    run: async (client, args) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      // Get latest message to mark as read
      const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
      if (chat.last_message) {
        await client.invoke({
          _: 'viewMessages',
          chat_id: chatId,
          message_ids: [chat.last_message.id],
          source: { _: 'messageSourceChatHistory' },
          force_read: true,
        });
      }
      success({ chat: args[0], marked: true });
    },
  },

  // --- Edit ---
  {
    name: 'edit',
    description: 'Edit a sent message',
    usage: 'tg edit <chat> <msgId> "<new text>" [--md] [--html] [--stdin] [--file path]',
    flags: {
      '--md': 'Parse Telegram MarkdownV2: *bold* _italic_ `code` ~strike~ ||spoiler||',
      '--html': 'Parse HTML: <b>bold</b> <i>italic</i> <code>code</code>',
      '--stdin': 'Read message text from stdin (pipe input)',
      '--file': 'Read message text from file path',
    },
    minArgs: 3,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
      if (!args[2]) fail('Missing required argument: <new text>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const text = args[2];

      let formattedText: Td.formattedText;
      if ('--md' in flags) {
        formattedText = await client.invoke({
          _: 'parseTextEntities',
          text,
          parse_mode: { _: 'textParseModeMarkdown', version: 2 },
        });
      } else if ('--html' in flags) {
        formattedText = await client.invoke({
          _: 'parseTextEntities',
          text,
          parse_mode: { _: 'textParseModeHTML' },
        });
      } else {
        formattedText = { _: 'formattedText', text, entities: [] };
      }

      const result = await client.invoke({
        _: 'editMessageText',
        chat_id: chatId,
        message_id: Number(args[1]),
        reply_markup: undefined,
        input_message_content: {
          _: 'inputMessageText',
          text: formattedText,
          link_preview_options: undefined,
          clear_draft: false,
        },
      } as Td.editMessageText);

      success(strip(slimMessage(result)));
    },
  },

  // --- Delete ---
  {
    name: 'delete',
    description: 'Delete messages from a chat',
    usage: 'tg delete <chat> <msgId> [msgId...] [--revoke]',
    flags: {
      '--revoke': 'Delete for everyone (default: delete only for yourself)',
    },
    minArgs: 2,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const ids = args.slice(1).map(Number);
      const revoke = '--revoke' in flags;
      await client.invoke({
        _: 'deleteMessages',
        chat_id: chatId,
        message_ids: ids,
        revoke,
      });
      success({ chat: chatId, deleted: ids });
    },
  },

  // --- Forward ---
  {
    name: 'forward',
    description: 'Forward messages from one chat to another',
    usage: 'tg forward <from-chat> <to-chat> <msgId> [msgId...] [--silent]',
    flags: {
      '--silent': 'Forward without notification',
    },
    minArgs: 3,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <from-chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <to-chat>', 'INVALID_ARGS');
      if (!args[2]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
      const fromChatId = await resolveChatId(client, args[0]);
      const toChatId = await resolveChatId(client, args[1]);
      const ids = args.slice(2).map(Number);
      const silent = '--silent' in flags;

      // forwardMessages returns provisional local messages with temporary IDs.
      // The real server-assigned IDs arrive via updateMessageSendSucceeded.
      // We subscribe to updates BEFORE sending so we can't miss any events.
      const SEND_TIMEOUT_MS = 5_000;

      const confirmedMessages = await new Promise<Td.message[]>((resolve, reject) => {
        const provisionalIds = new Set<number>();
        const confirmed = new Map<number, Td.message>();
        let provisionalCount: number | undefined;
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
          settled = true;
          if (timer) clearTimeout(timer);
          client.off('update', handler);
        };

        const tryResolve = () => {
          if (provisionalCount !== undefined && confirmed.size >= provisionalCount) {
            cleanup();
            resolve(Array.from(confirmed.values()));
          }
        };

        function handler(update: Td.Update) {
          if (provisionalCount === undefined) return;
          if (
            update._ === 'updateMessageSendSucceeded' &&
            provisionalIds.has(update.old_message_id)
          ) {
            confirmed.set(update.old_message_id, update.message);
            tryResolve();
          } else if (
            update._ === 'updateMessageSendFailed' &&
            provisionalIds.has(update.old_message_id)
          ) {
            // Treat a failed message as "confirmed" with the error so we don't hang
            // waiting forever. The timeout fallback will still return what we have.
            provisionalIds.delete(update.old_message_id);
            provisionalCount = provisionalIds.size;
            tryResolve();
          }
        }

        // Subscribe before sending so we don't miss the updates
        client.on('update', handler);

        client
          .invoke({
            _: 'forwardMessages',
            chat_id: toChatId,
            message_thread_id: 0,
            from_chat_id: fromChatId,
            message_ids: ids,
            options: {
              _: 'messageSendOptions',
              disable_notification: silent,
              from_background: false,
              protect_content: false,
              update_order_of_installed_sticker_sets: false,
              scheduling_state: undefined,
              effect_id: '0',
              sending_id: 0,
              only_preview: false,
            },
            send_copy: false,
            remove_caption: false,
          } as Td.forwardMessages)
          .then(
            (result) => {
              if (settled) return;
              const validMessages = result.messages.filter((m): m is Td.message => m !== undefined);
              for (const msg of validMessages) {
                provisionalIds.add(msg.id);
              }
              provisionalCount = provisionalIds.size;
              // If no messages were returned (shouldn't happen), resolve immediately
              if (provisionalCount === 0) {
                cleanup();
                resolve([]);
                return;
              }
              // Check if any already confirmed while we were setting up
              tryResolve();
              // Start timeout only after we have the provisional IDs
              timer = setTimeout(() => {
                if (settled) return;
                cleanup();
                if (confirmed.size > 0) {
                  warn(
                    `Timed out waiting for server IDs; ${confirmed.size}/${provisionalCount} confirmed`,
                  );
                  resolve(Array.from(confirmed.values()));
                } else {
                  warn('Timed out waiting for server IDs; returning provisional messages');
                  resolve(validMessages);
                }
              }, SEND_TIMEOUT_MS);
            },
            (err) => {
              if (settled) return;
              cleanup();
              reject(err);
            },
          );
      });

      success(strip(slimMessages(confirmedMessages)));
    },
  },

  // --- Download ---
  {
    name: 'download',
    description: 'Download media from a message',
    usage: 'tg download <chat> <msgId> [--output path]',
    flags: {
      '--output': 'Output file path (default: auto-named in cwd)',
    },
    minArgs: 2,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const msg = await client.invoke({
        _: 'getMessage',
        chat_id: chatId,
        message_id: Number(args[1]),
      });
      const fileId = getFileId(msg.content);
      if (!fileId) fail('Message has no downloadable media', 'NOT_FOUND');

      const downloaded = await client.invoke({
        _: 'downloadFile',
        file_id: fileId,
        priority: 1,
        offset: 0,
        limit: 0,
        synchronous: true,
      });

      if (!downloaded.local.is_downloading_completed) {
        fail('Failed to download media', 'UNKNOWN');
      }

      const localPath = downloaded.local.path;
      const outputFile = flags['--output'] || `tg_${args[0]}_${args[1]}.bin`;
      if (flags['--output']) {
        // Copy to output path
        copyFileSync(localPath, outputFile);
      }

      success({
        file: path.resolve(flags['--output'] ? outputFile : localPath),
        size: downloaded.size,
        mime_type: getContentMimeType(msg.content),
      });
    },
  },

  // --- Contacts ---
  {
    name: 'contacts',
    description: 'List or search your saved contacts',
    usage: 'tg contacts [--limit N] [--search query] [--offset N]',
    flags: {
      '--limit': 'Max contacts to return (default: 100)',
      '--search': 'Search contacts by name',
      '--offset': 'Start from this index (for pagination)',
    },
    run: async (client, _args, flags) => {
      const limit = parseLimit(flags, 100);
      const offset = flags['--offset'] ? Number(flags['--offset']) : 0;

      if (flags['--search']) {
        const result = await client.invoke({
          _: 'searchContacts',
          query: flags['--search'],
          limit,
        });
        const userList: Td.user[] = [];
        for (const userId of result.user_ids) {
          const user = await client.invoke({
            _: 'getUser',
            user_id: userId,
          });
          userList.push(user);
        }
        success(strip(slimUsers(userList)), { hasMore: false });
      } else {
        const result = await client.invoke({
          _: 'getContacts',
        });
        const sliced = result.user_ids.slice(offset, offset + limit);
        const hasMore = result.user_ids.length > offset + limit;
        const userList: Td.user[] = [];
        for (const userId of sliced) {
          const user = await client.invoke({
            _: 'getUser',
            user_id: userId,
          });
          userList.push(user);
        }
        success(strip(slimUsers(userList)), {
          hasMore,
          nextOffset: hasMore ? offset + limit : undefined,
        });
      }
    },
  },

  // --- Photo ---
  {
    name: 'photo',
    description: 'Download a profile photo of a user or chat',
    usage: 'tg photo <id|username|me> [--output path] [--big]',
    flags: {
      '--output': 'Output file path (default: /tmp/tg_photo_<id>.jpg)',
      '--big': 'Download high-resolution version',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <id|username|me>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
      if (!chat.photo) fail('No profile photo found', 'NOT_FOUND');

      const photoFile = '--big' in flags ? chat.photo.big : chat.photo.small;
      const downloaded = await client.invoke({
        _: 'downloadFile',
        file_id: photoFile.id,
        priority: 1,
        offset: 0,
        limit: 0,
        synchronous: true,
      });

      if (!downloaded.local.is_downloading_completed) {
        fail('Failed to download profile photo', 'NOT_FOUND');
      }

      const label = args[0].replace(/[^a-zA-Z0-9_-]/g, '_');
      const outputFile = flags['--output'] || path.join(tmpdir(), `tg_photo_${label}.jpg`);
      copyFileSync(downloaded.local.path, outputFile);

      success({ file: path.resolve(outputFile), size: downloaded.size });
    },
  },

  // --- Members ---
  {
    name: 'members',
    description: 'List members of a group or channel',
    usage:
      'tg members <chat> [--limit N] [--search text] [--offset N] [--type bot|admin|recent] [--filter bot|admin|recent]',
    flags: {
      '--limit': 'Max members (default: 100)',
      '--search': 'Search members by name',
      '--offset': 'Offset for pagination',
      '--type': 'Filter by type: bot, admin, recent (default: recent)',
      '--filter': 'Alias for --type',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
      const limit = parseLimit(flags, 100);
      const search = flags['--search'] || '';
      const offset = flags['--offset'] ? Number(flags['--offset']) : 0;

      const typeFlag = flags['--type'] ?? flags['--filter'];

      if (chat.type._ === 'chatTypeSupergroup') {
        let filter: Td.SupergroupMembersFilter;
        if (typeFlag === 'bot') {
          filter = { _: 'supergroupMembersFilterBots' };
        } else if (typeFlag === 'admin') {
          filter = { _: 'supergroupMembersFilterAdministrators' };
        } else if (search) {
          filter = { _: 'supergroupMembersFilterSearch', query: search };
        } else {
          filter = { _: 'supergroupMembersFilterRecent' };
        }

        const result = await client.invoke({
          _: 'getSupergroupMembers',
          supergroup_id: chat.type.supergroup_id,
          filter,
          offset,
          limit,
        });

        const hasMore = result.members.length >= limit;
        success(strip(slimMembers(result.members)), {
          hasMore,
          nextOffset: hasMore ? offset + limit : undefined,
        });
      } else if (chat.type._ === 'chatTypeBasicGroup') {
        const result = await client.invoke({
          _: 'getBasicGroupFullInfo',
          basic_group_id: chat.type.basic_group_id,
        });

        let members = result.members;
        if (search) {
          const q = search.toLowerCase();
          const filteredMembers: typeof members = [];
          for (const m of members) {
            const userId = m.member_id._ === 'messageSenderUser' ? m.member_id.user_id : 0;
            if (userId) {
              try {
                const user = await client.invoke({
                  _: 'getUser',
                  user_id: userId,
                });
                const name = [user.first_name, user.last_name]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
                if (name.includes(q)) filteredMembers.push(m);
              } catch {
                // skip unresolvable users
              }
            }
          }
          members = filteredMembers;
        }
        if (typeFlag === 'bot') {
          const botMembers: typeof members = [];
          for (const m of members) {
            const userId = m.member_id._ === 'messageSenderUser' ? m.member_id.user_id : 0;
            if (userId) {
              try {
                const user = await client.invoke({
                  _: 'getUser',
                  user_id: userId,
                });
                if (user.type._ === 'userTypeBot') botMembers.push(m);
              } catch {
                // skip
              }
            }
          }
          members = botMembers;
        } else if (typeFlag === 'admin') {
          members = members.filter(
            (m) =>
              m.status._ === 'chatMemberStatusAdministrator' ||
              m.status._ === 'chatMemberStatusCreator',
          );
        }

        const sliced = members.slice(offset, offset + limit);
        const hasMore = members.length > offset + limit;

        success(strip(slimMembers(sliced)), {
          hasMore,
          nextOffset: hasMore ? offset + limit : undefined,
        });
      } else {
        fail('Chat is not a group or channel', 'INVALID_ARGS');
      }
    },
  },

  // --- Pin ---
  {
    name: 'pin',
    description: 'Pin a message in a chat',
    usage: 'tg pin <chat> <msgId> [--silent]',
    flags: {
      '--silent': 'Pin without notification',
    },
    minArgs: 2,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const silent = '--silent' in flags;
      await client.invoke({
        _: 'pinChatMessage',
        chat_id: chatId,
        message_id: Number(args[1]),
        disable_notification: silent,
        only_for_self: false,
      });
      success({ chat: args[0], pinned: Number(args[1]) });
    },
  },

  // --- Unpin ---
  {
    name: 'unpin',
    description: 'Unpin a message or all messages in a chat',
    usage: 'tg unpin <chat> [msgId] [--all]',
    flags: {
      '--all': 'Unpin all messages',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      if ('--all' in flags) {
        await client.invoke({
          _: 'unpinAllChatMessages',
          chat_id: chatId,
        });
        success({ chat: args[0], unpinnedAll: true });
      } else {
        if (!args[1]) fail('Missing <msgId> or --all flag', 'INVALID_ARGS');
        await client.invoke({
          _: 'unpinChatMessage',
          chat_id: chatId,
          message_id: Number(args[1]),
        });
        success({ chat: args[0], unpinned: Number(args[1]) });
      }
    },
  },

  // --- React ---
  {
    name: 'react',
    description: 'Add or remove a reaction on a message',
    usage: 'tg react <chat> <msgId> <emoji> [--remove]',
    flags: {
      '--remove': 'Remove the reaction instead of adding',
      '--big': 'Send big animation',
    },
    minArgs: 3,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
      if (!args[2]) fail('Missing required argument: <emoji>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const msgId = Number(args[1]);
      const emoji = args[2].replace(/[\uFE0E\uFE0F]/g, '');
      const remove = '--remove' in flags;
      const big = '--big' in flags;

      try {
        if (remove) {
          await client.invoke({
            _: 'removeMessageReaction',
            chat_id: chatId,
            message_id: msgId,
            reaction_type: { _: 'reactionTypeEmoji', emoji },
          });
        } else {
          await client.invoke({
            _: 'addMessageReaction',
            chat_id: chatId,
            message_id: msgId,
            reaction_type: { _: 'reactionTypeEmoji', emoji },
            is_big: big,
            update_recent_reactions: true,
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/REACTION_INVALID/i.test(msg)) {
          fail(
            `Reaction "${emoji}" is invalid — this emoji may not be allowed in this chat`,
            'INVALID_ARGS',
          );
        }
        throw e;
      }
      success({
        chat: args[0],
        msgId,
        emoji,
        action: remove ? 'removed' : 'added',
      });
    },
  },

  // --- Eval ---
  {
    name: 'eval',
    description: 'Execute JavaScript with a connected TDLib client',
    usage: 'tg eval "<code>"',
    flags: {},
    minArgs: 1,
    run: async (client, args) => {
      const code = args.join(' ');
      const fn = new Function(
        'client',
        'success',
        'fail',
        'strip',
        'fs',
        'path',
        `return (async () => { ${code} })()`,
      );
      const fs = await import('node:fs');
      const result = await fn(client, success, fail, strip, fs, path);
      if (result !== undefined) {
        try {
          success(strip(result));
        } catch {
          fail('eval returned a non-serializable value', 'INVALID_ARGS');
        }
      }
    },
  },

  // --- List ---
  {
    name: 'list',
    description: 'List all available commands as JSON',
    usage: 'tg list',
    run: async () => {
      success(
        commands
          .filter((c) => c.name !== 'list')
          .map((c) => ({
            name: c.name,
            description: c.description,
            usage: c.usage,
            options: c.flags,
            minArgs: c.minArgs ?? 0,
          })),
      );
    },
  },

  // --- Download Photo (cached) ---
  {
    name: 'download-photo-cached',
    description: 'Download a profile photo to the media cache',
    usage: 'tg download-photo-cached <id|username|me> [--big]',
    flags: {
      '--big': 'Download high-resolution version',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <id|username|me>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
      if (!chat.photo) fail('No profile photo found', 'NOT_FOUND');

      const photoFile = '--big' in flags ? chat.photo.big : chat.photo.small;

      // Check if already downloaded
      if (photoFile.local.is_downloading_completed && photoFile.local.path) {
        success({ file: photoFile.local.path, cached: true });
        return;
      }

      const downloaded = await client.invoke({
        _: 'downloadFile',
        file_id: photoFile.id,
        priority: 1,
        offset: 0,
        limit: 0,
        synchronous: true,
      });

      if (!downloaded.local.is_downloading_completed) {
        fail('Failed to download profile photo', 'NOT_FOUND');
      }

      success({
        file: downloaded.local.path,
        size: downloaded.size,
        cached: false,
      });
    },
  },

  // --- Download Media (cached) ---
  {
    name: 'download-media-cached',
    description: 'Download message media to the media cache',
    usage: 'tg download-media-cached <chat> <msgId>',
    minArgs: 2,
    run: async (client, args) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const msgId = Number(args[1]);
      const msg = await client.invoke({
        _: 'getMessage',
        chat_id: chatId,
        message_id: msgId,
      });
      const fileId = getFileId(msg.content);
      if (!fileId) fail('Message has no downloadable media', 'NOT_FOUND');

      const downloaded = await client.invoke({
        _: 'downloadFile',
        file_id: fileId,
        priority: 1,
        offset: 0,
        limit: 0,
        synchronous: true,
      });

      if (!downloaded.local.is_downloading_completed) {
        fail('Download failed', 'UNKNOWN');
      }

      const mime = getContentMimeType(msg.content);
      success({
        file: downloaded.local.path,
        size: downloaded.size,
        cached: false,
        mime,
      });
    },
  },

  // --- Open/Close Chat ---
  {
    name: 'open-chat',
    description: 'Notify TDLib that a chat is being viewed',
    usage: 'tg open-chat <chat>',
    minArgs: 1,
    run: async (client, args) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      await client.invoke({ _: 'openChat', chat_id: chatId });
      success({ chat_id: chatId });
    },
  },
  {
    name: 'close-chat',
    description: 'Notify TDLib that a chat is no longer being viewed',
    usage: 'tg close-chat <chat>',
    minArgs: 1,
    run: async (client, args) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      await client.invoke({ _: 'closeChat', chat_id: chatId });
      success({ chat_id: chatId });
    },
  },

  // --- Listen ---
  {
    name: 'listen',
    description: 'Stream real-time events (NDJSON). Requires --chat or --type.',
    usage:
      'tg listen --type user|group|channel [--chat <ids>] [--exclude-chat <ids>] [--exclude-type <type>] [--incoming] [--download-media]',
    flags: {
      '--chat': 'Comma-separated chat IDs to include',
      '--type': 'Include entire category: user, group, or channel',
      '--exclude-chat': 'Comma-separated chat IDs to exclude from included set',
      '--exclude-type': 'Exclude category: user, group, or channel',
      '--incoming': 'Only include incoming messages (filter out outgoing)',
      '--download-media': 'Auto-download photos, stickers, voice messages',
    },
    streaming: true,
    run: async (client, _args, flags) => {
      const emit = (event: Record<string, unknown>) => {
        process.stdout.write(`${JSON.stringify(event)}\n`);
      };

      const typeFilter = flags['--type'];
      const excludeType = flags['--exclude-type'];
      const chatIds = new Set(
        flags['--chat']
          ?.split(',')
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [],
      );
      const excludeChatIds = new Set(
        flags['--exclude-chat']
          ?.split(',')
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [],
      );
      const downloadMedia = '--download-media' in flags;
      const incomingOnly = '--incoming' in flags;

      if (!chatIds.size && !typeFilter) {
        fail('Must specify --chat or --type (default is all excluded)', 'INVALID_ARGS');
      }

      if (typeFilter && !VALID_CHAT_TYPES.has(typeFilter)) {
        fail(`Invalid --type "${typeFilter}". Expected: user, group, or channel`, 'INVALID_ARGS');
      }
      if (excludeType && !VALID_CHAT_TYPES.has(excludeType)) {
        fail(
          `Invalid --exclude-type "${excludeType}". Expected: user, group, or channel`,
          'INVALID_ARGS',
        );
      }

      // Cache for chat type lookups to avoid repeated network calls
      const chatTypeCache = new Map<number, 'user' | 'group' | 'channel' | 'unknown'>();

      const getCachedChatType = async (
        chatIdNum: number,
      ): Promise<'user' | 'group' | 'channel' | 'unknown'> => {
        const cached = chatTypeCache.get(chatIdNum);
        if (cached) return cached;
        try {
          const chat = await client.invoke({
            _: 'getChat',
            chat_id: chatIdNum,
          });
          const t = getChatType(chat);
          chatTypeCache.set(chatIdNum, t);
          return t;
        } catch {
          return 'unknown';
        }
      };

      const shouldSkip = async (chatIdNum: number): Promise<boolean> => {
        const chatIdStr = chatIdNum.toString();
        const chatType = await getCachedChatType(chatIdNum);

        if (excludeChatIds.size && excludeChatIds.has(chatIdStr)) return true;
        if (excludeType && chatType === excludeType) return true;
        if (chatIds.size && chatIds.has(chatIdStr)) return false;
        if (typeFilter && chatType === typeFilter) return false;
        return true;
      };

      // Track connection state for reconnection detection
      let wasDisconnected = false;

      client.on('update', (update: Td.Update) => {
        // Wrap in async IIFE since the handler is sync
        (async () => {
          try {
            // --- Auth state (always emit, no filter) ---
            if (update._ === 'updateAuthorizationState') {
              emit({
                type: 'auth_state',
                authorization_state: update.authorization_state,
              });
            }

            // --- Connection state (reconnection detection) ---
            if (update._ === 'updateConnectionState') {
              if (update.state._ === 'connectionStateReady') {
                if (wasDisconnected) {
                  emit({ type: 'reconnected' });
                  wasDisconnected = false;
                }
              } else {
                wasDisconnected = true;
              }
            }

            // --- New messages ---
            if (update._ === 'updateNewMessage') {
              const msg = update.message;
              if (await shouldSkip(msg.chat_id)) return;
              if (incomingOnly && msg.is_outgoing) return;
              if (downloadMedia && shouldAutoDownloadContent(msg.content)) {
                const fileId = getFileId(msg.content);
                if (fileId) {
                  try {
                    await client.invoke({
                      _: 'downloadFile',
                      file_id: fileId,
                      priority: 1,
                      offset: 0,
                      limit: 0,
                      synchronous: true,
                    });
                  } catch {
                    // emit even if download fails
                  }
                  emit({
                    type: 'new_message',
                    chat_id: msg.chat_id,
                    message: slimMessage(msg),
                  });
                  return;
                }
              }
              emit({
                type: 'new_message',
                chat_id: msg.chat_id,
                message: slimMessage(msg),
              });
            }

            // --- Edited messages ---
            if (update._ === 'updateMessageContent') {
              if (await shouldSkip(update.chat_id)) return;
              try {
                const msg = await client.invoke({
                  _: 'getMessage',
                  chat_id: update.chat_id,
                  message_id: update.message_id,
                });
                emit({
                  type: 'edit_message',
                  chat_id: update.chat_id,
                  message: slimMessage(msg),
                });
              } catch {
                /* skip errors */
              }
            }

            // --- Edited message date ---
            if (update._ === 'updateMessageEdited') {
              if (await shouldSkip(update.chat_id)) return;
              try {
                const msg = await client.invoke({
                  _: 'getMessage',
                  chat_id: update.chat_id,
                  message_id: update.message_id,
                });
                emit({
                  type: 'edit_message',
                  chat_id: update.chat_id,
                  message: slimMessage(msg),
                });
              } catch {
                /* skip errors */
              }
            }

            // --- Deleted messages ---
            if (update._ === 'updateDeleteMessages') {
              if (await shouldSkip(update.chat_id)) return;
              if (!update.is_permanent) return;
              emit({
                type: 'delete_messages',
                chat_id: update.chat_id,
                message_ids: update.message_ids,
              });
            }

            // --- Read outbox ---
            if (update._ === 'updateChatReadOutbox') {
              if (await shouldSkip(update.chat_id)) return;
              emit({
                type: 'read_outbox',
                chat_id: update.chat_id,
                last_read_outbox_message_id: update.last_read_outbox_message_id,
              });
            }

            // --- Typing indicators ---
            if (update._ === 'updateChatAction') {
              if (await shouldSkip(update.chat_id)) return;
              emit({
                type: 'user_typing',
                chat_id: update.chat_id,
                sender_id: update.sender_id,
                action: update.action,
              });
            }

            // --- User status ---
            if (update._ === 'updateUserStatus') {
              emit({
                type: 'user_status',
                user_id: update.user_id,
                status: update.status,
              });
            }

            // --- Message reactions ---
            if (update._ === 'updateMessageInteractionInfo') {
              if (await shouldSkip(update.chat_id)) return;
              if (update.interaction_info?.reactions) {
                emit({
                  type: 'message_reactions',
                  chat_id: update.chat_id,
                  message_id: update.message_id,
                  interaction_info: update.interaction_info,
                });
              }
            }

            // --- Message send succeeded ---
            if (update._ === 'updateMessageSendSucceeded') {
              const msg = update.message;
              if (await shouldSkip(msg.chat_id)) return;
              emit({
                type: 'message_send_succeeded',
                chat_id: msg.chat_id,
                old_message_id: update.old_message_id,
                message: slimMessage(msg),
              });
            }
          } catch {
            /* skip handler errors */
          }
        })();
      });

      warn('Listening for events. Press Ctrl+C to stop.');
      await new Promise<void>(() => {});
    },
  },
];

// --- Command lookup ---

export function getCommand(name: string): Command | undefined {
  return commands.find((c) => c.name === name);
}
