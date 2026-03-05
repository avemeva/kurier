/**
 * Command helpers — name resolution, message enrichment, transcription.
 *
 * These operate on TDLib data + SlimMessage but don't belong in commands.ts
 * (which is command definitions only) or slim.ts (which is pure data transforms).
 */

import type { TelegramClient } from '@tg/protocol';
import type * as Td from 'tdlib-types';
import { type FlatMember, type FlatMessage, flattenMessage, flattenMessages } from './flatten';
import { type SlimChatMember, type SlimMessage, slimMessage, slimMessages } from './slim';

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

// --- URL extraction ---

const URL_RE = /https?:\/\/[^\s<>"')\]]+/;

function extractFirstUrlFromText(text: string): string | undefined {
  return text.match(URL_RE)?.[0];
}

function extractFirstUrl(fullInfo: Td.userFullInfo): string | undefined {
  const entities = fullInfo.bio?.entities;
  if (entities?.length) {
    for (const e of entities) {
      if (e.type._ === 'textEntityTypeTextUrl') return e.type.url;
      if (e.type._ === 'textEntityTypeUrl' && fullInfo.bio?.text) {
        return fullInfo.bio.text.slice(e.offset, e.offset + e.length);
      }
    }
  }
  if (fullInfo.bio?.text) return extractFirstUrlFromText(fullInfo.bio.text);
  return undefined;
}

// --- Link preview ---

async function fetchLinkPreview(client: TelegramClient, url: string): Promise<string | undefined> {
  const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const preview = await client.invoke({
      _: 'getLinkPreview',
      text: { _: 'formattedText', text: fullUrl, entities: [] },
    });
    const parts = [preview.title, preview.description?.text].filter(Boolean);
    return parts.length ? parts.join(' — ') : undefined;
  } catch {
    return undefined;
  }
}

// --- User profile enrichment ---

export type UserProfile = {
  name: string;
  username?: string;
  description?: string;
  link_preview?: string;
  personal_channel?: {
    id: number;
    title: string;
    username: string | null;
    description?: string;
    link_preview?: string;
  };
};

/** Fetch enriched profile for a single user: name, username, bio, personal channel. */
export async function enrichUserProfile(
  client: TelegramClient,
  userId: number,
): Promise<UserProfile | undefined> {
  try {
    const [user, fullInfo] = await Promise.all([
      client.invoke({ _: 'getUser', user_id: userId }),
      client.invoke({ _: 'getUserFullInfo', user_id: userId }).catch(() => undefined),
    ]);

    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    const username = user.usernames?.active_usernames?.[0];

    let description: string | undefined;
    let link_preview: string | undefined;
    if (fullInfo) {
      if (user.type._ === 'userTypeBot') {
        description = fullInfo.bot_info?.short_description || undefined;
      } else {
        description = fullInfo.bio?.text || undefined;
      }
      const firstUrl = extractFirstUrl(fullInfo);
      if (firstUrl) link_preview = await fetchLinkPreview(client, firstUrl);
    }

    let personal_channel: UserProfile['personal_channel'];
    if (fullInfo?.personal_chat_id) {
      try {
        const pc = await client.invoke({ _: 'getChat', chat_id: fullInfo.personal_chat_id });
        let pcUsername: string | null = null;
        let pcDesc: string | undefined;
        let pcLinkPreview: string | undefined;
        if (pc.type._ === 'chatTypeSupergroup') {
          const [sg, sgFull] = await Promise.all([
            client
              .invoke({ _: 'getSupergroup', supergroup_id: pc.type.supergroup_id })
              .catch(() => undefined),
            client
              .invoke({ _: 'getSupergroupFullInfo', supergroup_id: pc.type.supergroup_id })
              .catch(() => undefined),
          ]);
          pcUsername = (sg as Td.supergroup | undefined)?.usernames?.active_usernames?.[0] ?? null;
          pcDesc = (sgFull as Td.supergroupFullInfo | undefined)?.description || undefined;
          const pcUrl = pcDesc ? extractFirstUrlFromText(pcDesc) : undefined;
          if (pcUrl) pcLinkPreview = await fetchLinkPreview(client, pcUrl);
        }
        personal_channel = {
          id: pc.id,
          title: pc.title,
          username: pcUsername,
          description: pcDesc,
          link_preview: pcLinkPreview,
        };
      } catch {
        // personal channel not accessible
      }
    }

    return { name, username, description, link_preview, personal_channel };
  } catch {
    return undefined;
  }
}

/** Enrich slim members into flat members with user profile data. */
export async function enrichMembers(
  client: TelegramClient,
  members: SlimChatMember[],
): Promise<FlatMember[]> {
  const results: FlatMember[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < members.length; i += CONCURRENCY) {
    const batch = members.slice(i, i + CONCURRENCY);
    const enriched = await Promise.all(
      batch.map(async (m): Promise<FlatMember> => {
        const base: FlatMember = {
          user_id: m.user_id,
          status: m.status,
          custom_title: m.custom_title,
        };
        if (m.sender_type !== 'user') return base;
        const profile = await enrichUserProfile(client, m.user_id);
        if (profile) {
          base.name = profile.name;
          base.username = profile.username;
          base.description = profile.description;
          base.link_preview = profile.link_preview;
          base.personal_channel = profile.personal_channel;
        }
        return base;
      }),
    );
    results.push(...enriched);
  }
  return results;
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
