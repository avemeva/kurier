import type { Td, UIChatContext, UIMessageItem, UISearchResult, UIUser } from '@/lib/types';
import {
  enrichReplyPreviews,
  toUIChat,
  toUIMessage,
  toUIPendingMessage,
  toUISearchResult,
  toUIUser,
} from '@/lib/types';
import { formatLastSeen } from '../format';
import { createSelector } from './create-selector';
import type { ChatState, HeaderStatus } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_UI_MESSAGES: UIMessageItem[] = [];

// ---------------------------------------------------------------------------
// selectChatMessages — PURE, no side effects
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
  ]) => {
    if (!chatId || !real || !users) return EMPTY_UI_MESSAGES;

    const allChats = [...(chats ?? []), ...(archivedChats ?? [])];
    const converted = enrichReplyPreviews(
      real.map((msg: Td.message) => toUIMessage(msg, users, lastReadOutboxId, allChats)),
    );

    // Backfill cached reply previews (pure — reads from store state, no fetches)
    for (const m of converted) {
      if (m.replyToMessageId === 0) continue;
      if (m.replyPreview) continue;
      const key = `${m.chatId}_${m.replyToMessageId}`;
      const cached = replyPreviews?.[key];
      if (cached) {
        m.replyPreview = { ...cached, quoteText: m.replyQuoteText || cached.quoteText };
      }
    }

    // Backfill cached pinned previews (pure)
    for (let i = 0; i < converted.length; i++) {
      const m = converted[i];
      if (m.servicePinnedMessageId === 0) continue;
      const key = `${m.chatId}_${m.servicePinnedMessageId}`;
      const cached = pinnedPreviews?.[key];
      if (typeof cached === 'string') {
        const text = m.senderName ? `${m.senderName} pinned ${cached}` : `pinned ${cached}`;
        converted[i] = { ...m, serviceText: text };
      } else if (cached === null) {
        const fallback = m.senderName ? `${m.senderName} pinned a message` : 'pinned a message';
        converted[i] = { ...m, serviceText: fallback };
      }
      // cached === undefined → not yet resolved. Component's useEffect will trigger the fetch.
    }

    const uiMessages: UIMessageItem[] = converted;
    if (pending?.length) {
      for (const p of pending) uiMessages.push(toUIPendingMessage(p));
    }

    return uiMessages.length > 0 ? uiMessages : EMPTY_UI_MESSAGES;
  },
);

// ---------------------------------------------------------------------------
// selectUnresolvedReplies — tells the component what to fetch
// ---------------------------------------------------------------------------

type UnresolvedItem = { chatId: number; messageId: number };

function unresolvedItemsEqual(a: UnresolvedItem[], b: UnresolvedItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].chatId !== b[i].chatId || a[i].messageId !== b[i].messageId) return false;
  }
  return true;
}

export const selectUnresolvedReplies = createSelector(
  (s: ChatState) => {
    const chatId = s.selectedChatId;
    if (!chatId) return [null, null] as const;
    return [s.messagesByChat[chatId] ?? null, s.replyPreviews] as const;
  },
  ([msgs, replyPreviews]) => {
    if (!msgs || !replyPreviews) return [];
    const result: UnresolvedItem[] = [];
    for (const m of msgs) {
      if (!m.reply_to) continue;
      const replyToId = m.reply_to._ === 'messageReplyToMessage' ? m.reply_to.message_id : 0;
      if (!replyToId) continue;
      const key = `${m.chat_id}_${replyToId}`;
      if (replyPreviews[key] === undefined) {
        result.push({ chatId: m.chat_id, messageId: replyToId });
      }
    }
    return result;
  },
  unresolvedItemsEqual,
);

// ---------------------------------------------------------------------------
// selectUnresolvedPinnedPreviews
// ---------------------------------------------------------------------------

