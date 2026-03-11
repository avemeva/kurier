/**
 * Telegram data layer — all data flows through the daemon via TelegramClient (HTTP/SSE).
 *
 * Auth flow uses daemon HTTP endpoints (submitPhone/submitCode/submitPassword).
 * State transitions arrive via SSE (updateAuthorizationState).
 * Everything else:
 *   - Commands: POST /api/tg/invoke → daemon TDLib calls
 *   - Events:   GET /api/tg/updates → SSE from daemon
 *   - Media:    GET /api/media/* → cached files on disk
 */

import { TelegramClient } from '@tg/protocol';
import type { PeerInfo, SearchResultMessage, Td, TelegramUpdateEvent } from '@/lib/types';
import { telegramLog } from './log';

// --- TelegramClient instance (same-origin in dev, Vite proxies /api/tg → daemon) ---

const client = new TelegramClient('');

// --- Auth ---

export type AuthStep = 'phone' | 'code' | 'password';

export type AuthEvent =
  | { step: 'phone' }
  | { step: 'code'; codeViaApp: boolean }
  | { step: 'password'; hint: string }
  | { step: 'ready' };

/** Subscribe to auth state updates, delivering pre-parsed AuthEvent. */
export function onAuthUpdate(cb: (event: AuthEvent) => void): () => void {
  return onUpdate((event) => {
    if (event.type !== 'auth_state') return;
    const state = event.authorization_state;
    switch (state._) {
      case 'authorizationStateWaitPhoneNumber':
        cb({ step: 'phone' });
        break;
      case 'authorizationStateWaitCode':
        cb({
          step: 'code',
          codeViaApp: state.code_info.type._ === 'authenticationCodeTypeTelegramMessage',
        });
        break;
      case 'authorizationStateWaitPassword':
        cb({ step: 'password', hint: state.password_hint ?? '' });
        break;
      case 'authorizationStateReady':
        cb({ step: 'ready' });
        break;
    }
  });
}

function formatFloodWait(secs: number): string {
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600);
    const m = Math.ceil((secs % 3600) / 60);
    return `Too many login attempts. Try again in ${h}h${m > 0 ? ` ${m}m` : ''}`;
  }
  if (secs >= 60) return `Too many login attempts. Try again in ${Math.ceil(secs / 60)} minutes`;
  return `Too many login attempts. Try again in ${secs} seconds`;
}

const ERROR_MAP: Record<string, string> = {
  PHONE_NUMBER_INVALID: 'Invalid phone number. Check the format and try again',
  PHONE_NUMBER_BANNED: 'This phone number is banned from Telegram',
  PHONE_NUMBER_FLOOD: 'Too many attempts. Please try again later',
  PHONE_CODE_INVALID: 'Incorrect code. Please check and try again',
  PHONE_CODE_EXPIRED: 'Code has expired. Please request a new one',
  PHONE_CODE_EMPTY: 'Please enter the verification code',
  PASSWORD_HASH_INVALID: 'Incorrect password. Please try again',
};

export function formatTelegramError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  const floodMatch = message.match(/FLOOD_WAIT_(\d+)/);
  if (floodMatch) return formatFloodWait(Number(floodMatch[1]));
  const waitMatch = message.match(/A wait of (\d+) seconds is required/);
  if (waitMatch) return formatFloodWait(Number(waitMatch[1]));

  for (const [code, friendly] of Object.entries(ERROR_MAP)) {
    if (message.includes(code)) return friendly;
  }

  return message || 'An unknown error occurred';
}

export async function submitPhone(phone: string): Promise<void> {
  const masked = `${phone.slice(0, 4)}****${phone.slice(-2)}`;
  telegramLog.info(`submitPhone: ${masked}`);
  await client.submitPhone(phone);
}

export async function submitCode(code: string): Promise<void> {
  telegramLog.info(`submitCode: ${code.length} digits`);
  await client.submitCode(code);
}

export async function submitPassword(pw: string): Promise<void> {
  telegramLog.info('submitPassword');
  await client.submitPassword(pw);
}

