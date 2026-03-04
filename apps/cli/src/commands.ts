/**
 * Command definitions for telegram-ai-v2 CLI.
 * Each command is self-contained with description, usage, flags, and handler.
 *
 * Uses TDLib via the daemon proxy. All Telegram API calls use client.invoke().
 */

import { copyFileSync } from 'node:fs';
import path from 'node:path';
import type { TelegramClient } from '@tg/protocol';
import type * as Td from 'tdlib-types';
import { flattenChats, flattenMessage, flattenMessages } from './flatten';
import { addSenderNames, enrichMessage, enrichMessages, transcribeMessages } from './helpers';
import { fail, strip, success, warn } from './output';
import { resolveChatId, resolveEntity } from './resolve';
import { slimAuthState, slimChat, slimMembers, slimMessage, slimMessages, slimUser } from './slim';

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

const VALID_CHAT_TYPES = new Set(['user', 'bot', 'group', 'channel']);

const VALID_FIND_TYPES = new Set(['bot', 'channel', 'group', 'user', 'contact']);

const VALID_SEARCH_TYPES = new Set(['private', 'group', 'channel']);

const FILTER_MAP: Record<string, string> = {
  photo: 'searchMessagesFilterPhoto',
  video: 'searchMessagesFilterVideo',
  document: 'searchMessagesFilterDocument',
  url: 'searchMessagesFilterUrl',
  voice: 'searchMessagesFilterVoiceNote',
  gif: 'searchMessagesFilterAnimation',
  music: 'searchMessagesFilterAudio',
  media: 'searchMessagesFilterPhotoAndVideo',
  videonote: 'searchMessagesFilterVideoNote',
  mention: 'searchMessagesFilterMention',
  pinned: 'searchMessagesFilterPinned',
};

const GLOBAL_UNSUPPORTED_FILTERS = new Set(['mention', 'pinned']);

const CHAT_TYPE_FILTER_MAP: Record<string, string> = {
  private: 'searchMessagesChatTypeFilterPrivate',
  group: 'searchMessagesChatTypeFilterGroup',
  channel: 'searchMessagesChatTypeFilterChannel',
};

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

