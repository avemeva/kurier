import { formatLastSeen } from '../../lib/format';
import type { Td, TGChatContext, TGMessage, TGSearchResult, TGTypingUser, TGUser } from '../types';
import { groupAndConvert, hydrateMessage, toTGChat, toTGSearchResult, toTGUser } from '../types';
import { createSelector } from './create-selector';
import type { ChatState, HeaderStatus } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_UI_MESSAGES: TGMessage[] = [];

// ---------------------------------------------------------------------------
// selectChatMessages — compositional TGMessage[], no side effects
// ---------------------------------------------------------------------------

export const selectChatMessages = createSelector(
  (s: ChatState) => {
    const chatId = s.selectedChatId;
    if (!chatId)
      return [
        null,
        null,
        null,
        null as Map<number, Td.user> | null,
        0,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ] as const;
    const rawChat =
      s.chats.find((c: Td.chat) => c.id === chatId) ??
      s.archivedChats.find((c: Td.chat) => c.id === chatId) ??
      null;
    return [
      chatId,
      s.messagesByChat[chatId] ?? null,
      s.pendingByChat[chatId] ?? null,
      s.users,
      rawChat?.last_read_outbox_message_id ?? 0,
      s.replyPreviews,
      s.pinnedPreviews,
      s.chats,
      s.archivedChats,
      s.mediaUrls,
      s.thumbUrls,
      s.profilePhotos,
      s.customEmojiUrls,
    ] as const;
  },
  ([
    chatId,
    real,
    pending,
    users,
    lastReadOutboxId,
    replyPreviews,
    pinnedPreviews,
    chats,
    archivedChats,
    mediaUrls,
    thumbUrls,
    profilePhotos,
    customEmojiUrls,
  ]) => {
    if (!chatId || !real || !users) return EMPTY_UI_MESSAGES;

    const allChats = [...(chats ?? []), ...(archivedChats ?? [])];
    const messages = groupAndConvert(real, pending ?? [], users, lastReadOutboxId, allChats);

    // Hydrate all messages with media URLs
    return messages.map((m) =>
      hydrateMessage(
        m,
        mediaUrls ?? {},
        thumbUrls ?? {},
        profilePhotos ?? {},
        customEmojiUrls ?? {},
        replyPreviews ?? {},
        pinnedPreviews ?? {},
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// selectSelectedChat
// ---------------------------------------------------------------------------

export const selectSelectedChat = createSelector(
  (s: ChatState) => {
    const chatId = s.selectedChatId;
    if (!chatId) return [null, undefined, undefined, undefined, 0] as const;
    const rawChat =
      s.chats.find((c: Td.chat) => c.id === chatId) ??
      s.archivedChats.find((c: Td.chat) => c.id === chatId) ??
      null;
    if (!rawChat) return [null, undefined, undefined, undefined, 0] as const;
    const userId = rawChat.type._ === 'chatTypePrivate' ? rawChat.type.user_id : 0;
    return [
      rawChat,
      s.profilePhotos[rawChat.id],
      userId ? s.users.get(userId) : undefined,
      userId ? s.userStatuses[userId] : undefined,
      s.myUserId,
    ] as const;
  },
  ([rawChat, photo, user, status, myUserId], state) => {
    if (!rawChat) return null;
    return toTGChat(rawChat, {
      photoUrl: photo ?? null,
      user,
      isOnline: status?._ === 'userStatusOnline',
      myUserId,
      users: state.users,
      avatarUrl: photo,
    });
  },
);

/** @deprecated alias for backward compat during migration */
export const selectSelectedDialog = selectSelectedChat;

// ---------------------------------------------------------------------------
// selectHeaderStatus
// ---------------------------------------------------------------------------

function formatCount(count: number, label: string): string {
  if (label === 'online') return `${count.toLocaleString()} online`;
  return `${count.toLocaleString()} ${label}${count !== 1 ? 's' : ''}`;
}

export function actionLabel(action: Td.ChatAction): string {
  switch (action._) {
    case 'chatActionRecordingVideo':
      return 'recording video';
    case 'chatActionUploadingVideo':
      return 'sending video';
    case 'chatActionRecordingVoiceNote':
      return 'recording voice';
    case 'chatActionUploadingVoiceNote':
      return 'sending voice';
    case 'chatActionUploadingPhoto':
      return 'sending photo';
    case 'chatActionUploadingDocument':
      return 'sending file';
    case 'chatActionChoosingSticker':
      return 'choosing sticker';
    case 'chatActionChoosingLocation':
      return 'choosing location';
    case 'chatActionChoosingContact':
      return 'choosing contact';
    case 'chatActionStartPlayingGame':
      return 'playing game';
    case 'chatActionRecordingVideoNote':
      return 'recording video message';
    case 'chatActionUploadingVideoNote':
      return 'sending video message';
    case 'chatActionWatchingAnimations':
      return 'watching animation';
    default:
      return 'typing';
  }
}

export const selectHeaderStatus = createSelector(
  (s: ChatState) => {
    const chatId = s.selectedChatId;
    const rawChat = chatId
      ? (s.chats.find((c: Td.chat) => c.id === chatId) ??
        s.archivedChats.find((c: Td.chat) => c.id === chatId) ??
        null)
      : null;
    const id = rawChat?.id ?? null;
    return [
      id,
      rawChat,
      id ? s.typingByChat[id] : undefined,
      id ? s.userStatuses[id] : undefined,
      id ? s.chatInfoCache[id] : undefined,
      id ? s.chatOnlineCounts[id] : undefined,
      s.users,
    ] as const;
  },
  ([chatId, rawChat, chatTyping, userStatus, chatInfo, onlineCount, users]): HeaderStatus => {
    if (!chatId || !rawChat) return null;

    const isPrivate = rawChat.type._ === 'chatTypePrivate';
    const isGroup =
      rawChat.type._ === 'chatTypeBasicGroup' ||
      (rawChat.type._ === 'chatTypeSupergroup' && !rawChat.type.is_channel);
    const isChannel = rawChat.type._ === 'chatTypeSupergroup' && rawChat.type.is_channel;

    // Typing indicators take priority
    if (chatTyping && Object.keys(chatTyping).length > 0) {
      if (isPrivate) {
        const entry = Object.values(chatTyping)[0] as { action: Td.ChatAction; expiresAt: number };
        return { type: 'typing', text: actionLabel(entry.action) };
      }
      const entries = Object.keys(chatTyping).map((uid) => ({
        name: users.get(Number(uid))?.first_name ?? 'Someone',
        label: actionLabel(chatTyping[Number(uid)].action),
      }));
      const byLabel = new Map<string, string[]>();
      for (const e of entries) {
        const arr = byLabel.get(e.label);
        if (arr) arr.push(e.name);
        else byLabel.set(e.label, [e.name]);
      }
      const parts: string[] = [];
      for (const [label, names] of byLabel) {
        const verb = names.length === 1 ? 'is' : 'are';
        parts.push(`${names.join(', ')} ${verb} ${label}`);
      }
      return { type: 'typing', text: parts.join(', ') };
    }

    if (isPrivate) {
      if (chatInfo?.botActiveUsers != null) {
        if (chatInfo.botActiveUsers > 0) {
          return { type: 'label', text: formatCount(chatInfo.botActiveUsers, 'monthly user') };
        }
        return { type: 'label', text: 'bot' };
      }
      if (userStatus?._ === 'userStatusOnline') return { type: 'online' };
      if (userStatus?._ === 'userStatusOffline' && userStatus.was_online) {
        return { type: 'last_seen', text: formatLastSeen(userStatus.was_online) };
      }
      if (userStatus?._ === 'userStatusRecently')
        return { type: 'last_seen', text: 'last seen recently' };
      if (userStatus?._ === 'userStatusLastWeek')
        return { type: 'last_seen', text: 'last seen within a week' };
      if (userStatus?._ === 'userStatusLastMonth')
        return { type: 'last_seen', text: 'last seen within a month' };
      return null;
    }

    if (isChannel && chatInfo?.memberCount) {
      return { type: 'label', text: formatCount(chatInfo.memberCount, 'subscriber') };
    }

    if (isGroup && chatInfo?.memberCount) {
      const membersText = formatCount(chatInfo.memberCount, 'member');
      if (onlineCount && onlineCount > 1) {
        return { type: 'label', text: `${membersText}, ${formatCount(onlineCount, 'online')}` };
      }
      return { type: 'label', text: membersText };
    }

    return null;
  },
);

// ---------------------------------------------------------------------------
// selectChats / selectArchivedChats
// ---------------------------------------------------------------------------

function extractTypingUsers(
  chatId: number,
  chatKind: string,
  typingByChat: ChatState['typingByChat'],
  users: Map<number, Td.user>,
): TGTypingUser[] | null {
  const chatTyping = typingByChat[chatId];
  if (!chatTyping || Object.keys(chatTyping).length === 0) return null;

  const isPrivate = chatKind === 'chatTypePrivate';
  if (isPrivate) {
    const entry = Object.values(chatTyping)[0] as { action: Td.ChatAction; expiresAt: number };
    return [{ name: '', action: actionLabel(entry.action) }];
  }

  return Object.keys(chatTyping).map((uid) => ({
    name: users.get(Number(uid))?.first_name ?? 'Someone',
    action: actionLabel(chatTyping[Number(uid)].action),
  }));
}

function chatContext(c: Td.chat, state: ChatState): TGChatContext {
  const userId = c.type._ === 'chatTypePrivate' ? c.type.user_id : 0;
  const lastMsgId = c.last_message?.id ?? 0;
  const thumbKey = `${c.id}_${lastMsgId}`;
  return {
    photoUrl: state.profilePhotos[c.id] ?? null,
    user: userId ? state.users.get(userId) : undefined,
    isOnline: userId ? state.userStatuses[userId]?._ === 'userStatusOnline' : false,
    myUserId: state.myUserId,
    users: state.users,
    avatarUrl: state.profilePhotos[c.id],
    lastMessageThumbUrl: lastMsgId ? (state.thumbUrls[thumbKey] ?? null) : null,
    typing: extractTypingUsers(c.id, c.type._, state.typingByChat, state.users),
  };
}

export const selectChats = createSelector(
  (s: ChatState) =>
    [
      s.chats,
      s.profilePhotos,
      s.users,
      s.userStatuses,
      s.myUserId,
      s.thumbUrls,
      s.typingByChat,
    ] as const,
  (_deps, state) => state.chats.map((c: Td.chat) => toTGChat(c, chatContext(c, state))),
);

export const selectArchivedChats = createSelector(
  (s: ChatState) =>
    [
      s.archivedChats,
      s.profilePhotos,
      s.users,
      s.userStatuses,
      s.myUserId,
      s.thumbUrls,
      s.typingByChat,
    ] as const,
  (_deps, state) => state.archivedChats.map((c: Td.chat) => toTGChat(c, chatContext(c, state))),
);

// ---------------------------------------------------------------------------
// selectTGUser
// ---------------------------------------------------------------------------

export function selectTGUser(state: ChatState, userId: number): TGUser | null {
  const user = state.users.get(userId);
  if (!user) return null;
  return toTGUser(user);
}

// NOTE: selectTGUser is intentionally NOT memoized at module level.
// It accepts a parameter (userId), so module-level memo creates a singleton
// that thrashes when called with different IDs.
//
// For component-level memoization, use:
//   const selector = useMemo(() => createSelector(
//     (s: ChatState) => [s.users.get(userId)] as const,
//     ([user]) => user ? toTGUser(user) : null,
//   ), [userId]);

// ---------------------------------------------------------------------------
// selectSearchResults — transforms raw Td.message[] → TGSearchResult[]
// ---------------------------------------------------------------------------

const EMPTY_SEARCH_RESULTS: TGSearchResult[] = [];

export const selectSearchResults = createSelector(
  (s: ChatState) => [s.searchResults, s.profilePhotos] as const,
  ([results, profilePhotos]): TGSearchResult[] => {
    if (results.length === 0) return EMPTY_SEARCH_RESULTS;
    return results.map((m: Td.message & { chat_title?: string }) =>
      toTGSearchResult(m, profilePhotos[m.chat_id] ?? null),
    );
  },
);

// ---------------------------------------------------------------------------
// selectContactPhotos — profile photos for contact search results
// ---------------------------------------------------------------------------

const EMPTY_CONTACT_PHOTOS: Record<number, string> = {};

export const selectContactPhotos = createSelector(
  (s: ChatState) => [s.contactResults, s.profilePhotos] as const,
  ([contacts, profilePhotos]): Record<number, string> => {
    if (contacts.length === 0) return EMPTY_CONTACT_PHOTOS;
    const photos: Record<number, string> = {};
    for (const peer of contacts) {
      const url = profilePhotos[peer.id];
      if (url) photos[peer.id] = url;
    }
    return photos;
  },
);

// ---------------------------------------------------------------------------
// Reset all selector caches (for tests)
// ---------------------------------------------------------------------------

export function resetSelectors(): void {
  selectChatMessages.reset();
  selectSelectedChat.reset();
  selectHeaderStatus.reset();
  selectChats.reset();
  selectArchivedChats.reset();
  selectSearchResults.reset();
  selectContactPhotos.reset();
}