export async function resendCode(): Promise<void> {
  telegramLog.info('resendCode');
  await client.invoke({ _: 'resendAuthenticationCode' } as unknown as Parameters<
    typeof client.invoke
  >[0]);
}

// --- Client lifecycle ---

export async function initialize(): Promise<void> {
  // Always start SSE — needed for auth state transitions
  startUpdates();
  try {
    await client.getAuthState();
  } catch {
    // Daemon not running - will show auth screen
  }
}

export async function isAuthorized(): Promise<boolean> {
  try {
    const authState = await client.getAuthState();
    return authState.ready;
  } catch {
    return false;
  }
}

// --- Data types ---

export type { SearchResultMessage, TelegramUpdateEvent } from '@/lib/types';

export type { PeerInfo } from './types/ui';

// --- Update events ---

type UpdateListener = (event: TelegramUpdateEvent) => void;
const updateListeners = new Set<UpdateListener>();

export function onUpdate(listener: UpdateListener): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

function emitUpdate(event: TelegramUpdateEvent) {
  for (const listener of updateListeners) {
    try {
      listener(event);
    } catch (err) {
      telegramLog.error('update listener error:', err);
    }
  }
}

// --- Data fetching via TelegramClient.invoke() ---

export async function getDialogs(
  opts: { limit?: number; archived?: boolean } = {},
): Promise<Td.chat[]> {
  const limit = opts.limit ?? 100;
  const chat_list = opts.archived
    ? { _: 'chatListArchive' as const }
    : { _: 'chatListMain' as const };

  try {
    await client.invoke({ _: 'loadChats', chat_list, limit });
  } catch {
    // loadChats throws when there are no more chats to load — safe to ignore
  }

  const result = await client.invoke({ _: 'getChats', chat_list, limit });
  const chats = await Promise.all(
    result.chat_ids.map((id: number) => client.invoke({ _: 'getChat', chat_id: id })),
  );
  return chats;
}

export async function loadMoreDialogs(opts: {
  archived?: boolean;
  currentCount: number;
}): Promise<{ chats: Td.chat[]; hasMore: boolean }> {
  const chat_list = opts.archived
    ? { _: 'chatListArchive' as const }
    : { _: 'chatListMain' as const };

  let hasMore = true;
  try {
    await client.invoke({ _: 'loadChats', chat_list, limit: 100 });
  } catch {
    hasMore = false;
  }

  const result = await client.invoke({
    _: 'getChats',
    chat_list,
    limit: opts.currentCount + 100,
  });

  const newIds = result.chat_ids.slice(opts.currentCount);
  const chats = await Promise.all(
    newIds.map((id: number) => client.invoke({ _: 'getChat', chat_id: id })),
  );

  return { chats, hasMore };
}

export async function getMessages(
  chatId: number,
  options?: { limit?: number; fromMessageId?: number },
): Promise<{ messages: Td.message[]; hasMore: boolean }> {
  // TDLib returns locally cached messages first and may return fewer than
  // `limit`. Must loop with advancing from_message_id; an empty response
  // is the only reliable signal that history is exhausted.
  // See: https://github.com/tdlib/td/issues/168
  const limit = options?.limit ?? 50;
  const messages: Td.message[] = [];
  let cursor = options?.fromMessageId ?? 0;
  let left = limit;

  while (left > 0) {
    const result = await client.invoke({
      _: 'getChatHistory',
      chat_id: chatId,
      from_message_id: cursor,
      offset: 0,
      limit: left,
      only_local: false,
    });
    const batch = result.messages.filter((m): m is Td.message => m !== undefined);
    if (batch.length === 0) break;
    messages.push(...batch);
    left -= batch.length;
    cursor = batch[batch.length - 1].id;
  }

  return { messages, hasMore: messages.length > 0 };
}

// --- Send ---

export async function sendMessage(chatId: number, text: string): Promise<Td.message> {
  const result = await client.invoke({
    _: 'sendMessage',
    chat_id: chatId,
    input_message_content: {
      _: 'inputMessageText',
      text: { _: 'formattedText', text, entities: [] },
      clear_draft: true,
    },
  });
  return result;
}

