/**
 * Command helpers — name resolution, message enrichment, transcription.
 *
 * These operate on TDLib data + SlimMessage but don't belong in commands.ts
 * (which is command definitions only) or slim.ts (which is pure data transforms).
 */

import type { TelegramClient } from '@tg/protocol';
import type * as Td from 'tdlib-types';
import { type FlatMessage, flattenMessage, flattenMessages } from './flatten';
import { type SlimMessage, slimMessage, slimMessages } from './slim';

// --- Auto-download helpers ---

const AUTO_DOWNLOAD_MAX_SIZE = 1_048_576; // 1MB

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

export function getFileId(content: Td.MessageContent): number | null {
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

export function shouldAutoDownloadContent(content: Td.MessageContent): boolean {
  return getFileId(content) !== null;
}

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

async function autoDownloadMessages(client: TelegramClient, rawMsgs: Td.message[]): Promise<void> {
  const targets: { file: Td.file }[] = [];
  for (const msg of rawMsgs) {
    if (!shouldAutoDownloadContent(msg.content)) continue;
    const file = getFile(msg.content);
    if (!file) continue;
    if (file.local.is_downloading_completed) continue;
    targets.push({ file });
  }

  const CONCURRENCY = 3;
  for (let batch = 0; batch < targets.length; batch += CONCURRENCY) {
    const chunk = targets.slice(batch, batch + CONCURRENCY);
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
          // Patch the original file object so slim/flatten sees the download
          target.file.local = updated.local;
        } catch {
          /* skip failed downloads */
        }
      }),
    );
  }
}

// --- Name resolution ---

async function resolveUserName(
  client: TelegramClient,
  cache: Map<string, string>,
  userId: number,
): Promise<string | undefined> {
  const key = `user:${userId}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const user = await client.invoke({ _: 'getUser', user_id: userId });
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    cache.set(key, name);
    return name;
  } catch {
    return undefined;
  }
}

async function resolveChatName(
  client: TelegramClient,
  cache: Map<string, string>,
  chatId: number,
): Promise<string | undefined> {
  const key = `chat:${chatId}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
    cache.set(key, chat.title);
    return chat.title;
  } catch {
    return undefined;
  }
}

// --- Message enrichment ---

/** Resolve sender names and forward origin names onto slim messages. */
export async function addSenderNames(client: TelegramClient, msgs: SlimMessage[]): Promise<void> {
  const cache = new Map<string, string>();

  for (const m of msgs) {
    if (m.sender_type === 'user') {
      m.sender_name = await resolveUserName(client, cache, m.sender_id);
    } else {
      m.sender_name = await resolveChatName(client, cache, m.sender_id);
    }
  }

  for (const m of msgs) {
    const origin = m.forward_info?.origin;
    if (!origin) continue;
    switch (origin._) {
      case 'messageOriginUser':
        m.forward_sender_name = await resolveUserName(client, cache, origin.sender_user_id);
        break;
      case 'messageOriginChat':
        m.forward_sender_name = await resolveChatName(client, cache, origin.sender_chat_id);
        break;
      case 'messageOriginChannel':
        m.forward_sender_name = await resolveChatName(client, cache, origin.chat_id);
        break;
      case 'messageOriginHiddenUser':
        m.forward_sender_name = origin.sender_name;
        break;
    }
  }
}

/** Slim messages and enrich with sender/forward names. */
export async function slimMessagesWithNames(
  client: TelegramClient,
  msgs: Td.message[],
): Promise<SlimMessage[]> {
  const slim = slimMessages(msgs);
  await addSenderNames(client, slim);
  return slim;
}

export type EnrichOpts = {
  autoDownload?: boolean;
  autoTranscribe?: boolean;
};

export function enrichOpts(flags: Record<string, string>): EnrichOpts {
  return {
    autoDownload: '--auto-download' in flags,
    autoTranscribe: '--auto-transcribe' in flags,
  };
}

/** Slim, resolve names, and flatten messages into agent-friendly format. */
export async function enrichMessages(
  client: TelegramClient,
  msgs: Td.message[],
  opts?: EnrichOpts,
): Promise<FlatMessage[]> {
  await autoDownloadSmall(client, msgs);
  if (opts?.autoDownload) await autoDownloadMessages(client, msgs);
  if (opts?.autoTranscribe) await transcribeMessages(client, msgs);
  const slim = slimMessages(msgs);
  await addSenderNames(client, slim);
  return flattenMessages(slim);
}

/** Slim, resolve names, and flatten a single message. */
export async function enrichMessage(
  client: TelegramClient,
  msg: Td.message,
  opts?: EnrichOpts,
): Promise<FlatMessage> {
  await autoDownloadSmall(client, [msg]);
  if (opts?.autoDownload) await autoDownloadMessages(client, [msg]);
  if (opts?.autoTranscribe) await transcribeMessages(client, [msg]);
  const slim = slimMessage(msg);
  await addSenderNames(client, [slim]);
  return flattenMessage(slim);
}

// --- Transcription ---

/** Trigger speech recognition for voice/video notes and poll until complete. Mutates the array. */
export async function transcribeMessages(
  client: TelegramClient,
  msgs: Td.message[],
): Promise<void> {
  const targets: { chatId: number; msgId: number; index: number }[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i] as Td.message;
    const c = msg.content;
    if (c._ === 'messageVoiceNote') {
      const r = c.voice_note.speech_recognition_result;
      if (!r || r._ !== 'speechRecognitionResultText') {
        targets.push({ chatId: msg.chat_id, msgId: msg.id, index: i });
      }
    } else if (c._ === 'messageVideoNote') {
      const r = c.video_note.speech_recognition_result;
      if (!r || r._ !== 'speechRecognitionResultText') {
        targets.push({ chatId: msg.chat_id, msgId: msg.id, index: i });
      }
    }
  }
  if (targets.length === 0) return;

  // Trigger recognition (concurrency 3)
  const CONCURRENCY = 3;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ chatId, msgId }) => {
        try {
          await client.invoke({ _: 'recognizeSpeech', chat_id: chatId, message_id: msgId });
        } catch {
          /* may lack Premium, or already in progress */
        }
      }),
    );
  }

  // Poll until all complete or timeout
  const TIMEOUT_MS = 30_000;
  const POLL_MS = 1_000;
  const start = Date.now();
  const pending = new Set(targets.map((t) => t.index));

  while (pending.size > 0 && Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    for (const idx of [...pending]) {
      const t = targets.find((x) => x.index === idx);
      if (!t) {
        pending.delete(idx);
        continue;
      }
      try {
        const updated = await client.invoke({
          _: 'getMessage',
          chat_id: t.chatId,
          message_id: t.msgId,
        });
        const c = updated.content;
        let result: Td.SpeechRecognitionResult | undefined;
        if (c._ === 'messageVoiceNote') result = c.voice_note.speech_recognition_result;
        else if (c._ === 'messageVideoNote') result = c.video_note.speech_recognition_result;
        if (
          result?._ === 'speechRecognitionResultText' ||
          result?._ === 'speechRecognitionResultError'
        ) {
          pending.delete(idx);
          msgs[idx] = updated;
        }
      } catch {
        pending.delete(idx);
      }
    }
  }
}
