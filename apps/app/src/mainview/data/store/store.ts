import { create } from 'zustand';
import { log } from '../../lib/log';
import {
  clearMediaCache,
  closeTdChat,
  downloadFileById,
  downloadMedia,
  downloadThumbnail,
  fetchMessage,
  getChatInfo,
  getCustomEmojiInfo,
  getDialogs,
  getMe,
  getMessages,
  getMessagesAroundMessage,
  getMessageText,
  getNewerMessages,
  getProfilePhotoUrl,
  getSenderUserId,
  getUser,
  loadMoreDialogs,
  markAsRead,
  onUpdate,
  openTdChat,
  searchContacts,
  searchGlobal,
  searchInChat,
  searchNextUnreadMention,
  searchNextUnreadReaction,
  sendMessage,
  sendReaction,
  recognizeSpeech as tdRecognizeSpeech,
  viewMessages,
} from '../telegram';
import type { PendingMessage, Td } from '../types';
import { buildReplyPreview, extractMediaLabel, extractText } from '../types';
import * as requests from './request-tracker';
import { resetSelectors } from './selectors';
import * as timers from './timer-registry';
import type { ChatState } from './types';
import { INITIAL_STATE } from './types';

// ---------------------------------------------------------------------------
// Helpers (pure, no state)
// ---------------------------------------------------------------------------

function isChatPinned(chat: Td.chat): boolean {
  return chat.positions.some((p) => p.is_pinned);
}

function getChatOrder(chat: Td.chat): string {
  return chat.positions[0]?.order ?? '0';
}

function sortByOrder(chats: Td.chat[]): Td.chat[] {
  return [...chats].sort((a, b) => getChatOrder(b).localeCompare(getChatOrder(a)));
}

/** Content types that may have a downloadable thumbnail. */
const THUMB_CONTENT_TYPES = new Set([
  'messagePhoto',
  'messageVideo',
  'messageAnimation',
  'messageVideoNote',
  'messageSticker',
]);

let tempIdCounter = 0;

// ---------------------------------------------------------------------------
// Side-effect helpers (owned by the store, use request-tracker for dedup)
// ---------------------------------------------------------------------------

function loadThumbnailsForChats(
  chats: Td.chat[],
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
): void {
  for (const chat of chats.slice(0, 30)) {
    const msg = chat.last_message;
    if (!msg) continue;
    const hasThumb =
      THUMB_CONTENT_TYPES.has(msg.content._) ||
      (msg.content._ === 'messageText' && !!msg.content.link_preview);
    if (!hasThumb) continue;
    const key = `${chat.id}_${msg.id}`;
    if (!requests.track('thumb', key)) continue;
    downloadThumbnail(chat.id, msg.id).then((url) => {
      if (url) set((s) => ({ thumbUrls: { ...s.thumbUrls, [key]: url } }));
    });
  }
}

function loadThumbnailForMessage(
  chatId: number,
  msg: Td.message,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
): void {
  const hasThumb =
    THUMB_CONTENT_TYPES.has(msg.content._) ||
    (msg.content._ === 'messageText' && !!(msg.content as Td.messageText).link_preview);
  if (!hasThumb) return;
  const key = `${chatId}_${msg.id}`;
  if (!requests.track('thumb', key)) return;
  downloadThumbnail(chatId, msg.id).then((url) => {
    if (url) set((s) => ({ thumbUrls: { ...s.thumbUrls, [key]: url } }));
  });
}

function fetchMissingUsers(
  messages: Td.message[],
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
): void {
  const { users } = get();
  const missing: number[] = [];
  for (const msg of messages) {
    if (msg.sender_id._ === 'messageSenderUser') {
      const uid = msg.sender_id.user_id;
      if (!users.has(uid) && requests.track('user', uid)) missing.push(uid);
    }
    if (msg.forward_info?.origin._ === 'messageOriginUser') {
      const uid = msg.forward_info.origin.sender_user_id;
      if (!users.has(uid) && requests.track('user', uid)) missing.push(uid);
    }
  }
  if (missing.length === 0) return;
  Promise.all(missing.map((uid) => getUser(uid).catch(() => null))).then((results) => {
    set((s) => {
      const next = new Map(s.users);
      let nextStatuses = s.userStatuses;
      let statusChanged = false;
      for (const user of results) {
        if (user) {
          next.set(user.id, user);
          if (user.status && !nextStatuses[user.id]) {
            if (!statusChanged) {
              nextStatuses = { ...nextStatuses };
              statusChanged = true;
            }
            nextStatuses[user.id] = user.status;
          }
        }
      }
      return statusChanged ? { users: next, userStatuses: nextStatuses } : { users: next };
    });
  });
}

function fetchMissingChatPreviewUsers(
  chats: Td.chat[],
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
): void {
  const msgs = chats
    .filter(
      (c) =>
        (c.type._ === 'chatTypeBasicGroup' ||
          (c.type._ === 'chatTypeSupergroup' && !c.type.is_channel)) &&
        c.last_message &&
        !c.last_message.is_outgoing,
    )
    .map((c) => c.last_message as Td.message);
  if (msgs.length > 0) {
    fetchMissingUsers(msgs, get, set);
    loadForwardPhotos(msgs, get().loadProfilePhoto);
  }
}