// --- Reactions ---

export async function sendReaction(
  chatId: number,
  messageId: number,
  emoji: string,
  chosen: boolean,
): Promise<void> {
  if (chosen) {
    // Remove reaction
    await client.invoke({
      _: 'removeMessageReaction',
      chat_id: chatId,
      message_id: messageId,
      reaction_type: { _: 'reactionTypeEmoji', emoji },
    });
  } else {
    // Add reaction
    await client.invoke({
      _: 'addMessageReaction',
      chat_id: chatId,
      message_id: messageId,
      reaction_type: { _: 'reactionTypeEmoji', emoji },
      is_big: false,
      update_recent_reactions: true,
    });
  }
}

// --- Speech recognition ---

export async function recognizeSpeech(chatId: number, messageId: number): Promise<void> {
  await client.invoke({ _: 'recognizeSpeech', chat_id: chatId, message_id: messageId });
}

// --- Mark as read ---

export async function markAsRead(chatId: number): Promise<void> {
  try {
    const history = await client.invoke({
      _: 'getChatHistory',
      chat_id: chatId,
      from_message_id: 0,
      offset: 0,
      limit: 1,
      only_local: true,
    });
    const firstMsg = history.messages.find((m): m is Td.message => m !== undefined);
    if (firstMsg) {
      await client.invoke({
        _: 'viewMessages',
        chat_id: chatId,
        message_ids: [firstMsg.id],
        force_read: true,
      });
    }
  } catch {
    // Non-critical
  }
}

// --- Me ---

export async function getMe(): Promise<Td.user> {
  return client.invoke({ _: 'getMe' });
}

// --- User fetch ---

export async function getUser(userId: number): Promise<Td.user> {
  return client.invoke({ _: 'getUser', user_id: userId });
}

// --- Media (served from daemon's filesystem cache) ---

/** Remove a cached media download so it can be retried. */
export function clearMediaCache(messageId: number): void {
  // Clear all entries for this messageId from the URL cache
  for (const [key] of mediaUrlCache) {
    if (key.endsWith(`_${messageId}`)) {
      mediaUrlCache.delete(key);
    }
  }
}

const profilePhotoCache = new Map<number, Promise<string | null>>();

export function getProfilePhotoUrl(chatId: number): Promise<string | null> {
  const cached = profilePhotoCache.get(chatId);
  if (cached) return cached;
  const promise = (async (): Promise<string | null> => {
    try {
      const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
      const photo = chat.photo;
      if (!photo) return null;

      // Download the small photo
      const file = await client.invoke({
        _: 'downloadFile',
        file_id: photo.small.id,
        priority: 1,
        offset: 0,
        limit: 0,
        synchronous: true,
      });

      if (file.local.is_downloading_completed && file.local.path) {
        // Convert absolute path to /api/media/ URL
        // Profile photos live under tdlib_db/, message media under media_cache/
        const match = file.local.path.match(/(?:media_cache|tdlib_db)\/(.+)$/);
        if (match) return `/api/media/${match[1]}`;
      }
      return null;
    } catch {
      return null;
    }
  })();
  profilePhotoCache.set(chatId, promise);
  return promise;
}

const mediaUrlCache = new Map<string, Promise<string | null>>();

export function downloadMedia(chatId: number, messageId: number): Promise<string | null> {
  const key = `${chatId}_${messageId}`;
  const cached = mediaUrlCache.get(key);
  if (cached) return cached;
  const promise = (async (): Promise<string | null> => {
    try {
      const msg = await client.invoke({
        _: 'getMessage',
        chat_id: chatId,
        message_id: messageId,
      });

      // Extract file from message content
      const file = getFileFromContent(msg.content);
      if (!file) return null;

      const downloaded = await client.invoke({
        _: 'downloadFile',
        file_id: file.id,
        priority: 1,
        offset: 0,
        limit: 0,
        synchronous: true,
      });

      if (downloaded.local.is_downloading_completed && downloaded.local.path) {
        const match = downloaded.local.path.match(/(?:media_cache|tdlib_db)\/(.+)$/);
        if (match) return `/api/media/${match[1]}`;
      }
      return null;
    } catch {
      return null;
    }
  })();
  mediaUrlCache.set(key, promise);
  return promise;
}