function getChatType(
  chat: Td.chat,
  botChatIds?: Set<number>,
): 'user' | 'bot' | 'group' | 'channel' | 'unknown' {
  switch (chat.type._) {
    case 'chatTypePrivate':
      return botChatIds?.has(chat.id) ? 'bot' : 'user';
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

/** Resolve which private chats are bots. Returns a set of chat IDs. */
async function resolveBotChatIds(client: TelegramClient, chats: Td.chat[]): Promise<Set<number>> {
  const botIds = new Set<number>();
  for (const chat of chats) {
    if (chat.type._ === 'chatTypePrivate') {
      try {
        const user = await client.invoke({ _: 'getUser', user_id: chat.type.user_id });
        if (user.type._ === 'userTypeBot') botIds.add(chat.id);
      } catch {
        /* skip */
      }
    }
  }
  return botIds;
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
      const context = flattenMessages(
        slimMessages(ctx.messages.filter((m): m is Td.message => m != null && m.id !== msgId)),
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
  if (typeof result.text === 'string' && result.text.length > maxLen) {
    return { ...result, text: result.text.slice(0, maxLen), truncated: true };
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
      'tg dialogs [--limit N] [--archived] [--unread] [--type user|bot|group|channel] [--search text] [--offset-date N]',
    flags: {
      '--limit': 'Max chats to return (default: 40)',
      '--archived': 'Show archived chats',
      '--unread': 'Only show chats with unread messages',
      '--type': 'Filter by chat type: user, bot, group, or channel',
      '--search': 'Filter by chat title (client-side substring match)',
      '--offset-date': "Paginate: unix timestamp from previous response's nextOffset",
    },
    run: async (client, _args, flags) => {
      const limit = parseLimit(flags, 40);
      const archived = '--archived' in flags;
      const typeFilter = flags['--type'];
      const unreadOnly = '--unread' in flags;
      const searchQuery = flags['--search']?.toLowerCase();
      const offsetDate = flags['--offset-date'] ? Number(flags['--offset-date']) : undefined;
      if (offsetDate !== undefined && (!Number.isFinite(offsetDate) || offsetDate < 0)) {
        fail('--offset-date must be a non-negative unix timestamp', 'INVALID_ARGS');
      }
      if (typeFilter && !VALID_CHAT_TYPES.has(typeFilter)) {
        fail(
          `Invalid --type "${typeFilter}". Expected: user, bot, group, or channel`,
          'INVALID_ARGS',
        );
      }
      const chatList: Td.ChatList = archived ? { _: 'chatListArchive' } : { _: 'chatListMain' };
      const isFiltered = !!(typeFilter || unreadOnly || searchQuery || offsetDate);

      if (isFiltered) {
        // Iterative fetch: keep loading batches until we have enough matching chats
        const BATCH_SIZE = 50;
        const MAX_SCAN = 500;
        const matched: Td.chat[] = [];
        const botChatIds = new Set<number>();
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

              // Resolve bot status for private chats
              let isBot = false;
              if (chat.type._ === 'chatTypePrivate') {
                try {
                  const user = await client.invoke({ _: 'getUser', user_id: chat.type.user_id });
                  isBot = user.type._ === 'userTypeBot';
                  if (isBot) botChatIds.add(chat.id);
                } catch {
                  /* skip */
                }
              }

              let passes = true;
              // offset-date: skip chats whose last message is at or after the offset
              if (offsetDate && (chat.last_message?.date ?? 0) >= offsetDate) passes = false;
              if (passes && unreadOnly && chat.unread_count === 0) passes = false;
              if (passes && typeFilter && getChatType(chat, botChatIds) !== typeFilter)
                passes = false;
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

        const flatF = flattenChats(filtered, botChatIds);
        const metaF = { hasMore, nextOffset: hasMore && lastDate ? lastDate : undefined };

        success(flatF, metaF);
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

        const botChatIds = await resolveBotChatIds(client, chatObjects);

        const hasMore = chatIds.chat_ids.length >= limit;
        const lastChat = chatObjects[chatObjects.length - 1];
        const lastDate = lastChat?.last_message?.date;

        const flatU = flattenChats(chatObjects, botChatIds);
        const metaU = { hasMore, nextOffset: hasMore && lastDate ? lastDate : undefined };

        success(flatU, metaU);
      }
    },
  },

  // --- Unread ---
  {
    name: 'unread',
    description: 'List chats with unread messages',
    usage: 'tg unread [--all] [--type user|bot|group|channel] [--limit N]',
    flags: {
      '--all': 'Include archived chats',
      '--type': 'Filter by chat type: user, bot, group, or channel',
      '--limit': 'Max chats to return',
    },
    run: async (client, _args, flags) => {
      const includeArchived = '--all' in flags;
      const typeFilter = flags['--type'];
      if (typeFilter && !VALID_CHAT_TYPES.has(typeFilter)) {
        fail(
          `Invalid --type "${typeFilter}". Expected: user, bot, group, or channel`,
          'INVALID_ARGS',
        );
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

      const botChatIds = await resolveBotChatIds(client, chatObjects);

      let unread = chatObjects;
      if (typeFilter) {
        unread = unread.filter((c) => getChatType(c, botChatIds) === typeFilter);
      }

      const totalUnread = unread.length;
      unread = unread.slice(0, limit);

      success(flattenChats(unread, botChatIds), { hasMore: totalUnread > limit });
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
      '--transcribe': 'Auto-transcribe voice/video notes (Telegram Premium)',
    },
    minArgs: 1,
    run: async (client, args, flags) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const limit = parseLimit(flags, 20);

      // Search mode (--search or --since)
      if (flags['--search'] || flags['--since']) {
        const query = flags['--search'] ?? '';
        let filter: Td.SearchMessagesFilter$Input = { _: 'searchMessagesFilterEmpty' };
        if (flags['--filter']) {
          const filterMap: Record<string, Td.SearchMessagesFilter$Input> = {
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

        const since = flags['--since'] ? Number(flags['--since']) : undefined;
        const BATCH = 50;
        const MAX_SCAN = 500;
        const matched: Td.message[] = [];
        let cursor = flags['--offset-id'] ? Number(flags['--offset-id']) : 0;
        let scanned = 0;

        let exhaustedSearch = false;

        while (scanned < MAX_SCAN && !exhaustedSearch) {
          const result = await client.invoke({
            _: 'searchChatMessages',
            chat_id: chatId,
            query,
            sender_id: senderOption,
            from_message_id: cursor,
            offset: 0,
            limit: BATCH,
            filter,
          } satisfies Td.searchChatMessages as Td.searchChatMessages);

          const batch = result.messages.filter(
            (m: Td.message | null): m is Td.message => m !== null,
          );
          if (batch.length === 0) {
            exhaustedSearch = true;
            break;
          }
          scanned += batch.length;
          for (const m of batch) {
            if (since && m.date < since) continue;
            matched.push(m);
          }
          cursor = (batch.at(-1) as Td.message).id;

          const flatCount = flattenMessages(slimMessages(matched)).length;
          if (flatCount >= limit) break;
          if (!since && batch.length < BATCH) {
            exhaustedSearch = true;
            break;
          }
        }

        await autoDownloadSmall(client, matched);
        if ('--download-media' in flags) await autoDownloadMessages(client, matched);
        if ('--transcribe' in flags) await transcribeMessages(client, matched);
        const flat = await enrichMessages(client, matched);
        const sliced = flat.slice(0, limit);
        const hasMore = flat.length > limit || (!exhaustedSearch && scanned < MAX_SCAN);
        const meta = {
          hasMore,
          ...(hasMore && matched.length > 0 ? { nextOffset: matched[matched.length - 1]?.id } : {}),
        };

        success(sliced, meta);
        return;
      }

      // Standard history mode
      let fromMessageId = flags['--offset-id'] ? Number(flags['--offset-id']) : 0;

      // Build client-side filter predicate
      const minId = flags['--min-id'] ? Number(flags['--min-id']) : undefined;
      const maxId = flags['--max-id'] ? Number(flags['--max-id']) : undefined;
      const fromEntity = flags['--from'] ? await resolveEntity(client, flags['--from']) : undefined;
      const hasClientFilter = !!(minId || maxId || fromEntity);

      const clientFilter = (m: Td.message): boolean => {
        if (minId && m.id <= minId) return false;
        if (maxId && m.id >= maxId) return false;
        if (fromEntity) {
          const senderId =
            m.sender_id._ === 'messageSenderUser'
              ? m.sender_id.user_id
              : m.sender_id._ === 'messageSenderChat'
                ? m.sender_id.chat_id
                : 0;
          if (senderId !== fromEntity) return false;
        }
        return true;
      };

      // Media filter in history mode
      if (flags['--filter']) {
        const filterMap: Record<string, Td.SearchMessagesFilter$Input> = {
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

        const BATCH = 50;
        const MAX_SCAN = 500;
        const matched: Td.message[] = [];
        let cursor = fromMessageId;
        let scanned = 0;
        let exhausted = false;

        // Fetch enough raw messages so that after album grouping we have >= limit flat entries.
        // Albums collapse multiple raw messages into one flat entry, so we may need to over-fetch.
        while (scanned < MAX_SCAN && !exhausted) {
          const result = await client.invoke({
            _: 'searchChatMessages',
            chat_id: chatId,
            query: ' ',
            from_message_id: cursor,
            offset: 0,
            limit: BATCH,
            filter: f,
          } satisfies Td.searchChatMessages as Td.searchChatMessages);

          const batch = result.messages.filter(
            (m: Td.message | null): m is Td.message => m !== null,
          );
          if (batch.length === 0) {
            exhausted = true;
            break;
          }
          scanned += batch.length;
          for (const m of batch) {
            if (clientFilter(m)) matched.push(m);
          }
          cursor = (batch.at(-1) as Td.message).id;

          // Check if flat output has enough entries (album grouping reduces count)
          const flatCount = flattenMessages(slimMessages(matched)).length;
          if (flatCount >= limit) break;
          if (!hasClientFilter && batch.length < BATCH) {
            exhausted = true;
            break;
          }
        }

        await autoDownloadSmall(client, matched);
        if ('--download-media' in flags) await autoDownloadMessages(client, matched);
        if ('--transcribe' in flags) await transcribeMessages(client, matched);
        const flatFiltered = await enrichMessages(client, matched);
        const output = flatFiltered.slice(0, limit);
        const more = flatFiltered.length > limit || (!exhausted && scanned < MAX_SCAN);

        success(output, {
          hasMore: more,
          ...(more && matched.length > 0 ? { nextOffset: matched[matched.length - 1]?.id } : {}),
        });
        return;
      }

      // Plain history mode
      // TDLib may return fewer messages than `limit` on each call — it returns
      // locally cached messages first. Must loop with advancing from_message_id.
      // An empty response is the only reliable signal that history is exhausted.
      // See: https://github.com/tdlib/td/issues/168
      const BATCH = 50;
      const MAX_SCAN = 500;
      const matched: Td.message[] = [];
      let scannedHistory = 0;
      let exhaustedHistory = false;

      while (scannedHistory < MAX_SCAN && !exhaustedHistory) {
        const result = await client.invoke({
          _: 'getChatHistory',
          chat_id: chatId,
          from_message_id: fromMessageId,
          offset: 0,
          limit: BATCH,
          only_local: false,
        });

        const batch = result.messages.filter((m): m is Td.message => m != null);
        if (batch.length === 0) {
          exhaustedHistory = true;
          break;
        }
        scannedHistory += batch.length;
        for (const m of batch) {
          if (clientFilter(m)) matched.push(m);
        }
        fromMessageId = (batch.at(-1) as Td.message).id;

        const flatCount = flattenMessages(slimMessages(matched)).length;
        if (flatCount >= limit) break;
        if (!hasClientFilter && batch.length < BATCH) {
          exhaustedHistory = true;
          break;
        }
      }

      const isReverse = '--reverse' in flags;
      if (isReverse) matched.reverse();

      await autoDownloadSmall(client, matched);
      if ('--download-media' in flags) await autoDownloadMessages(client, matched);
      if ('--transcribe' in flags) await transcribeMessages(client, matched);
      const flatHistory = await enrichMessages(client, matched);
      const output = flatHistory.slice(0, limit);
      const more = flatHistory.length > limit || (!exhaustedHistory && scannedHistory < MAX_SCAN);
      // When reversed, messages are [oldest...newest]. The next page needs messages
      // older than the oldest in this batch, so nextOffset = messages[0].id (the oldest).
      // When not reversed, messages are [newest...oldest], so nextOffset = last element.
      const nextOffsetMsg = isReverse ? matched[0] : matched[matched.length - 1];

      success(output, {
        hasMore: more,
        ...(more && nextOffsetMsg ? { nextOffset: nextOffsetMsg.id } : {}),
      });
    },
  },
  {
    name: 'message',
    description: 'Get a single message by ID',
    usage: 'tg message <chat> <message_id>',
    flags: {},
    minArgs: 2,
    run: async (client, args, _flags) => {
      const chatId = await resolveChatId(client, args[0] as string);
      const messageId = Number(args[1]);
      if (!messageId) fail('Invalid message ID', 'INVALID_ARGS');
      const msg = await client.invoke({
        _: 'getMessage',
        chat_id: chatId,
        message_id: messageId,
      });
      await autoDownloadSmall(client, [msg]);
      const flat = await enrichMessage(client, msg);

      success(flat);
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
      const inputContent: Td.inputMessageText$Input = {
        _: 'inputMessageText',
        text: formattedText,
        link_preview_options:
          '--no-preview' in flags ? { _: 'linkPreviewOptions', is_disabled: true } : undefined,
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
            reject(
              new Error(
                `${update.error.message || 'Send failed'}${update.error.code ? ` (${update.error.code})` : ''}`,
              ),
            );
          }
        }

        // Subscribe before sending so we don't miss the update
        client.on('update', handler);

        client
          .invoke({
            _: 'sendMessage',
            chat_id: chatId,
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
              sending_id: 0,
            },
            input_message_content: inputContent,
          } satisfies Td.sendMessage as Td.sendMessage)
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

      const flat = await enrichMessage(client, serverMessage);
      success(flat);
    },
  },

  // --- Search ---
  {
    name: 'search',
    description: 'Search messages globally or in a specific chat',
    usage:
      'tg search "<query>" [--chat <id>] [--limit N] [--from <user>] [--since N] [--until N] [--type private|group|channel] [--filter photo|video|document|url|voice|gif|music|media|videonote|mention|pinned] [--context N] [--offset "cursor"] [--full] [--archived]',
    flags: {
      '--chat': 'Search in a specific chat (default: global)',
      '--limit': 'Max results (default: 20)',
      '--from': 'Filter by sender (requires --chat)',
      '--since': 'Only messages after this unix timestamp',
      '--until': 'Only messages before this unix timestamp (global only)',
      '--type': 'Filter by chat type: private, group, or channel (global only)',
      '--filter':
        'Filter by content: photo, video, document, url, voice, gif, music, media, videonote, mention, pinned',
      '--context': 'Include N messages before and after each hit',
      '--offset': 'Pagination cursor from previous nextOffset',
      '--full': 'Return full message text (default: truncated to 500 chars)',
      '--archived': 'Search in archived chats only (default: main chat list)',
    },
    run: async (client, args, flags) => {
      const filterValue = flags['--filter'];
      if (!args[0] && !filterValue)
        fail('Missing <query>. Or use --filter to search by media type.', 'INVALID_ARGS');
      if (filterValue && !FILTER_MAP[filterValue])
        fail(
          `Invalid --filter: ${filterValue}. Valid: ${Object.keys(FILTER_MAP).join(', ')}`,
          'INVALID_ARGS',
        );
      const query = args[0] ?? ' ';
      const limit = parseLimit(flags, 20);
      let contextN = 0;
      if (flags['--context'] !== undefined) {
        contextN = Number(flags['--context']);
        if (!Number.isFinite(contextN) || contextN < 1 || contextN !== Math.floor(contextN)) {
          fail('--context must be a positive integer', 'INVALID_ARGS');
        }
      }

      if (flags['--since'] !== undefined) {
        const since = Number(flags['--since']);
        if (!Number.isFinite(since) || since < 0 || since !== Math.floor(since))
          fail('--since must be a non-negative unix timestamp (integer)', 'INVALID_ARGS');
      }
      if (flags['--until'] !== undefined) {
        const until = Number(flags['--until']);
        if (!Number.isFinite(until) || until < 0 || until !== Math.floor(until))
          fail('--until must be a non-negative unix timestamp (integer)', 'INVALID_ARGS');
      }

      if (flags['--chat']) {
        // Per-chat search
        if (flags['--type'])
          fail('--type is for global search only (filters by chat type)', 'INVALID_ARGS');
        if (flags['--until']) fail('--until is for global search only', 'INVALID_ARGS');

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

        const searchFilter: Td.SearchMessagesFilter$Input = filterValue
          ? ({ _: FILTER_MAP[filterValue] } as Td.SearchMessagesFilter$Input)
          : { _: 'searchMessagesFilterEmpty' };

        const since = flags['--since'] ? Number(flags['--since']) : undefined;
        const BATCH = 50;
        const MAX_SCAN = 500;
        const matched: Td.message[] = [];
        let cursor = flags['--offset'] ? Number(flags['--offset']) : 0;
        let scanned = 0;

        while (matched.length < limit && scanned < MAX_SCAN) {
          const result = await client.invoke({
            _: 'searchChatMessages',
            chat_id: chatId,
            query,
            sender_id: senderOption,
            from_message_id: cursor,
            offset: 0,
            limit: since ? BATCH : limit,
            filter: searchFilter,
          } satisfies Td.searchChatMessages as Td.searchChatMessages);

          const batch = result.messages.filter((m): m is Td.message => m !== null);
          if (batch.length === 0) break;
          scanned += batch.length;
          for (const m of batch) {
            if (since && m.date < since) continue;
            matched.push(m);
            if (matched.length >= limit) break;
          }
          cursor = (batch.at(-1) as Td.message).id;
          if (!since) break;
        }
        const messages = matched;

        const full = '--full' in flags;
        const slimMsgs = slimMessages(messages);
        await addSenderNames(client, slimMsgs);
        const flatMsgs = slimMsgs.map(flattenMessage);
        let results: Record<string, unknown>[] = flatMsgs.map((fm, idx) => {
          const obj: Record<string, unknown> = {
            ...fm,
            chat_id: (messages[idx] as Td.message).chat_id,
          };
          return full ? obj : truncateContent(obj);
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
        // Global search — message search only
        if (flags['--from']) {
          fail(
            '--from requires --chat for per-chat search. Global search does not support sender filtering.',
            'INVALID_ARGS',
          );
        }
        const typeFilter = flags['--type'];
        if (typeFilter && !VALID_SEARCH_TYPES.has(typeFilter)) {
          fail(
            `Invalid --type: ${typeFilter}. Valid: ${[...VALID_SEARCH_TYPES].join(', ')}`,
            'INVALID_ARGS',
          );
        }
        if (filterValue && GLOBAL_UNSUPPORTED_FILTERS.has(filterValue)) {
          fail(`--filter ${filterValue} requires --chat`, 'INVALID_ARGS');
        }

        let offsetCursor = flags['--offset'] ?? '';
        const BATCH = 50;
        const MAX_SCAN = 500;
        const matched: Td.message[] = [];
        let scanned = 0;

        while (matched.length < limit && scanned < MAX_SCAN) {
          const searchParams: Record<string, unknown> = {
            _: 'searchMessages',
            chat_list: {
              _: flags['--archived'] !== undefined ? 'chatListArchive' : 'chatListMain',
            },
            query,
            offset: offsetCursor,
            limit: BATCH,
            filter: filterValue ? { _: FILTER_MAP[filterValue] } : undefined,
            min_date: flags['--since'] ? Number(flags['--since']) : 0,
            max_date: flags['--until'] ? Number(flags['--until']) : 0,
          };
          if (typeFilter) {
            searchParams.chat_type_filter = { _: CHAT_TYPE_FILTER_MAP[typeFilter] };
          }
          const result = await client.invoke(searchParams as Td.searchMessages);

          const batch = result.messages.filter((m): m is Td.message => m !== null);
          if (batch.length === 0) break;
          scanned += batch.length;

          for (const m of batch) {
            matched.push(m);
            if (matched.length >= limit) break;
          }
          offsetCursor = result.next_offset;
          if (!offsetCursor) break;
        }
        const messages = matched;

        const full = '--full' in flags;
        const slimMsgs = slimMessages(messages);
        await addSenderNames(client, slimMsgs);
        const flatMsgs = slimMsgs.map(flattenMessage);
        const formattedPromises = flatMsgs.map(async (fm, idx) => {
          const msg = messages[idx] as Td.message;
          let chatTitle = '';
          try {
            const chat = await client.invoke({
              _: 'getChat',
              chat_id: msg.chat_id,
            });
            chatTitle = chat.title;
          } catch {
            // skip
          }
          const obj: Record<string, unknown> = {
            ...fm,
            chat_id: msg.chat_id,
            chat_title: chatTitle,
          };
          return full ? obj : truncateContent(obj);
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
              const context = flattenMessages(
                slimMessages(
                  ctx.messages.filter((cm): cm is Td.message => cm != null && cm.id !== msgId),
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
        const nextOffset = hasMore && offsetCursor ? offsetCursor : undefined;
        success(formatted, { hasMore, nextOffset });
      }
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

  // --- Find ---
  {
    name: 'find',
    description: 'Find bots, channels, groups, users, or contacts by name',
    usage: 'tg find "<query>" [--type bot|channel|group|user|contact] [--limit N] [--archived]',
    flags: {
      '--type': 'Filter: bot, channel, group, user, or contact',
      '--limit': 'Max results (default: 50)',
      '--archived': 'Show only archived chats (default: excludes archived)',
    },
    run: async (client, args, flags) => {
      const query = args[0];
      if (!query)
        fail('Missing required argument: <query>. Usage: tg find "<query>"', 'INVALID_ARGS');

      const limit = parseLimit(flags, 50);
      const typeFilter = flags['--type'];
      if (typeFilter && !VALID_FIND_TYPES.has(typeFilter))
        fail(
          `Invalid --type: ${typeFilter}. Valid: ${[...VALID_FIND_TYPES].join(', ')}`,
          'INVALID_ARGS',
        );

      // Fire TDLib calls in parallel
      const [publicRes, localRes, contactRes] = await Promise.all([
        client
          .invoke({ _: 'searchPublicChats', query })
          .catch(() => ({ chat_ids: [] as number[] })),
        client
          .invoke({ _: 'searchChats', query, limit: 20 })
          .catch(() => ({ chat_ids: [] as number[] })),
        !typeFilter || typeFilter === 'contact' || typeFilter === 'user'
          ? client
              .invoke({ _: 'searchContacts', query, limit: 50 })
              .catch(() => ({ user_ids: [] as number[] }))
          : Promise.resolve({ user_ids: [] as number[] }),
      ]);

      // Merge + deduplicate chat IDs
      const uniqueChatIds = new Map<number, true>();
      for (const id of publicRes.chat_ids) uniqueChatIds.set(id, true);
      for (const id of localRes.chat_ids) uniqueChatIds.set(id, true);

      const contactUserIds = new Set(contactRes.user_ids);

      // Resolve chat info
      const chatPromises = [...uniqueChatIds.keys()].map(async (chatId) => {
        try {
          const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
          let user: Td.user | undefined;
          if (chat.type._ === 'chatTypePrivate') {
            try {
              user = await client.invoke({
                _: 'getUser',
                user_id: chat.type.user_id,
              });
            } catch {
              // skip user info
            }
          }
          return { chat, user };
        } catch {
          return null;
        }
      });

      // Resolve contact user IDs not already in chat set
      const contactPromises = [...contactUserIds]
        .filter((uid) => !uniqueChatIds.has(uid))
        .map(async (userId) => {
          try {
            const chat = await client.invoke({
              _: 'createPrivateChat',
              user_id: userId,
              force: false,
            });
            let user: Td.user | undefined;
            try {
              user = await client.invoke({ _: 'getUser', user_id: userId });
            } catch {
              // skip user info
            }
            return { chat, user };
          } catch {
            return null;
          }
        });

      const allResults = (await Promise.all([...chatPromises, ...contactPromises])).filter(
        (r): r is { chat: Td.chat; user: Td.user | undefined } => r !== null,
      );

      // Deduplicate by chat ID
      const seen = new Set<number>();
      const dedupedEntities = allResults.filter(({ chat }) => {
        const id = chat.id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      // Filter by archive status
      const showArchived = flags['--archived'] !== undefined;
      const archiveFiltered = dedupedEntities.filter(({ chat }) => {
        const isArchived = chat.positions?.some((p) => p.list._ === 'chatListArchive') ?? false;
        return showArchived ? isArchived : !isArchived;
      });

      // Filter by --type
      const filtered = typeFilter
        ? archiveFiltered.filter(({ chat, user }) => {
            const chatType = chat.type._;
            switch (typeFilter) {
              case 'bot':
                return chatType === 'chatTypePrivate' && user?.type._ === 'userTypeBot';
              case 'channel':
                return (
                  chatType === 'chatTypeSupergroup' &&
                  (chat.type as Td.chatTypeSupergroup).is_channel
                );
              case 'group':
                return (
                  chatType === 'chatTypeBasicGroup' ||
                  (chatType === 'chatTypeSupergroup' &&
                    !(chat.type as Td.chatTypeSupergroup).is_channel)
                );
              case 'user':
                return chatType === 'chatTypePrivate' && user?.type._ !== 'userTypeBot';
              case 'contact':
                return chatType === 'chatTypePrivate' && user?.is_contact === true;
              default:
                return true;
            }
          })
        : archiveFiltered;

      // Sort bots by popularity (active_user_count descending)
      if (typeFilter === 'bot') {
        filtered.sort((a, b) => {
          const aCount =
            a.user?.type._ === 'userTypeBot' ? (a.user.type.active_user_count ?? 0) : 0;
          const bCount =
            b.user?.type._ === 'userTypeBot' ? (b.user.type.active_user_count ?? 0) : 0;
          return bCount - aCount;
        });
      }

      // Slim, strip, limit
      const sliced = filtered.slice(0, limit);
      const results = sliced.map(({ chat, user }) => {
        const slim = strip(slimChat(chat)) as Record<string, unknown>;
        if (user) slim.user = strip(slimUser(user));
        return slim;
      });

      success(results, {
        hasMore: filtered.length > limit ? true : undefined,
      });
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
          clear_draft: false,
        },
      } satisfies Td.editMessageText as Td.editMessageText);

      const flat = await enrichMessage(client, result);
      success(flat);
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
            from_chat_id: fromChatId,
            message_ids: ids,
            options: {
              _: 'messageSendOptions',
              disable_notification: silent,
              from_background: false,
              protect_content: false,
              update_order_of_installed_sticker_sets: false,
              scheduling_state: undefined,
              sending_id: 0,
            },
            send_copy: false,
            remove_caption: false,
          } satisfies Td.forwardMessages as Td.forwardMessages)
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

      success(flattenMessages(slimMessages(confirmedMessages)));
    },
  },

  // --- Download ---
  {
    name: 'download',
    description: 'Download media from a message or by file ID',
    usage: 'tg download <chat> <msgId> [--output path] | tg download --file-id <id>',
    flags: {
      '--output': 'Output file path (default: auto-named in cwd)',
      '--file-id': 'Download directly by TDLib file ID',
    },
    minArgs: 0,
    run: async (client, args, flags) => {
      let fileId: number;
      let mimeType: string | undefined;

      if (flags['--file-id']) {
        fileId = Number(flags['--file-id']);
        if (!Number.isFinite(fileId)) fail('--file-id must be a number', 'INVALID_ARGS');
      } else {
        if (!args[0])
          fail('Missing required argument: <chat>. Or use --file-id <id>', 'INVALID_ARGS');
        if (!args[1]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
        const chatId = await resolveChatId(client, args[0]);
        const msg = await client.invoke({
          _: 'getMessage',
          chat_id: chatId,
          message_id: Number(args[1]),
        });
        const extracted = getFileId(msg.content);
        if (!extracted) fail('Message has no downloadable media', 'NOT_FOUND');
        fileId = extracted;
        mimeType = getContentMimeType(msg.content);
      }

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
      if (flags['--output']) {
        copyFileSync(localPath, flags['--output']);
      }

      success({
        file: path.resolve(flags['--output'] ?? localPath),
        size: downloaded.size,
        ...(mimeType ? { mime_type: mimeType } : {}),
      });
    },
  },

  // --- Transcribe ---
  {
    name: 'transcribe',
    description: 'Transcribe a voice or video note to text (Telegram Premium)',
    usage: 'tg transcribe <chat> <msgId>',
    minArgs: 2,
    run: async (client, args) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <msgId>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const messageId = Number(args[1]);

      // Check if already transcribed
      const msg = await client.invoke({ _: 'getMessage', chat_id: chatId, message_id: messageId });
      const getResult = (content: Td.MessageContent) => {
        if (content._ === 'messageVoiceNote') return content.voice_note.speech_recognition_result;
        if (content._ === 'messageVideoNote') return content.video_note.speech_recognition_result;
        return undefined;
      };

      const existing = getResult(msg.content);
      if (existing?._ === 'speechRecognitionResultText') {
        success({ text: existing.text });
        return;
      }

      const contentType = msg.content._;
      if (contentType !== 'messageVoiceNote' && contentType !== 'messageVideoNote') {
        fail('Message is not a voice or video note', 'INVALID_ARGS');
      }

      // Request recognition
      await client.invoke({ _: 'recognizeSpeech', chat_id: chatId, message_id: messageId });

      // Poll for result
      const MAX_ATTEMPTS = 30;
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const updated = await client.invoke({
          _: 'getMessage',
          chat_id: chatId,
          message_id: messageId,
        });
        const result = getResult(updated.content);
        if (!result || result._ === 'speechRecognitionResultPending') continue;
        if (result._ === 'speechRecognitionResultText') {
          success({ text: result.text });
          return;
        }
        if (result._ === 'speechRecognitionResultError') {
          fail(`Speech recognition failed: ${result.error.message}`, 'UNKNOWN');
        }
      }
      fail('Speech recognition timed out', 'UNKNOWN');
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
        let filter: Td.SupergroupMembersFilter$Input;
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
        if (/REACTION_INVALID|reaction.*isn.t available/i.test(msg)) {
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

  // --- Click inline keyboard button ---
  {
    name: 'click',
    description: 'Click an inline keyboard button',
    usage: 'tg click <chat> <messageId> <button>',
    flags: {},
    minArgs: 3,
    run: async (client, args) => {
      if (!args[0]) fail('Missing required argument: <chat>', 'INVALID_ARGS');
      if (!args[1]) fail('Missing required argument: <messageId>', 'INVALID_ARGS');
      if (!args[2]) fail('Missing required argument: <button>', 'INVALID_ARGS');
      const chatId = await resolveChatId(client, args[0]);
      const messageId = Number(args[1]);
      if (!Number.isFinite(messageId) || messageId <= 0) fail('Invalid message ID', 'INVALID_ARGS');
      const buttonArg = args[2];

      const msg = await client.invoke({
        _: 'getMessage',
        chat_id: chatId,
        message_id: messageId,
      });

      if (!msg.reply_markup || msg.reply_markup._ !== 'replyMarkupInlineKeyboard') {
        fail('Message has no inline keyboard', 'INVALID_ARGS');
      }

      // Flatten buttons across all rows
      const allButtons: Td.inlineKeyboardButton[] = [];
      for (const row of msg.reply_markup.rows) {
        for (const btn of row) allButtons.push(btn);
      }

      if (allButtons.length === 0) fail('Inline keyboard has no buttons', 'INVALID_ARGS');

      // Resolve: numeric index or text match
      let target: Td.inlineKeyboardButton | undefined;
      const idx = Number(buttonArg);
      if (Number.isFinite(idx) && idx >= 0 && idx === Math.floor(idx)) {
        target = allButtons[idx];
        if (!target)
          fail(`Button index ${idx} out of range (0-${allButtons.length - 1})`, 'INVALID_ARGS');
      } else {
        const lower = buttonArg.toLowerCase();
        target = allButtons.find((b) => b.text.toLowerCase() === lower);
        if (!target) {
          const available = allButtons.map((b, i) => `${i}: "${b.text}"`).join(', ');
          fail(`No button matching "${buttonArg}". Available: ${available}`, 'NOT_FOUND');
        }
      }

      const btnType = target.type;
      switch (btnType._) {
        case 'inlineKeyboardButtonTypeCallback': {
          const answer = await client.invoke({
            _: 'getCallbackQueryAnswer',
            chat_id: chatId,
            message_id: messageId,
            payload: { _: 'callbackQueryPayloadData', data: btnType.data },
          });
          return success(
            strip({
              clicked: target.text,
              type: 'callback',
              answer: strip({
                text: answer.text || undefined,
                show_alert: answer.show_alert || undefined,
                url: answer.url || undefined,
              }),
            }),
          );
        }
        case 'inlineKeyboardButtonTypeUrl':
          return success({ clicked: target.text, type: 'url', url: btnType.url });
        case 'inlineKeyboardButtonTypeWebApp':
          return success({ clicked: target.text, type: 'web_app', url: btnType.url });
        case 'inlineKeyboardButtonTypeLoginUrl':
          return success({ clicked: target.text, type: 'login_url', url: btnType.url });
        case 'inlineKeyboardButtonTypeSwitchInline':
          return success({ clicked: target.text, type: 'switch_inline', query: btnType.query });
        case 'inlineKeyboardButtonTypeCopyText':
          return success({ clicked: target.text, type: 'copy_text', text: btnType.text });
        case 'inlineKeyboardButtonTypeUser':
          return success({ clicked: target.text, type: 'user', user_id: btnType.user_id });
        case 'inlineKeyboardButtonTypeBuy':
          return fail('Buy buttons cannot be clicked via CLI', 'INVALID_ARGS');
        case 'inlineKeyboardButtonTypeCallbackGame':
          return fail('Game buttons cannot be clicked via CLI', 'INVALID_ARGS');
        case 'inlineKeyboardButtonTypeCallbackWithPassword':
          return fail('Password-protected buttons are not supported via CLI', 'INVALID_ARGS');
        default:
          return fail('Unsupported button type', 'INVALID_ARGS');
      }
    },
  },

  // --- Eval ---
  {
    name: 'eval',
    description: 'Execute JavaScript with a connected TDLib client',
    usage: [
      "tg eval '<code>'",
      'tg eval --file script.js',
      "tg eval <<'EOF'\n  <code>\n  EOF",
    ].join('\n  '),
    flags: {
      '--file': 'Read code from a file path',
    },
    run: async (client, args) => {
      let code: string;
      if (args.length > 0) {
        code = args.join(' ');
      } else if (!process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        code = Buffer.concat(chunks).toString('utf-8').trimEnd();
        if (!code) fail('No code received from stdin', 'INVALID_ARGS');
      } else {
        fail(
          'No code provided. Pass code as argument, via stdin (heredoc), or --file.',
          'INVALID_ARGS',
        );
      }
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

  // --- Listen ---
  {
    name: 'listen',
    description: 'Stream real-time events (NDJSON). Requires --chat or --type.',
    usage:
      'tg listen --type user|bot|group|channel [--chat <ids>] [--exclude-chat <ids>] [--exclude-type <type>] [--event <types>] [--incoming] [--download-media]',
    flags: {
      '--chat': 'Comma-separated chat IDs to include',
      '--type': 'Include entire category: user, group, or channel',
      '--exclude-chat': 'Comma-separated chat IDs to exclude from included set',
      '--exclude-type': 'Exclude category: user, bot, group, or channel',
      '--event':
        'Comma-separated event types (default: new_message,edit_message,delete_messages,message_reactions). Also: read_outbox, user_typing, user_status, message_send_succeeded',
      '--incoming': 'Only include incoming messages (filter out outgoing)',
      '--download-media': 'Auto-download photos, stickers, voice messages',
    },
    streaming: true,
    run: async (client, _args, flags) => {
      const DEFAULT_EVENTS = new Set([
        'new_message',
        'edit_message',
        'delete_messages',
        'message_reactions',
      ]);
      const eventFilter = flags['--event']
        ? new Set(
            flags['--event']
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean),
          )
        : DEFAULT_EVENTS;

      const emit = (event: Record<string, unknown>) => {
        if (!eventFilter.has(event.type as string)) return;
        process.stdout.write(`${JSON.stringify(event)}\n`);
      };

      const typeFilter = flags['--type'];
      const excludeType = flags['--exclude-type'];
      const rawChatIds =
        flags['--chat']
          ?.split(',')
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [];
      const chatIds = new Set<string>();
      for (const raw of rawChatIds) {
        const resolved = await resolveChatId(client, raw);
        chatIds.add(String(resolved));
      }
      const rawExcludeChatIds =
        flags['--exclude-chat']
          ?.split(',')
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [];
      const excludeChatIds = new Set<string>();
      for (const raw of rawExcludeChatIds) {
        const resolved = await resolveChatId(client, raw);
        excludeChatIds.add(String(resolved));
      }
      const downloadMedia = '--download-media' in flags;
      const incomingOnly = '--incoming' in flags;

      if (!chatIds.size && !typeFilter) {
        fail('Must specify --chat or --type (default is all excluded)', 'INVALID_ARGS');
      }

      if (typeFilter && !VALID_CHAT_TYPES.has(typeFilter)) {
        fail(
          `Invalid --type "${typeFilter}". Expected: user, bot, group, or channel`,
          'INVALID_ARGS',
        );
      }
      if (excludeType && !VALID_CHAT_TYPES.has(excludeType)) {
        fail(
          `Invalid --exclude-type "${excludeType}". Expected: user, bot, group, or channel`,
          'INVALID_ARGS',
        );
      }

      // Cache for chat type lookups to avoid repeated network calls
      const chatTypeCache = new Map<number, 'user' | 'bot' | 'group' | 'channel' | 'unknown'>();
      const botChatIds = new Set<number>();

      const getCachedChatType = async (
        chatIdNum: number,
      ): Promise<'user' | 'bot' | 'group' | 'channel' | 'unknown'> => {
        const cached = chatTypeCache.get(chatIdNum);
        if (cached) return cached;
        try {
          const chat = await client.invoke({
            _: 'getChat',
            chat_id: chatIdNum,
          });
          // Resolve bot status for private chats
          if (chat.type._ === 'chatTypePrivate') {
            try {
              const user = await client.invoke({ _: 'getUser', user_id: chat.type.user_id });
              if (user.type._ === 'userTypeBot') botChatIds.add(chat.id);
            } catch {
              /* skip */
            }
          }
          const t = getChatType(chat, botChatIds);
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
              await autoDownloadSmall(client, [msg]);
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
                  const flatDl = await enrichMessage(client, msg);
                  emit({
                    type: 'new_message',
                    chat_id: msg.chat_id,
                    message: flatDl,
                  });
                  return;
                }
              }
              const flatMsg = await enrichMessage(client, msg);
              emit({
                type: 'new_message',
                chat_id: msg.chat_id,
                message: flatMsg,
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
                  message: flattenMessage(slimMessage(msg)),
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
                  message: flattenMessage(slimMessage(msg)),
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
                message: flattenMessage(slimMessage(msg)),
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
  // ------------------------------------------------------------------
  // auth — authentication management
  // ------------------------------------------------------------------
  {
    name: 'auth',
    description: 'Check auth state or authenticate (phone/code/password/logout)',
    usage: [
      'tg auth                       Show current auth state',
      'tg auth phone <number>        Submit phone number (e.g. +1234567890)',
      'tg auth code <code>           Submit verification code',
      'tg auth password <password>   Submit 2FA password',
      'tg auth logout                Log out of Telegram',
    ].join('\n'),
    async run(client, args, _flags) {
      const sub = args[0];

      // No subcommand — show current auth state
      if (!sub) {
        const state = await client.getAuthState();
        if (state.ready) {
          const me = await client.invoke({ _: 'getMe' });
          success({ ...state, ...(strip(slimUser(me)) as Record<string, unknown>) });
        } else {
          success(slimAuthState(state));
        }
        return;
      }

      if (sub === 'phone') {
        const phone = args[1];
        if (!phone) fail('Missing phone number. Usage: tg auth phone +1234567890', 'INVALID_ARGS');
        const state = await client.submitPhone(phone);
        success(slimAuthState(state));
        return;
      }

      if (sub === 'code') {
        const code = args[1];
        if (!code) fail('Missing verification code. Usage: tg auth code 12345', 'INVALID_ARGS');
        const state = await client.submitCode(code);
        success(slimAuthState(state));
        return;
      }

      if (sub === 'password') {
        const password = args[1];
        if (!password) fail('Missing password. Usage: tg auth password <pw>', 'INVALID_ARGS');
        const state = await client.submitPassword(password);
        success(slimAuthState(state));
        return;
      }

      if (sub === 'logout') {
        const res = await client.invoke({ _: 'logOut' });
        success(strip(res));
        return;
      }

      fail(
        `Unknown auth subcommand: "${sub}". Available: phone, code, password, logout`,
        'INVALID_ARGS',
      );
    },
  },
];

// --- Command lookup ---

export function getCommand(name: string): Command | undefined {
  return commands.find((c) => c.name === name);
}