function loadForwardPhotos(
  messages: Td.message[],
  loadProfilePhoto: (chatId: number) => void,
): void {
  for (const msg of messages) {
    if (!msg.forward_info) continue;
    const origin = msg.forward_info.origin;
    switch (origin._) {
      case 'messageOriginUser':
        loadProfilePhoto(origin.sender_user_id);
        break;
      case 'messageOriginChat':
        loadProfilePhoto(origin.sender_chat_id);
        break;
      case 'messageOriginChannel':
        loadProfilePhoto(origin.chat_id);
        break;
    }
  }
}

/** Shared fetch-and-set for opening a chat's messages. */
async function fetchAndSetMessages(
  chatId: number,
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
): Promise<void> {
  const { messages: msgs, hasMore } = await getMessages(chatId);
  const ordered = msgs.reverse();
  set((s) => ({
    messagesByChat: { ...s.messagesByChat, [chatId]: ordered },
    hasOlder: { ...s.hasOlder, [chatId]: hasMore },
    hasNewer: { ...s.hasNewer, [chatId]: false },
    isAtLatest: { ...s.isAtLatest, [chatId]: true },
  }));
  fetchMissingUsers(ordered, get, set);
  loadForwardPhotos(ordered, get().loadProfilePhoto);
  markAsRead(chatId);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatStore = create<ChatState>((set, get) => ({
  ...INITIAL_STATE,

  // === Dialog loading ===

  loadDialogs: async () => {
    if (!get().myUserId) {
      getMe()
        .then((me) => set({ myUserId: me.id }))
        .catch(() => {});
    }
    try {
      const [regular, archived] = await Promise.all([
        getDialogs({ archived: false }),
        getDialogs({ archived: true }),
      ]);
      const filteredArchived = archived.filter((c) => !isChatPinned(c));
      set({
        chats: regular,
        archivedChats: filteredArchived,
        hasMoreChats: regular.length >= 100,
        hasMoreArchivedChats: filteredArchived.length >= 100,
      });
      loadThumbnailsForChats(regular, set);
      loadThumbnailsForChats(filteredArchived, set);
      fetchMissingChatPreviewUsers(regular, get, set);
      fetchMissingChatPreviewUsers(filteredArchived, get, set);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loadingDialogs: false });
    }
  },

  loadMoreChats: async (archived: boolean) => {
    const loadingKey = archived ? 'loadingMoreArchivedChats' : 'loadingMoreChats';
    const hasMoreKey = archived ? 'hasMoreArchivedChats' : 'hasMoreChats';
    const chatsKey = archived ? 'archivedChats' : 'chats';
    if (get()[loadingKey] || !get()[hasMoreKey]) return;
    set({ [loadingKey]: true });
    try {
      const result = await loadMoreDialogs({ archived, currentCount: get()[chatsKey].length });
      if (result.chats.length > 0) {
        set((s) => ({
          [chatsKey]: [...s[chatsKey], ...result.chats],
          [hasMoreKey]: result.hasMore,
          [loadingKey]: false,
        }));
      } else {
        set({ [hasMoreKey]: false, [loadingKey]: false });
      }
    } catch {
      set({ [loadingKey]: false });
    }
  },

  // === Chat navigation ===

  openChat: async (chat: Td.chat) => {
    const { messagesByChat, selectedChatId: previousChatId } = get();
    if (previousChatId) closeTdChat(previousChatId).catch(() => {});
    set({ selectedChatId: chat.id });
    openTdChat(chat.id).catch(() => {});

    // Fetch chat info
    if (!get().chatInfoCache[chat.id]) {
      getChatInfo(chat).then((info) => {
        if (info) set((s) => ({ chatInfoCache: { ...s.chatInfoCache, [chat.id]: info } }));
      });
    }

    // Clear unread
    if (chat.unread_count > 0) {
      const clearUnread = (list: Td.chat[]) =>
        list.map((c) => (c.id === chat.id ? { ...c, unread_count: 0 } : c));
      set((s) => ({ chats: clearUnread(s.chats), archivedChats: clearUnread(s.archivedChats) }));
    }

    if (messagesByChat[chat.id]) {
      markAsRead(chat.id);
      return;
    }

    set({ loadingMessages: true, error: '' });
    try {
      await fetchAndSetMessages(chat.id, get, set);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loadingMessages: false });
    }
  },

  openChatById: async (chatId: number) => {
    const { chats, archivedChats } = get();
    const existingChat =
      chats.find((c) => c.id === chatId) ?? archivedChats.find((c) => c.id === chatId);
    if (existingChat) return get().openChat(existingChat);

    const { selectedChatId: previousChatId, messagesByChat } = get();
    if (previousChatId) closeTdChat(previousChatId).catch(() => {});
    set({ selectedChatId: chatId });
    openTdChat(chatId).catch(() => {});

    if (messagesByChat[chatId]) {
      markAsRead(chatId);
      return;
    }

    set({ loadingMessages: true, error: '' });
    try {
      await fetchAndSetMessages(chatId, get, set);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loadingMessages: false });
    }
  },

  // === Message pagination ===

  loadOlderMessages: async () => {
    const { selectedChatId, messagesByChat, hasOlder, loadingOlderMessages } = get();
    if (!selectedChatId || loadingOlderMessages) return;
    if (!hasOlder[selectedChatId]) return;
    const existing = messagesByChat[selectedChatId] ?? [];
    if (existing.length === 0) return;

    set({ loadingOlderMessages: true });
    try {
      const { messages: older, hasMore } = await getMessages(selectedChatId, {
        fromMessageId: existing[0].id,
      });
      if (older.length === 0) {
        set((s) => ({
          hasOlder: { ...s.hasOlder, [selectedChatId]: false },
          loadingOlderMessages: false,
        }));
        return;
      }
      set((s) => {
        const current = s.messagesByChat[selectedChatId] ?? [];
        const ids = new Set(current.map((m) => m.id));
        const deduped = older.filter((m) => !ids.has(m.id)).reverse();
        return {
          messagesByChat: { ...s.messagesByChat, [selectedChatId]: [...deduped, ...current] },
          hasOlder: { ...s.hasOlder, [selectedChatId]: hasMore },
          loadingOlderMessages: false,
        };
      });
      fetchMissingUsers(older, get, set);
      loadForwardPhotos(older, get().loadProfilePhoto);
    } catch {
      set({ loadingOlderMessages: false });
    }
  },

  loadNewerMessages: async () => {
    const { selectedChatId, messagesByChat, hasNewer, isAtLatest, loadingNewerMessages } = get();
    if (!selectedChatId || loadingNewerMessages) return;
    if (isAtLatest[selectedChatId]) return;
    if (hasNewer[selectedChatId] === false) return;
    const existing = messagesByChat[selectedChatId] ?? [];
    if (existing.length === 0) return;

    set({ loadingNewerMessages: true });
    try {
      const { messages: newer, hasMore } = await getNewerMessages(selectedChatId, {
        fromMessageId: existing[existing.length - 1].id,
      });
      if (newer.length === 0) {
        set((s) => ({
          hasNewer: { ...s.hasNewer, [selectedChatId]: false },
          isAtLatest: { ...s.isAtLatest, [selectedChatId]: true },
          loadingNewerMessages: false,
        }));
        return;
      }
      set((s) => {
        const current = s.messagesByChat[selectedChatId] ?? [];
        const ids = new Set(current.map((m) => m.id));
        const deduped = newer.filter((m) => !ids.has(m.id));
        return {
          messagesByChat: { ...s.messagesByChat, [selectedChatId]: [...current, ...deduped] },
          hasNewer: { ...s.hasNewer, [selectedChatId]: hasMore },
          isAtLatest: { ...s.isAtLatest, [selectedChatId]: !hasMore },
          loadingNewerMessages: false,
        };
      });
      fetchMissingUsers(newer, get, set);
      loadForwardPhotos(newer, get().loadProfilePhoto);
    } catch {
      set({ loadingNewerMessages: false });
    }
  },

  loadMessagesAround: async (messageId: number) => {
    const { selectedChatId } = get();
    if (!selectedChatId) return;
    set({ loadingMessages: true, error: '' });
    try {
      const {
        messages: msgs,
        hasOlder,
        hasNewer,
      } = await getMessagesAroundMessage(selectedChatId, messageId);
      set((s) => ({
        messagesByChat: { ...s.messagesByChat, [selectedChatId]: msgs },
        hasOlder: { ...s.hasOlder, [selectedChatId]: hasOlder },
        hasNewer: { ...s.hasNewer, [selectedChatId]: hasNewer },
        isAtLatest: { ...s.isAtLatest, [selectedChatId]: false },
        loadingMessages: false,
      }));
      fetchMissingUsers(msgs, get, set);
      loadForwardPhotos(msgs, get().loadProfilePhoto);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loadingMessages: false });
    }
  },

  loadLatestMessages: async () => {
    const { selectedChatId } = get();
    if (!selectedChatId) return;
    set({ loadingMessages: true, error: '' });
    try {
      const { messages: msgs, hasMore } = await getMessages(selectedChatId);
      const ordered = msgs.reverse();
      set((s) => ({
        messagesByChat: { ...s.messagesByChat, [selectedChatId]: ordered },
        hasOlder: { ...s.hasOlder, [selectedChatId]: hasMore },
        hasNewer: { ...s.hasNewer, [selectedChatId]: false },
        isAtLatest: { ...s.isAtLatest, [selectedChatId]: true },
        loadingMessages: false,
      }));
      fetchMissingUsers(ordered, get, set);
      loadForwardPhotos(ordered, get().loadProfilePhoto);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loadingMessages: false });
    }
  },

  // === Messaging ===

  send: (chatId: number, text: string) => {
    const localId = `pending_${++tempIdCounter}`;
    const pending: PendingMessage = {
      chat_id: chatId,
      text,
      date: Math.floor(Date.now() / 1000),
      _pending: 'sending',
      localId,
    };
    const updatePreview = (list: Td.chat[]) =>
      list.map((c) => {
        if (c.id !== chatId) return c;
        const fakeLastMsg = c.last_message
          ? {
              ...c.last_message,
              content: {
                _: 'messageText' as const,
                text: { _: 'formattedText' as const, text, entities: [] },
                web_page: undefined,
              },
              date: pending.date,
            }
          : undefined;
        return { ...c, last_message: fakeLastMsg };
      });
    set((s) => ({
      pendingByChat: {
        ...s.pendingByChat,
        [chatId]: [...(s.pendingByChat[chatId] ?? []), pending],
      },
      chats: updatePreview(s.chats),
      archivedChats: updatePreview(s.archivedChats),
    }));
    sendMessage(chatId, text)
      .then((realMsg) => {
        set((s) => {
          const chatPending = s.pendingByChat[chatId] ?? [];
          const idx = chatPending.findIndex((p) => p.localId === localId);
          if (idx === -1) return s;
          const newPending = [...chatPending];
          newPending.splice(idx, 1);
          return {
            pendingByChat: { ...s.pendingByChat, [chatId]: newPending },
            messagesByChat: {
              ...s.messagesByChat,
              [chatId]: [...(s.messagesByChat[chatId] ?? []), realMsg],
            },
          };
        });
      })
      .catch((err) => {
        set((s) => ({
          pendingByChat: {
            ...s.pendingByChat,
            [chatId]: (s.pendingByChat[chatId] ?? []).map((p) =>
              p.localId === localId ? { ...p, _pending: 'failed' as const } : p,
            ),
          },
          error: err instanceof Error ? err.message : String(err),
        }));
      });
  },

  react: (chatId: number, msgId: number, emoji: string, chosen: boolean) => {
    const { messagesByChat } = get();
    const messages = messagesByChat[chatId];
    if (!messages) return;

    const updatedMessages = messages.map((m): Td.message => {
      if (m.id !== msgId) return m;
      const info: Td.messageInteractionInfo = m.interaction_info ?? {
        _: 'messageInteractionInfo' as const,
        view_count: 0,
        forward_count: 0,
      };
      const reactions = [...(info.reactions?.reactions ?? [])];
      const idx = reactions.findIndex(
        (r) => r.type._ === 'reactionTypeEmoji' && r.type.emoji === emoji,
      );
      if (chosen) {
        if (idx !== -1) {
          const existing = reactions[idx];
          if (existing && existing.total_count <= 1) reactions.splice(idx, 1);
          else if (existing)
            reactions[idx] = {
              ...existing,
              total_count: existing.total_count - 1,
              is_chosen: false,
            };
        }
      } else {
        if (idx !== -1) {
          const existing = reactions[idx];
          if (existing)
            reactions[idx] = {
              ...existing,
              total_count: existing.total_count + 1,
              is_chosen: true,
            };
        } else {
          reactions.push({
            _: 'messageReaction',
            type: { _: 'reactionTypeEmoji', emoji },
            total_count: 1,
            is_chosen: true,
            recent_sender_ids: [],
          });
        }
      }
      return {
        ...m,
        interaction_info: {
          ...info,
          reactions: {
            _: 'messageReactions',
            reactions,
            are_tags: info.reactions?.are_tags ?? false,
            paid_reactors: info.reactions?.paid_reactors ?? [],
            can_get_added_reactions: info.reactions?.can_get_added_reactions ?? false,
          },
        },
      };
    });

    set((s) => ({ messagesByChat: { ...s.messagesByChat, [chatId]: updatedMessages } }));
    const originalMessages = messages;
    sendReaction(chatId, msgId, emoji, chosen).catch((err) => {
      set((s) => ({
        messagesByChat: { ...s.messagesByChat, [chatId]: originalMessages },
        error: err instanceof Error ? err.message : String(err),
      }));
    });
  },

  // === Real-time event handler ===

  handleUpdate: (event) => {
    const { selectedChatId } = get();

    switch (event.type) {
      case 'auth_state': {
        set({ authState: event.authorization_state });
        if (event.authorization_state._ === 'authorizationStateReady') {
          getMe()
            .then((me) => set({ myUserId: me.id }))
            .catch(() => {});
          get().loadDialogs();
        }
        break;
      }

      case 'user': {
        set((s) => {
          const next = new Map(s.users);
          next.set(event.user.id, event.user);
          const statusUpdate =
            event.user.status && !s.userStatuses[event.user.id]
              ? { userStatuses: { ...s.userStatuses, [event.user.id]: event.user.status } }
              : {};
          return { users: next, ...statusUpdate };
        });
        break;
      }

      case 'new_message': {
        const msg = event.message;
        const chatId = event.chat_id;
        set((s) => {
          const chatMsgs = s.messagesByChat[chatId];
          let newMessagesByChat = s.messagesByChat;
          if (chatMsgs) {
            const existingIdx = chatMsgs.findIndex((m) => m.id === msg.id);
            if (existingIdx !== -1) {
              const updated = [...chatMsgs];
              updated[existingIdx] = msg;
              newMessagesByChat = { ...s.messagesByChat, [chatId]: updated };
            } else if (s.isAtLatest[chatId] !== false) {
              newMessagesByChat = { ...s.messagesByChat, [chatId]: [...chatMsgs, msg] };
            }
          }
          let newPendingByChat = s.pendingByChat;
          const chatPending = s.pendingByChat[chatId];
          if (chatPending?.length && msg.is_outgoing) {
            const msgText = getMessageText(msg);
            const matchIdx = chatPending.findIndex((p) => p.text === msgText);
            if (matchIdx !== -1) {
              const filtered = [...chatPending];
              filtered.splice(matchIdx, 1);
              newPendingByChat = { ...s.pendingByChat, [chatId]: filtered };
            }
          }
          const updateChatList = (prev: Td.chat[]) => {
            const idx = prev.findIndex((c) => c.id === chatId);
            if (idx === -1) return prev;
            const chat = prev[idx];
            const pinned = isChatPinned(chat);
            const updated = {
              ...chat,
              last_message: msg,
              unread_count:
                !msg.is_outgoing && chatId !== selectedChatId
                  ? chat.unread_count + 1
                  : chat.unread_count,
            };
            const next = [...prev];
            next.splice(idx, 1);
            if (pinned) {
              next.splice(idx, 0, updated);
              return next;
            }
            const insertIdx = next.findIndex((c) => !isChatPinned(c));
            next.splice(insertIdx === -1 ? 0 : insertIdx, 0, updated);
            return next;
          };
          let newTypingByChat = s.typingByChat;
          const senderId = getSenderUserId(msg.sender_id);
          if (senderId && s.typingByChat[chatId]?.[senderId]) {
            timers.clear(`typing:${chatId}:${senderId}`);
            const { [senderId]: _, ...rest } = s.typingByChat[chatId];
            newTypingByChat = { ...s.typingByChat, [chatId]: rest };
          }
          return {
            messagesByChat: newMessagesByChat,
            pendingByChat: newPendingByChat,
            typingByChat: newTypingByChat,
            chats: updateChatList(s.chats),
            archivedChats: updateChatList(s.archivedChats),
          };
        });
        loadThumbnailForMessage(event.chat_id, event.message, set);
        fetchMissingUsers([event.message], get, set);
        loadForwardPhotos([event.message], get().loadProfilePhoto);
        break;
      }

      case 'edit_message': {
        const chatId = event.chat_id;
        set((s) => {
          const chatMsgs = s.messagesByChat[chatId];
          if (!chatMsgs) return s;
          return {
            messagesByChat: {
              ...s.messagesByChat,
              [chatId]: chatMsgs.map((m) => (m.id === event.message.id ? event.message : m)),
            },
          };
        });
        break;
      }

      case 'delete_messages': {
        const chatId = event.chat_id;
        const targetChats = chatId ? [chatId] : selectedChatId ? [selectedChatId] : [];
        if (targetChats.length === 0) break;
        set((s) => {
          const newMessagesByChat = { ...s.messagesByChat };
          for (const cid of targetChats) {
            const msgs = newMessagesByChat[cid];
            if (msgs)
              newMessagesByChat[cid] = msgs.filter((m) => !event.message_ids.includes(m.id));
          }
          return { messagesByChat: newMessagesByChat };
        });
        break;
      }

      case 'read_outbox': {
        const updateReadMax = (list: Td.chat[]) =>
          list.map((c) =>
            c.id === event.chat_id
              ? { ...c, last_read_outbox_message_id: event.last_read_outbox_message_id }
              : c,
          );
        set((s) => ({
          chats: updateReadMax(s.chats),
          archivedChats: updateReadMax(s.archivedChats),
        }));
        break;
      }

      case 'user_typing': {
        const chatId = event.chat_id;
        const userId = getSenderUserId(event.sender_id);
        if (!userId) break;
        const timerKey = `typing:${chatId}:${userId}`;
        if (event.action._ === 'chatActionCancel') {
          timers.clear(timerKey);
          set((s) => {
            const chatTyping = s.typingByChat[chatId];
            if (!chatTyping?.[userId]) return s;
            const { [userId]: _, ...rest } = chatTyping;
            return { typingByChat: { ...s.typingByChat, [chatId]: rest } };
          });
        } else {
          const expiresAt = Date.now() + 6000;
          timers.set(timerKey, 6000, () => {
            set((s) => {
              const chatTyping = s.typingByChat[chatId];
              if (!chatTyping?.[userId]) return s;
              const { [userId]: _, ...rest } = chatTyping;
              return { typingByChat: { ...s.typingByChat, [chatId]: rest } };
            });
          });
          set((s) => ({
            typingByChat: {
              ...s.typingByChat,
              [chatId]: {
                ...s.typingByChat[chatId],
                [userId]: { action: event.action, expiresAt },
              },
            },
          }));
        }
        break;
      }

      case 'user_status': {
        const { user_id: userId, status } = event;
        timers.clear(`status:${userId}`);
        if (status._ === 'userStatusOnline') {
          const msUntilExpiry = status.expires * 1000 - Date.now();
          if (msUntilExpiry > 0) {
            timers.set(`status:${userId}`, msUntilExpiry, () => {
              set((s) => ({
                userStatuses: {
                  ...s.userStatuses,
                  [userId]: { _: 'userStatusOffline' as const, was_online: status.expires },
                },
              }));
            });
          }
        }
        set((s) => ({ userStatuses: { ...s.userStatuses, [userId]: status } }));
        break;
      }

      case 'chat_online_member_count':
        set((s) => ({
          chatOnlineCounts: { ...s.chatOnlineCounts, [event.chat_id]: event.online_member_count },
        }));
        break;

      case 'message_reactions': {
        const chatId = event.chat_id;
        set((s) => {
          const chatMsgs = s.messagesByChat[chatId];
          if (!chatMsgs) return s;
          const idx = chatMsgs.findIndex((m) => m.id === event.message_id);
          if (idx === -1) return s;
          const updated = [...chatMsgs];
          updated[idx] = { ...updated[idx], interaction_info: event.interaction_info };
          return { messagesByChat: { ...s.messagesByChat, [chatId]: updated } };
        });
        break;
      }

      case 'message_send_succeeded': {
        const chatId = event.chat_id;
        set((s) => {
          const pending = s.pendingByChat[chatId] ?? [];
          const msgText = getMessageText(event.message);
          const pendingIdx = pending.findIndex((p) => p.text === msgText);
          const newPending =
            pendingIdx !== -1
              ? [...pending.slice(0, pendingIdx), ...pending.slice(pendingIdx + 1)]
              : pending;
          const chatMsgs = s.messagesByChat[chatId] ?? [];
          const oldIdx = chatMsgs.findIndex((m) => m.id === event.old_message_id);
          const newMsgs =
            oldIdx !== -1
              ? chatMsgs.map((m, i) => (i === oldIdx ? event.message : m))
              : [...chatMsgs, event.message];
          return {
            messagesByChat: { ...s.messagesByChat, [chatId]: newMsgs },
            pendingByChat: { ...s.pendingByChat, [chatId]: newPending },
          };
        });
        break;
      }

      case 'message_send_failed': {
        set((s) => {
          const pending = s.pendingByChat[event.chat_id];
          if (!pending) return s;
          return {
            pendingByChat: {
              ...s.pendingByChat,
              [event.chat_id]: pending.map((p) =>
                p.localId === String(event.old_message_id)
                  ? { ...p, _pending: 'failed' as const }
                  : p,
              ),
            },
          };
        });
        break;
      }

      case 'chat_read_inbox': {
        set((s) => {
          const update = (list: Td.chat[]) =>
            list.map((c) =>
              c.id === event.chat_id
                ? {
                    ...c,
                    last_read_inbox_message_id: event.last_read_inbox_message_id,
                    unread_count: event.unread_count,
                  }
                : c,
            );
          return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
        });
        break;
      }

      case 'new_chat': {
        set((s) => {
          const exists =
            s.chats.some((c) => c.id === event.chat.id) ||
            s.archivedChats.some((c) => c.id === event.chat.id);
          if (exists) return s;
          return { chats: [event.chat, ...s.chats] };
        });
        break;
      }

      case 'chat_last_message': {
        set((s) => {
          const update = (list: Td.chat[]) =>
            list.map((c) =>
              c.id === event.chat_id
                ? {
                    ...c,
                    last_message: event.last_message,
                    positions: event.positions.length > 0 ? event.positions : c.positions,
                  }
                : c,
            );
          return {
            chats: sortByOrder(update(s.chats)),
            archivedChats: sortByOrder(update(s.archivedChats)),
          };
        });
        if (event.last_message) loadThumbnailForMessage(event.chat_id, event.last_message, set);
        break;
      }

      case 'chat_position': {
        set((s) => {
          const update = (list: Td.chat[]) =>
            list.map((c) => {
              if (c.id !== event.chat_id) return c;
              const newPositions = c.positions.filter((p) => p.list._ !== event.position.list._);
              if (event.position.order !== '0') newPositions.push(event.position);
              return { ...c, positions: newPositions };
            });
          return {
            chats: sortByOrder(update(s.chats)),
            archivedChats: sortByOrder(update(s.archivedChats)),
          };
        });
        break;
      }

      case 'chat_title': {
        const update = (list: Td.chat[]) =>
          list.map((c) => (c.id === event.chat_id ? { ...c, title: event.title } : c));
        set((s) => ({ chats: update(s.chats), archivedChats: update(s.archivedChats) }));
        break;
      }

      case 'chat_photo': {
        const update = (list: Td.chat[]) =>
          list.map((c) => (c.id === event.chat_id ? { ...c, photo: event.photo } : c));
        set((s) => ({ chats: update(s.chats), archivedChats: update(s.archivedChats) }));
        break;
      }

      case 'chat_notification_settings': {
        const update = (list: Td.chat[]) =>
          list.map((c) =>
            c.id === event.chat_id
              ? { ...c, notification_settings: event.notification_settings }
              : c,
          );
        set((s) => ({ chats: update(s.chats), archivedChats: update(s.archivedChats) }));
        break;
      }

      case 'chat_draft_message': {
        set((s) => {
          const update = (list: Td.chat[]) =>
            list.map((c) =>
              c.id === event.chat_id
                ? {
                    ...c,
                    draft_message: event.draft_message,
                    positions: event.positions.length > 0 ? event.positions : c.positions,
                  }
                : c,
            );
          return {
            chats: sortByOrder(update(s.chats)),
            archivedChats: sortByOrder(update(s.archivedChats)),
          };
        });
        break;
      }

      case 'connection_state':
        set({ connectionState: event.state });
        break;

      case 'chat_is_marked_as_unread': {
        const update = (list: Td.chat[]) =>
          list.map((c) =>
            c.id === event.chat_id ? { ...c, is_marked_as_unread: event.is_marked_as_unread } : c,
          );
        set((s) => ({ chats: update(s.chats), archivedChats: update(s.archivedChats) }));
        break;
      }

      case 'chat_unread_mention_count': {
        const update = (list: Td.chat[]) =>
          list.map((c) =>
            c.id === event.chat_id ? { ...c, unread_mention_count: event.unread_mention_count } : c,
          );
        set((s) => ({ chats: update(s.chats), archivedChats: update(s.archivedChats) }));
        break;
      }

      case 'chat_unread_reaction_count': {
        const update = (list: Td.chat[]) =>
          list.map((c) =>
            c.id === event.chat_id
              ? { ...c, unread_reaction_count: event.unread_reaction_count }
              : c,
          );
        set((s) => ({ chats: update(s.chats), archivedChats: update(s.archivedChats) }));
        break;
      }

      case 'message_is_pinned': {
        set((s) => {
          const msgs = s.messagesByChat[event.chat_id];
          if (!msgs) return s;
          return {
            messagesByChat: {
              ...s.messagesByChat,
              [event.chat_id]: msgs.map((m) =>
                m.id === event.message_id ? { ...m, is_pinned: event.is_pinned } : m,
              ),
            },
          };
        });
        break;
      }
    }
  },

  // === Resource loading (single owner per resource type) ===

  loadProfilePhoto: (chatId: number) => {
    if (!requests.track('photo', chatId)) return;
    getProfilePhotoUrl(chatId).then((url) => {
      if (url) set((s) => ({ profilePhotos: { ...s.profilePhotos, [chatId]: url } }));
    });
  },

  loadMedia: (chatId: number, messageId: number) => {
    const key = `${chatId}_${messageId}`;
    if (!requests.track('media', key)) return;
    downloadMedia(chatId, messageId).then((url) => {
      set((s) => ({ mediaUrls: { ...s.mediaUrls, [key]: url } }));
    });
  },

  clearMediaUrl: (chatId: number, messageId: number) => {
    const key = `${chatId}_${messageId}`;
    requests.untrack('media', key);
    clearMediaCache(messageId);
    set((s) => {
      const { [key]: _, ...rest } = s.mediaUrls;
      return { mediaUrls: rest };
    });
  },

  loadFile: (fileId: number) => {
    if (!requests.track('file', fileId)) return;
    downloadFileById(fileId).then((url) => {
      set((s) => ({ fileUrls: { ...s.fileUrls, [fileId]: url } }));
    });
  },

  clearFileUrl: (fileId: number) => {
    requests.untrack('file', fileId);
    set((s) => {
      const { [fileId]: _, ...rest } = s.fileUrls;
      return { fileUrls: rest };
    });
  },

  loadCustomEmojiUrl: (documentId: string) => {
    if (!requests.track('customEmoji', documentId)) return;
    getCustomEmojiInfo(documentId).then((info) => {
      set((s) => ({ customEmojiUrls: { ...s.customEmojiUrls, [documentId]: info } }));
    });
  },

  recognizeSpeech: (chatId: number, messageId: number) => {
    tdRecognizeSpeech(chatId, messageId).catch(() => {});
  },

  loadReplyThumb: (chatId: number, messageId: number) => {
    const key = `${chatId}_${messageId}`;
    if (!requests.track('thumb', key)) return;
    downloadThumbnail(chatId, messageId).then((url) => {
      if (url) set((s) => ({ thumbUrls: { ...s.thumbUrls, [key]: url } }));
    });
  },

  resolveReplyPreview: (chatId: number, messageId: number) => {
    const key = `${chatId}_${messageId}`;
    if (!requests.track('replyPreview', key)) return;
    fetchMessage(chatId, messageId).then((msg) => {
      if (!msg) {
        set((s) => ({ replyPreviews: { ...s.replyPreviews, [key]: null } }));
        return;
      }
      const users = get().users;
      const preview = buildReplyPreview(msg, users, '');
      set((s) => ({ replyPreviews: { ...s.replyPreviews, [key]: preview } }));
    });
  },

  resolvePinnedPreview: (chatId: number, messageId: number) => {
    const key = `${chatId}_${messageId}`;
    if (!requests.track('pinnedPreview', key)) return;
    fetchMessage(chatId, messageId).then((msg) => {
      if (!msg) {
        set((s) => ({ pinnedPreviews: { ...s.pinnedPreviews, [key]: null } }));
        return;
      }
      const text = extractText(msg.content);
      let preview: string;
      if (text) {
        preview = `"${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`;
      } else {
        const label = extractMediaLabel(msg.content);
        preview = label ? (label === 'GIF' ? 'a GIF' : `a ${label.toLowerCase()}`) : 'a message';
      }
      set((s) => ({ pinnedPreviews: { ...s.pinnedPreviews, [key]: preview } }));
    });
  },

  clearError: () => set({ error: '' }),

  // === Search ===

  openGlobalSearch: () =>
    set({
      searchMode: 'global',
      searchQuery: '',
      searchResults: [],
      searchTotalCount: undefined,
      searchLoading: false,
      searchHasMore: false,
      searchNextCursor: undefined,
      contactResults: [],
      contactsLoading: false,
    }),

  closeGlobalSearch: () =>
    set({
      searchMode: 'none',
      searchQuery: '',
      searchResults: [],
      searchTotalCount: undefined,
      searchLoading: false,
      searchHasMore: false,
      searchNextCursor: undefined,
      contactResults: [],
      contactsLoading: false,
    }),

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  executeGlobalSearch: async (query: string) => {
    if (!query.trim()) {
      set({
        searchResults: [],
        searchTotalCount: undefined,
        searchHasMore: false,
        searchNextCursor: undefined,
        searchLoading: false,
      });
      return;
    }
    set({ searchLoading: true, searchQuery: query });
    try {
      const result = await searchGlobal(query);
      if (get().searchQuery !== query) return;
      set({
        searchResults: result.messages, // Store raw — selector derives UISearchResult[]
        searchTotalCount: result.totalCount,
        searchHasMore: result.hasMore,
        searchNextCursor: result.nextCursor,
        searchLoading: false,
      });
    } catch (err) {
      log.error('executeGlobalSearch failed:', err);
      if (get().searchQuery !== query) return;
      set({ searchLoading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  executeContactSearch: async (query: string) => {
    if (!query.trim()) {
      set({ contactResults: [], contactsLoading: false });
      return;
    }
    set({ contactsLoading: true });
    try {
      const result = await searchContacts(query, 20);
      if (get().searchQuery !== query) return;
      const seen = new Set<number>();
      const combined = [...result.myResults, ...result.globalResults].filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      set({ contactResults: combined, contactsLoading: false });
    } catch (err) {
      log.error('executeContactSearch failed:', err);
      if (get().searchQuery !== query) return;
      set({ contactResults: [], contactsLoading: false });
    }
  },

  loadMoreGlobalResults: async () => {
    const { searchNextCursor, searchQuery, searchLoading, searchHasMore } = get();
    if (searchLoading || !searchHasMore || !searchNextCursor) return;
    set({ searchLoading: true });
    try {
      const result = await searchGlobal(searchQuery, { offsetCursor: searchNextCursor });
      if (get().searchQuery !== searchQuery) return;
      set((s) => ({
        searchResults: [...s.searchResults, ...result.messages],
        searchTotalCount: result.totalCount ?? s.searchTotalCount,
        searchHasMore: result.hasMore,
        searchNextCursor: result.nextCursor,
        searchLoading: false,
      }));
    } catch (err) {
      log.error('loadMoreGlobalResults failed:', err);
      set({ searchLoading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  // === In-chat search ===

  openChatSearch: () =>
    set({
      searchMode: 'chat',
      chatSearchQuery: '',
      chatSearchResults: [],
      chatSearchTotalCount: 0,
      chatSearchCurrentIndex: 0,
      chatSearchLoading: false,
      chatSearchHasMore: false,
      chatSearchNextOffsetId: undefined,
    }),

  closeChatSearch: () =>
    set({
      searchMode: 'none',
      chatSearchQuery: '',
      chatSearchResults: [],
      chatSearchTotalCount: 0,
      chatSearchCurrentIndex: 0,
      chatSearchLoading: false,
      chatSearchHasMore: false,
      chatSearchNextOffsetId: undefined,
    }),

  setChatSearchQuery: (query: string) => set({ chatSearchQuery: query }),

  executeChatSearch: async (query: string) => {
    const { selectedChatId } = get();
    if (!selectedChatId || !query.trim()) {
      set({
        chatSearchResults: [],
        chatSearchTotalCount: 0,
        chatSearchCurrentIndex: 0,
        chatSearchHasMore: false,
        chatSearchNextOffsetId: undefined,
        chatSearchLoading: false,
      });
      return;
    }
    set({ chatSearchLoading: true, chatSearchQuery: query });
    try {
      const result = await searchInChat(selectedChatId, query);
      if (get().chatSearchQuery !== query) return;
      set({
        chatSearchResults: result.messages,
        chatSearchTotalCount: result.totalCount,
        chatSearchCurrentIndex: result.messages.length > 0 ? 0 : -1,
        chatSearchHasMore: result.hasMore,
        chatSearchNextOffsetId: result.nextOffsetId,
        chatSearchLoading: false,
      });
    } catch (err) {
      log.error('executeChatSearch failed:', err);
      if (get().chatSearchQuery !== query) return;
      set({ chatSearchLoading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  loadMoreChatResults: async () => {
    const {
      selectedChatId,
      chatSearchQuery,
      chatSearchLoading,
      chatSearchHasMore,
      chatSearchNextOffsetId,
    } = get();
    if (chatSearchLoading || !chatSearchHasMore || !chatSearchNextOffsetId || !selectedChatId)
      return;
    set({ chatSearchLoading: true });
    try {
      const result = await searchInChat(selectedChatId, chatSearchQuery, {
        offsetId: chatSearchNextOffsetId,
      });
      if (get().chatSearchQuery !== chatSearchQuery) return;
      set((s) => ({
        chatSearchResults: [...s.chatSearchResults, ...result.messages],
        chatSearchTotalCount: result.totalCount,
        chatSearchHasMore: result.hasMore,
        chatSearchNextOffsetId: result.nextOffsetId,
        chatSearchLoading: false,
      }));
    } catch (err) {
      log.error('loadMoreChatResults failed:', err);
      set({ chatSearchLoading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  chatSearchNext: () =>
    set((s) => {
      if (s.chatSearchResults.length === 0) return s;
      const next = s.chatSearchCurrentIndex + 1;
      if (next >= s.chatSearchResults.length) return s;
      return { chatSearchCurrentIndex: next };
    }),

  chatSearchPrev: () =>
    set((s) => {
      if (s.chatSearchResults.length === 0) return s;
      const prev = s.chatSearchCurrentIndex - 1;
      if (prev < 0) return s;
      return { chatSearchCurrentIndex: prev };
    }),

  // === Scroll-to-message navigation ===

  targetMessageId: null,

  goToNextUnreadMention: async () => {
    const { selectedChatId, messagesByChat } = get();
    if (!selectedChatId) return;
    try {
      const msg = await searchNextUnreadMention(selectedChatId);
      if (!msg) return;
      const existing = messagesByChat[selectedChatId] ?? [];
      if (!existing.some((m) => m.id === msg.id)) await get().loadMessagesAround(msg.id);
      set({ targetMessageId: msg.id });
      viewMessages(selectedChatId, [msg.id]).catch(() => {});
    } catch (err) {
      log.error('goToNextUnreadMention failed:', err);
    }
  },

  goToNextUnreadReaction: async () => {
    const { selectedChatId, messagesByChat } = get();
    if (!selectedChatId) return;
    try {
      const msg = await searchNextUnreadReaction(selectedChatId);
      if (!msg) return;
      const existing = messagesByChat[selectedChatId] ?? [];
      if (!existing.some((m) => m.id === msg.id)) await get().loadMessagesAround(msg.id);
      set({ targetMessageId: msg.id });
      viewMessages(selectedChatId, [msg.id]).catch(() => {});
    } catch (err) {
      log.error('goToNextUnreadReaction failed:', err);
    }
  },

  clearTargetMessage: () => set({ targetMessageId: null }),
}));

// ---------------------------------------------------------------------------
// Real-time subscription
// ---------------------------------------------------------------------------

onUpdate((event) => useChatStore.getState().handleUpdate(event));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _resetForTests(): void {
  tempIdCounter = 0;
  requests.resetAll();
  timers.resetAll();
  resetSelectors();
  useChatStore.setState(INITIAL_STATE as Partial<ChatState>, false);
}