function getFileFromContent(content: Td.MessageContent): Td.file | null {
  switch (content._) {
    case 'messagePhoto': {
      // Get the largest photo size
      const sizes = content.photo.sizes;
      return sizes[sizes.length - 1]?.photo ?? null;
    }
    case 'messageVideo':
      return content.video.video;
    case 'messageVoiceNote':
      return content.voice_note.voice;
    case 'messageVideoNote':
      return content.video_note.video;
    case 'messageDocument':
      return content.document.document;
    case 'messageAnimation':
      return content.animation.animation;
    case 'messageAudio':
      return content.audio.audio;
    case 'messageSticker':
      return content.sticker.sticker;
    default:
      return null;
  }
}

/** Pick the smallest photo size suitable for a sidebar thumbnail. */
function getThumbnailFile(content: Td.MessageContent): Td.file | null {
  switch (content._) {
    case 'messagePhoto': {
      const sizes = content.photo.sizes;
      return sizes[0]?.photo ?? null;
    }
    case 'messageVideo':
      return content.video.thumbnail?.file ?? null;
    case 'messageAnimation':
      return content.animation.thumbnail?.file ?? null;
    case 'messageVideoNote':
      return content.video_note.thumbnail?.file ?? null;
    case 'messageSticker':
      return content.sticker.thumbnail?.file ?? null;
    case 'messageText': {
      // Link preview with photo
      const lp = content.link_preview;
      if (!lp) return null;
      const t = lp.type;
      if (t._ === 'linkPreviewTypePhoto') return t.photo.sizes[0]?.photo ?? null;
      if (t._ === 'linkPreviewTypeVideo') return t.video.thumbnail?.file ?? null;
      return null;
    }
    default:
      return null;
  }
}

const thumbUrlCache = new Map<string, Promise<string | null>>();

export function downloadThumbnail(chatId: number, messageId: number): Promise<string | null> {
  const key = `thumb_${chatId}_${messageId}`;
  const cached = thumbUrlCache.get(key);
  if (cached) return cached;
  const promise = (async (): Promise<string | null> => {
    try {
      const msg = await client.invoke({
        _: 'getMessage',
        chat_id: chatId,
        message_id: messageId,
      });
      const file = getThumbnailFile(msg.content);
      if (!file) return null;
      const downloaded = await client.invoke({
        _: 'downloadFile',
        file_id: file.id,
        priority: 1,
        offset: 0,
        limit: 0,
        synchronous: true,
      });
      if (downloaded.local.is_downloading_completed && downloaded.local.path) {
        const match = downloaded.local.path.match(/(?:media_cache|tdlib_db)\/(.+)$/);
        if (match) return `/api/media/${match[1]}`;
      }
      return null;
    } catch {
      return null;
    }
  })();
  thumbUrlCache.set(key, promise);
  return promise;
}

const customEmojiCache = new Map<string, Promise<string | null>>();

export function getCustomEmojiUrl(documentId: string): Promise<string | null> {
  const cached = customEmojiCache.get(documentId);
  if (cached) return cached;
  // Custom emoji download is not yet supported via daemon — return null
  // TODO: add custom emoji download command to daemon
  const promise = Promise.resolve(null as string | null);
  customEmojiCache.set(documentId, promise);
  return promise;
}

// --- Chat open/close ---

export async function openTdChat(chatId: number): Promise<void> {
  await client.invoke({ _: 'openChat', chat_id: chatId });
}

export async function closeTdChat(chatId: number): Promise<void> {
  await client.invoke({ _: 'closeChat', chat_id: chatId });
}

// --- Chat info (member counts, bot active users) ---

export type ChatInfoResult = {
  memberCount: number;
  isChannel: boolean;
  botActiveUsers?: number;
};