export const selectUnresolvedPinnedPreviews = createSelector(
  (s: ChatState) => {
    const chatId = s.selectedChatId;
    if (!chatId) return [null, null] as const;
    return [s.messagesByChat[chatId] ?? null, s.pinnedPreviews] as const;
  },
  ([msgs, pinnedPreviews]) => {
    if (!msgs || !pinnedPreviews) return [];
    const result: UnresolvedItem[] = [];
    for (const m of msgs) {
      if (m.content._ !== 'messagePinMessage') continue;
      const pinnedId = (m.content as { message_id: number }).message_id;
      if (!pinnedId) continue;
      const key = `${m.chat_id}_${pinnedId}`;
      if (pinnedPreviews[key] === undefined) {
        result.push({ chatId: m.chat_id, messageId: pinnedId });
      }
    }
    return result;
  },
  unresolvedItemsEqual,
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
    return toUIChat(rawChat, {
      photoUrl: photo ?? null,
      user,
      isOnline: status?._ === 'userStatusOnline',
      myUserId,
      users: state.users,
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
// selectUIChats / selectUIArchivedChats
// ---------------------------------------------------------------------------

function chatContext(c: Td.chat, state: ChatState): UIChatContext {
  const userId = c.type._ === 'chatTypePrivate' ? c.type.user_id : 0;
  return {
    photoUrl: state.profilePhotos[c.id] ?? null,
    user: userId ? state.users.get(userId) : undefined,
    isOnline: userId ? state.userStatuses[userId]?._ === 'userStatusOnline' : false,
    myUserId: state.myUserId,
    users: state.users,
  };
}

export const selectUIChats = createSelector(
  (s: ChatState) => [s.chats, s.profilePhotos, s.users, s.userStatuses, s.myUserId] as const,
  (_deps, state) => state.chats.map((c: Td.chat) => toUIChat(c, chatContext(c, state))),
);

export const selectUIArchivedChats = createSelector(
  (s: ChatState) =>
    [s.archivedChats, s.profilePhotos, s.users, s.userStatuses, s.myUserId] as const,
  (_deps, state) => state.archivedChats.map((c: Td.chat) => toUIChat(c, chatContext(c, state))),
);

// ---------------------------------------------------------------------------
// selectUIUser
// ---------------------------------------------------------------------------

export function selectUIUser(state: ChatState, userId: number): UIUser | null {
  const user = state.users.get(userId);
  if (!user) return null;
  return toUIUser(user);
}

// NOTE: selectUIUser is intentionally NOT memoized at module level.
// It accepts a parameter (userId), so module-level memo creates a singleton
// that thrashes when called with different IDs.
//
// For component-level memoization, use:
//   const selector = useMemo(() => createSelector(
//     (s: ChatState) => [s.users.get(userId)] as const,
//     ([user]) => user ? toUIUser(user) : null,
//   ), [userId]);

// ---------------------------------------------------------------------------
// selectSearchResults — transforms raw Td.message[] → UISearchResult[]
// ---------------------------------------------------------------------------

const EMPTY_SEARCH_RESULTS: UISearchResult[] = [];

export const selectSearchResults = createSelector(
  (s: ChatState) => [s.searchResults, s.profilePhotos] as const,
  ([results, profilePhotos]): UISearchResult[] => {
    if (results.length === 0) return EMPTY_SEARCH_RESULTS;
    return results.map((m: Td.message & { chat_title?: string }) =>
      toUISearchResult(m, profilePhotos[m.chat_id] ?? null),
    );
  },
);

// ---------------------------------------------------------------------------
// Reset all selector caches (for tests)
// ---------------------------------------------------------------------------

export function resetSelectors(): void {
  selectChatMessages.reset();
  selectUnresolvedReplies.reset();
  selectUnresolvedPinnedPreviews.reset();
  selectSelectedChat.reset();
  selectHeaderStatus.reset();
  selectUIChats.reset();
  selectUIArchivedChats.reset();
  selectSearchResults.reset();
}