export async function getChatInfo(chat: Td.chat): Promise<ChatInfoResult | null> {
  try {
    if (chat.type._ === 'chatTypeSupergroup') {
      const info = await client.invoke({
        _: 'getSupergroupFullInfo',
        supergroup_id: chat.type.supergroup_id,
      });
      return {
        memberCount: info.member_count,
        isChannel: chat.type.is_channel,
      };
    }
    if (chat.type._ === 'chatTypeBasicGroup') {
      const info = await client.invoke({
        _: 'getBasicGroupFullInfo',
        basic_group_id: chat.type.basic_group_id,
      });
      return {
        memberCount: info.members.length,
        isChannel: false,
      };
    }
    if (chat.type._ === 'chatTypePrivate') {
      const user = await client.invoke({ _: 'getUser', user_id: chat.type.user_id });
      if (user.type._ === 'userTypeBot') {
        return {
          memberCount: 0,
          isChannel: false,
          botActiveUsers: user.type.active_user_count,
        };
      }
    }
  } catch {
    // Silently fail — header will show fallback labels
  }
  return null;
}

// --- Real-time updates via SSE ---

let updatesStarted = false;

function startUpdates() {
  if (updatesStarted) return;
  updatesStarted = true;

  client.on('update', async (update) => {
    try {
      const event = await translateUpdate(update);
      if (event) emitUpdate(event);
    } catch (err) {
      telegramLog.error('Update translation error:', err);
    }
  });

  telegramLog.info('Real-time updates started via SSE');
}

async function translateUpdate(update: Td.Update): Promise<TelegramUpdateEvent | null> {
  switch (update._) {
    case 'updateNewMessage':
      return {
        type: 'new_message',
        chat_id: update.message.chat_id,
        message: update.message,
      };

    case 'updateMessageContent': {
      // Fetch full updated message
      try {
        const msg = await client.invoke({
          _: 'getMessage',
          chat_id: update.chat_id,
          message_id: update.message_id,
        });
        return { type: 'edit_message', chat_id: update.chat_id, message: msg };
      } catch {
        return null;
      }
    }

    // Speech recognition updates — re-fetch message to get updated voiceNote content
    case 'updateSpeechRecognitionTrial':
      return null;

    // @ts-expect-error TDLib update type not in type definitions yet
    case 'updateSpeechRecognitionCompleted': {
      const u = update as unknown as { chat_id: number; message_id: number };
      try {
        const msg = await client.invoke({
          _: 'getMessage',
          chat_id: u.chat_id,
          message_id: u.message_id,
        });
        return { type: 'edit_message', chat_id: u.chat_id, message: msg };
      } catch {
        return null;
      }
    }

    case 'updateMessageEdited': {
      try {
        const msg = await client.invoke({
          _: 'getMessage',
          chat_id: update.chat_id,
          message_id: update.message_id,
        });
        return { type: 'edit_message', chat_id: update.chat_id, message: msg };
      } catch {
        return null;
      }
    }

    case 'updateDeleteMessages':
      if (!update.is_permanent) return null;
      return {
        type: 'delete_messages',
        chat_id: update.chat_id,
        message_ids: update.message_ids,
        is_permanent: update.is_permanent,
      };

    case 'updateMessageInteractionInfo':
      if (!update.interaction_info) return null;
      return {
        type: 'message_reactions',
        chat_id: update.chat_id,
        message_id: update.message_id,
        interaction_info: update.interaction_info,
      };

    case 'updateChatReadOutbox':
      return {
        type: 'read_outbox',
        chat_id: update.chat_id,
        last_read_outbox_message_id: update.last_read_outbox_message_id,
      };

    case 'updateChatAction':
      return {
        type: 'user_typing',
        chat_id: update.chat_id,
        sender_id: update.sender_id,
        action: update.action,
      };

    case 'updateUser':
      return { type: 'user', user: update.user };

    case 'updateUserStatus':
      return {
        type: 'user_status',
        user_id: update.user_id,
        status: update.status,
      };

    case 'updateMessageSendSucceeded':
      return {
        type: 'message_send_succeeded',
        chat_id: update.message.chat_id,
        old_message_id: update.old_message_id,
        message: update.message,
      };

    case 'updateAuthorizationState':
      return {
        type: 'auth_state',
        authorization_state: update.authorization_state,
      };

    case 'updateChatReadInbox':
      return {
        type: 'chat_read_inbox',
        chat_id: update.chat_id,
        last_read_inbox_message_id: update.last_read_inbox_message_id,
        unread_count: update.unread_count,
      };

    case 'updateNewChat':
      return {
        type: 'new_chat',
        chat: update.chat,
      };

    case 'updateChatLastMessage':
      return {
        type: 'chat_last_message',
        chat_id: update.chat_id,
        last_message: update.last_message,
        positions: update.positions,
      };

    case 'updateChatPosition':
      return {
        type: 'chat_position',
        chat_id: update.chat_id,
        position: update.position,
      };

    case 'updateMessageSendFailed':
      return {
        type: 'message_send_failed',
        chat_id: update.message.chat_id,
        old_message_id: update.old_message_id,
        message: update.message,
        error: update.error,
      };

    case 'updateChatTitle':
      return {
        type: 'chat_title',
        chat_id: update.chat_id,
        title: update.title,
      };

    case 'updateChatPhoto':
      return {
        type: 'chat_photo',
        chat_id: update.chat_id,
        photo: update.photo,
      };

    case 'updateChatNotificationSettings':
      return {
        type: 'chat_notification_settings',
        chat_id: update.chat_id,
        notification_settings: update.notification_settings,
      };

    case 'updateChatDraftMessage':
      return {
        type: 'chat_draft_message',
        chat_id: update.chat_id,
        draft_message: update.draft_message,
        positions: update.positions,
      };

    case 'updateConnectionState':
      return {
        type: 'connection_state',
        state: update.state,
      };

    case 'updateChatIsMarkedAsUnread':
      return {
        type: 'chat_is_marked_as_unread',
        chat_id: update.chat_id,
        is_marked_as_unread: update.is_marked_as_unread,
      };

    case 'updateChatUnreadMentionCount':
      return {
        type: 'chat_unread_mention_count',
        chat_id: update.chat_id,
        unread_mention_count: update.unread_mention_count,
      };

    case 'updateMessageIsPinned':
      return {
        type: 'message_is_pinned',
        chat_id: update.chat_id,
        message_id: update.message_id,
        is_pinned: update.is_pinned,
      };

    case 'updateChatOnlineMemberCount':
      return {
        type: 'chat_online_member_count',
        chat_id: update.chat_id,
        online_member_count: update.online_member_count,
      };

    default:
      return null;
  }
}

export async function logout() {
  client.close();
  mediaUrlCache.clear();
  profilePhotoCache.clear();
  customEmojiCache.clear();
  updatesStarted = false;
  updateListeners.clear();
}

// --- Search functions ---

export async function searchInChat(
  chatId: number,
  query: string,
  options: { limit?: number; offsetId?: number } = {},
): Promise<{
  messages: Td.message[];
  totalCount: number;
  hasMore: boolean;
  nextOffsetId: number | undefined;
}> {
  const limit = options.limit ?? 50;
  const result = await client.invoke({
    _: 'searchChatMessages',
    chat_id: chatId,
    query,
    from_message_id: options.offsetId ?? 0,
    offset: 0,
    limit,
    sender_id: undefined,
    filter: undefined,
    topic_id: undefined,
  });

  const messages = result.messages;
  const totalCount = result.total_count;
  const hasMore = result.next_from_message_id !== 0;
  const nextOffsetId = result.next_from_message_id || undefined;

  return {
    messages,
    totalCount,
    hasMore,
    nextOffsetId,
  };
}

export async function searchGlobal(
  query: string,
  options: { limit?: number; offsetCursor?: string } = {},
): Promise<{
  messages: SearchResultMessage[];
  totalCount: number | undefined;
  hasMore: boolean;
  nextCursor: string | undefined;
}> {
  const limit = options.limit ?? 50;

  const result = await client.invoke({
    _: 'searchMessages',
    query,
    offset: options.offsetCursor ?? '',
    limit,
    filter: undefined,
    min_date: 0,
    max_date: 0,
  });

  const messages: SearchResultMessage[] = await Promise.all(
    result.messages.map(async (msg: Td.message) => {
      try {
        const chat = await client.invoke({ _: 'getChat', chat_id: msg.chat_id });
        return { ...msg, chat_title: chat.title };
      } catch {
        return { ...msg, chat_title: undefined };
      }
    }),
  );

  const hasMore = result.next_offset !== '';
  const nextCursor = result.next_offset || undefined;

  return {
    messages,
    totalCount: result.total_count,
    hasMore,
    nextCursor,
  };
}

export async function searchContacts(
  query: string,
  limit = 50,
): Promise<{ myResults: PeerInfo[]; globalResults: PeerInfo[] }> {
  const [contacts, global] = await Promise.all([
    client.invoke({ _: 'searchContacts', query, limit }),
    client.invoke({ _: 'searchChatsOnServer', query, limit }),
  ]);

  const toPeerInfo = async (userId: number): Promise<PeerInfo> => {
    const user = await client.invoke({ _: 'getUser', user_id: userId });
    return {
      id: user.id,
      name: [user.first_name, user.last_name].filter(Boolean).join(' '),
      username: user.usernames?.active_usernames?.[0] ?? null,
      isUser: true,
      isGroup: false,
      isChannel: false,
    };
  };

  const myResults = await Promise.all(contacts.user_ids.slice(0, limit).map(toPeerInfo));
  const globalResults = await Promise.all(
    global.chat_ids.slice(0, limit).map(async (chatId: number) => {
      const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
      const isPrivate = chat.type._ === 'chatTypePrivate';
      const isGroup =
        chat.type._ === 'chatTypeBasicGroup' ||
        (chat.type._ === 'chatTypeSupergroup' && !chat.type.is_channel);
      const isChannel = chat.type._ === 'chatTypeSupergroup' && chat.type.is_channel;
      return {
        id: chat.id,
        name: chat.title,
        username: null,
        isUser: isPrivate,
        isGroup,
        isChannel,
      };
    }),
  );

  return { myResults, globalResults };
}

// --- Formatting ---

export { formatLastSeen, formatTime } from './format';

// --- TDLib message utilities ---

export function getMessageText(msg: Td.message): string {
  const c = msg.content;
  if (c._ === 'messageText') return c.text.text;
  if ('caption' in c && c.caption) return (c.caption as Td.formattedText).text;
  return '';
}

export function getMessageEntities(msg: Td.message): Td.textEntity[] {
  const c = msg.content;
  if (c._ === 'messageText') return c.text.entities;
  if ('caption' in c && c.caption) return (c.caption as Td.formattedText).entities;
  return [];
}

export function getMediaTypeLabel(msg: Td.message): string {
  switch (msg.content._) {
    case 'messagePhoto':
      return 'Photo';
    case 'messageVideo':
      return 'Video';
    case 'messageVoiceNote':
      return 'Voice message';
    case 'messageVideoNote':
      return 'Video message';
    case 'messageSticker':
      return msg.content.sticker.emoji ?? 'Sticker';
    case 'messageDocument':
      return 'File';
    case 'messageAnimation':
      return 'GIF';
    case 'messageAudio':
      return 'Audio';
    case 'messagePoll':
      return 'Poll';
    case 'messageContact':
      return 'Contact';
    case 'messageLocation':
      return 'Location';
    case 'messageVenue':
      return 'Venue';
    case 'messageDice':
      return msg.content.emoji;
    default:
      return '';
  }
}

export function extractMessagePreview(msg: Td.message | undefined): string {
  if (!msg) return '';
  const text = getMessageText(msg);
  if (text) return text;
  return getMediaTypeLabel(msg);
}

export function getSenderUserId(sender: Td.MessageSender): number {
  return sender._ === 'messageSenderUser' ? sender.user_id : 0;
}

/** Fetch a single message by chatId + messageId. */
export async function fetchMessage(chatId: number, messageId: number): Promise<Td.message | null> {
  try {
    return await client.invoke({
      _: 'getMessage',
      chat_id: chatId,
      message_id: messageId,
    });
  } catch {
    return null;
  }
}
