import { create } from 'zustand';
import type {
  PeerInfo,
  PendingMessage,
  Td,
  TelegramUpdateEvent,
  UIChat,
  UIMessageItem,
  UISearchResult,
  UIUser,
} from '@/lib/types';
import { toUIChat, toUIMessage, toUIPendingMessage, toUISearchResult, toUIUser } from '@/lib/types';
import { formatLastSeen } from './format';
import { log } from './log';
import {
  clearMediaCache,
  closeTdChat,
  downloadMedia,
  downloadThumbnail,
  getCustomEmojiUrl,
  getDialogs,
  getMe,
  getMessages,
  getMessageText,
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
  sendMessage,
  sendReaction,
  recognizeSpeech as tdRecognizeSpeech,
} from './telegram';

// --- Types ---

export type HeaderStatus =
  | { type: 'online' }
  | { type: 'typing'; text: string }
  | { type: 'last_seen'; text: string }
  | { type: 'label'; text: string }
  | null;

export type { PendingMessage };

interface ChatState {
  chats: Td.chat[];
  archivedChats: Td.chat[];
  selectedChatId: number | null;
  messagesByChat: Record<number, Td.message[]>;
  pendingByChat: Record<number, PendingMessage[]>;
  users: Map<number, Td.user>;
  profilePhotos: Record<number, string>;
  mediaUrls: Record<string, string | null>;
  thumbUrls: Record<string, string | null>;
  customEmojiUrls: Record<string, string | null>;
  typingByChat: Record<number, Record<number, { action: Td.ChatAction; expiresAt: number }>>;
  userStatuses: Record<number, Td.UserStatus>;
  myUserId: number;
  authState: Td.AuthorizationState | null;
  connectionState: Td.ConnectionState | null;
  loadingDialogs: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  hasMoreMessages: Record<number, boolean>;
  hasMoreChats: boolean;
  hasMoreArchivedChats: boolean;
  loadingMoreChats: boolean;
  loadingMoreArchivedChats: boolean;
  error: string;

  // Global search state
  searchQuery: string;
  searchMode: 'none' | 'global' | 'chat';
  searchResults: UISearchResult[];
  searchTotalCount: number | undefined;
  searchLoading: boolean;
  searchHasMore: boolean;
  searchNextCursor: string | undefined;

  // Contact search state
  contactResults: PeerInfo[];
  contactsLoading: boolean;

  // In-chat search state
  chatSearchQuery: string;
  chatSearchResults: Td.message[];
  chatSearchTotalCount: number;
  chatSearchCurrentIndex: number;
  chatSearchLoading: boolean;
  chatSearchHasMore: boolean;
  chatSearchNextOffsetId: number | undefined;

  // Actions
  loadDialogs: () => Promise<void>;
  loadMoreChats: (archived: boolean) => Promise<void>;
  openChat: (chat: Td.chat) => Promise<void>;
  openChatById: (chatId: number) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  send: (chatId: number, text: string) => void;
  react: (chatId: number, msgId: number, emoji: string, chosen: boolean) => void;
  handleUpdate: (event: TelegramUpdateEvent) => void;
  loadProfilePhoto: (chatId: number) => void;
  loadMedia: (chatId: number, messageId: number) => void;
  clearMediaUrl: (chatId: number, messageId: number) => void;
  seedMedia: (urls: Record<string, string>) => void;
  loadCustomEmojiUrl: (documentId: string) => void;
  recognizeSpeech: (chatId: number, messageId: number) => void;
  clearError: () => void;

  // Global search actions
  openGlobalSearch: () => void;
  closeGlobalSearch: () => void;
  setSearchQuery: (query: string) => void;
  executeGlobalSearch: (query: string) => Promise<void>;
  executeContactSearch: (query: string) => Promise<void>;
  loadMoreGlobalResults: () => Promise<void>;

  // In-chat search actions
  openChatSearch: () => void;
  closeChatSearch: () => void;
  setChatSearchQuery: (query: string) => void;
  executeChatSearch: (query: string) => Promise<void>;
  loadMoreChatResults: () => Promise<void>;
  chatSearchNext: () => void;
  chatSearchPrev: () => void;
}

// --- Helpers ---

function isChatPinned(chat: Td.chat): boolean {
  return chat.positions.some((p) => p.is_pinned);
}

let tempIdCounter = 0;
const photoRequested = new Set<number>();
const mediaRequested = new Set<string>();
const thumbRequested = new Set<string>();
const customEmojiRequested = new Set<string>();

/** Content types that may have a downloadable thumbnail. */
const THUMB_CONTENT_TYPES = new Set([
  'messagePhoto',
  'messageVideo',
  'messageAnimation',
  'messageVideoNote',
  'messageSticker',
]);

/** Load thumbnails for the first N chats that have media last messages. */
function loadThumbnailsForChats(
  chats: Td.chat[],
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
): void {
  for (const chat of chats.slice(0, 30)) {
    const msg = chat.last_message;
    if (!msg) continue;
    const contentType = msg.content._;
    const hasThumb =
      THUMB_CONTENT_TYPES.has(contentType) ||
      (contentType === 'messageText' && !!msg.content.link_preview);
    if (!hasThumb) continue;
    const key = `${chat.id}_${msg.id}`;
    if (thumbRequested.has(key)) continue;
    thumbRequested.add(key);
    downloadThumbnail(chat.id, msg.id).then((url) => {
      if (url) {
        set((s) => ({ thumbUrls: { ...s.thumbUrls, [key]: url } }));
      }
    });
  }
}
/** Download a thumbnail for a single message and write it into thumbUrls. */
function loadThumbnailForMessage(
  chatId: number,
  msg: Td.message,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
): void {
  const contentType = msg.content._;
  const hasThumb =
    THUMB_CONTENT_TYPES.has(contentType) ||
    (contentType === 'messageText' && !!(msg.content as Td.messageText).link_preview);
  if (!hasThumb) return;
  const key = `${chatId}_${msg.id}`;
  if (thumbRequested.has(key)) return;
  thumbRequested.add(key);
  downloadThumbnail(chatId, msg.id).then((url) => {
    if (url) {
      set((s) => ({ thumbUrls: { ...s.thumbUrls, [key]: url } }));
    }
  });
}

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const statusTimers = new Map<number, ReturnType<typeof setTimeout>>();
const userFetchRequested = new Set<number>();

/** Fetch any sender users not yet in the store's users Map. */
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
      if (!users.has(uid) && !userFetchRequested.has(uid)) {
        userFetchRequested.add(uid);
        missing.push(uid);
      }
    }
  }
  if (missing.length === 0) return;
  Promise.all(missing.map((uid) => getUser(uid).catch(() => null))).then((results) => {
    set((s) => {
      const next = new Map(s.users);
      for (const user of results) {
        if (user) next.set(user.id, user);
      }
      return { users: next };
    });
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  archivedChats: [],
  selectedChatId: null,
  messagesByChat: {},
  pendingByChat: {},
  users: new Map(),
  profilePhotos: {},
  mediaUrls: {},
  thumbUrls: {},
  customEmojiUrls: {},
  typingByChat: {},
  userStatuses: {},
  myUserId: 0,
  authState: null,
  connectionState: null,
  loadingDialogs: true,
  loadingMessages: false,
  loadingOlderMessages: false,
  hasMoreMessages: {},
  hasMoreChats: true,
  hasMoreArchivedChats: true,
  loadingMoreChats: false,
  loadingMoreArchivedChats: false,
  error: '',

  // Global search initial state
  searchQuery: '',
  searchMode: 'none',
  searchResults: [],
  searchTotalCount: undefined,
  searchLoading: false,
  searchHasMore: false,
  searchNextCursor: undefined,

  // Contact search initial state
  contactResults: [],
  contactsLoading: false,

  // In-chat search initial state
  chatSearchQuery: '',
  chatSearchResults: [],
  chatSearchTotalCount: 0,
  chatSearchCurrentIndex: 0,
  chatSearchLoading: false,
  chatSearchHasMore: false,
  chatSearchNextOffsetId: undefined,

  loadDialogs: async () => {
    // Fetch current user ID if not already known
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
      // Filter archived: exclude pinned chats from the archived list
      const filteredArchived = archived.filter((c) => !isChatPinned(c));
      set({
        chats: regular,
        archivedChats: filteredArchived,
        hasMoreChats: regular.length >= 100,
        hasMoreArchivedChats: filteredArchived.length >= 100,
      });
      loadThumbnailsForChats(regular, set);
      loadThumbnailsForChats(filteredArchived, set);
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
      const currentChats = get()[chatsKey];
      const result = await loadMoreDialogs({ archived, currentCount: currentChats.length });

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

  openChat: async (chat: Td.chat) => {
    const { messagesByChat, selectedChatId: previousChatId } = get();
    if (previousChatId) closeTdChat(previousChatId).catch(() => {});
    set({ selectedChatId: chat.id });
    openTdChat(chat.id).catch(() => {});

    // Clear unread count in chat list
    if (chat.unread_count > 0) {
      const clearUnread = (list: Td.chat[]) =>
        list.map((c) => (c.id === chat.id ? { ...c, unread_count: 0 } : c));
      set((s) => ({
        chats: clearUnread(s.chats),
        archivedChats: clearUnread(s.archivedChats),
      }));
    }

    // Return cached messages instantly
    if (messagesByChat[chat.id]) {
      markAsRead(chat.id);
      return;
    }

    // Fetch messages
    set({ loadingMessages: true, error: '' });
    try {
      const { messages: msgs, hasMore } = await getMessages(chat.id);
      const ordered = msgs.reverse();
      set((s) => ({
        messagesByChat: { ...s.messagesByChat, [chat.id]: ordered },
        hasMoreMessages: { ...s.hasMoreMessages, [chat.id]: hasMore },
      }));
      fetchMissingUsers(ordered, get, set);
      markAsRead(chat.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loadingMessages: false });
    }
  },

  loadOlderMessages: async () => {
    const { selectedChatId, messagesByChat, hasMoreMessages, loadingOlderMessages } = get();
    if (!selectedChatId || loadingOlderMessages) return;
    if (!hasMoreMessages[selectedChatId]) return;

    const existing = messagesByChat[selectedChatId] ?? [];
    if (existing.length === 0) return;

    const oldestId = existing[0].id;
    set({ loadingOlderMessages: true });
    try {
      const { messages: older, hasMore } = await getMessages(selectedChatId, {
        fromMessageId: oldestId,
      });
      if (older.length === 0) {
        set((s) => ({
          hasMoreMessages: { ...s.hasMoreMessages, [selectedChatId]: false },
          loadingOlderMessages: false,
        }));
        return;
      }
      set((s) => {
        const current = s.messagesByChat[selectedChatId] ?? [];
        const existingIds = new Set(current.map((m) => m.id));
        const deduped = older.filter((m) => !existingIds.has(m.id)).reverse();
        return {
          messagesByChat: {
            ...s.messagesByChat,
            [selectedChatId]: [...deduped, ...current],
          },
          hasMoreMessages: { ...s.hasMoreMessages, [selectedChatId]: hasMore },
          loadingOlderMessages: false,
        };
      });
      fetchMissingUsers(older, get, set);
    } catch {
      set({ loadingOlderMessages: false });
    }
  },

  openChatById: async (chatId: number) => {
    const { chats, archivedChats } = get();
    const existingChat =
      chats.find((c) => c.id === chatId) ?? archivedChats.find((c) => c.id === chatId);
    if (existingChat) {
      return get().openChat(existingChat);
    }

    // Chat not in local lists — open by ID directly
    const { selectedChatId: previousChatId, messagesByChat } = get();
    if (previousChatId) closeTdChat(previousChatId).catch(() => {});
    set({ selectedChatId: chatId });
    openTdChat(chatId).catch(() => {});

    // Return cached messages instantly
    if (messagesByChat[chatId]) {
      markAsRead(chatId);
      return;
    }

    // Fetch messages
    set({ loadingMessages: true, error: '' });
    try {
      const { messages: msgs, hasMore } = await getMessages(chatId);
      const ordered = msgs.reverse();
      set((s) => ({
        messagesByChat: { ...s.messagesByChat, [chatId]: ordered },
        hasMoreMessages: { ...s.hasMoreMessages, [chatId]: hasMore },
      }));
      fetchMissingUsers(ordered, get, set);
      markAsRead(chatId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loadingMessages: false });
    }
  },

  send: (chatId: number, text: string) => {
    const localId = `pending_${++tempIdCounter}`;
    const pending: PendingMessage = {
      chat_id: chatId,
      text,
      date: Math.floor(Date.now() / 1000),
      _pending: 'sending',
      localId,
    };

    // Insert optimistically + update chat preview
    const updatePreview = (list: Td.chat[]) =>
      list.map((c) => {
        if (c.id !== chatId) return c;
        // Create a minimal last_message to update the preview
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

    // Fire and forget
    sendMessage(chatId, text)
      .then((realMsg) => {
        set((s) => {
          const chatPending = s.pendingByChat[chatId] ?? [];
          const idx = chatPending.findIndex((p) => p.localId === localId);
          if (idx === -1) return s;

          const newPending = [...chatPending];
          newPending.splice(idx, 1);
          const chatMsgs = s.messagesByChat[chatId] ?? [];

          return {
            pendingByChat: { ...s.pendingByChat, [chatId]: newPending },
            messagesByChat: {
              ...s.messagesByChat,
              [chatId]: [...chatMsgs, realMsg],
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

    // Optimistic update
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
        // Remove reaction
        if (idx !== -1) {
          const existing = reactions[idx];
          if (existing && existing.total_count <= 1) {
            reactions.splice(idx, 1);
          } else if (existing) {
            reactions[idx] = {
              ...existing,
              total_count: existing.total_count - 1,
              is_chosen: false,
            };
          }
        }
      } else {
        // Add reaction
        if (idx !== -1) {
          const existing = reactions[idx];
          if (existing) {
            reactions[idx] = {
              ...existing,
              total_count: existing.total_count + 1,
              is_chosen: true,
            };
          }
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
      const newReactions: Td.messageReactions = {
        _: 'messageReactions',
        reactions,
        are_tags: info.reactions?.are_tags ?? false,
        paid_reactors: info.reactions?.paid_reactors ?? [],
        can_get_added_reactions: info.reactions?.can_get_added_reactions ?? false,
      };
      return {
        ...m,
        interaction_info: { ...info, reactions: newReactions },
      };
    });

    set((s) => ({
      messagesByChat: { ...s.messagesByChat, [chatId]: updatedMessages },
    }));

    const originalMessages = messages;
    sendReaction(chatId, msgId, emoji, chosen).catch((err) => {
      set((s) => ({
        messagesByChat: { ...s.messagesByChat, [chatId]: originalMessages },
        error: err instanceof Error ? err.message : String(err),
      }));
    });
  },

  handleUpdate: (event: TelegramUpdateEvent) => {
    const { selectedChatId } = get();

    if (event.type === 'auth_state') {
      set({ authState: event.authorization_state });
      if (event.authorization_state._ === 'authorizationStateReady') {
        getMe()
          .then((me) => set({ myUserId: me.id }))
          .catch(() => {});
        get().loadDialogs();
      }
    }

    if (event.type === 'user') {
      set((s) => {
        const next = new Map(s.users);
        next.set(event.user.id, event.user);
        return { users: next };
      });
    }

    if (event.type === 'new_message') {
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
          } else {
            newMessagesByChat = {
              ...s.messagesByChat,
              [chatId]: [...chatMsgs, msg],
            };
          }
        }

        // Clear matching pending message
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

        // Clear typing indicator for this sender
        let newTypingByChat = s.typingByChat;
        const senderId = getSenderUserId(msg.sender_id);
        if (senderId && s.typingByChat[chatId]?.[senderId]) {
          const timerKey = `${chatId}:${senderId}`;
          const timer = typingTimers.get(timerKey);
          if (timer) {
            clearTimeout(timer);
            typingTimers.delete(timerKey);
          }
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
    }

    if (event.type === 'edit_message') {
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
    }

    if (event.type === 'delete_messages') {
      const chatId = event.chat_id;
      const targetChats = chatId ? [chatId] : selectedChatId ? [selectedChatId] : [];
      log.info(
        `store delete: targets=${JSON.stringify(targetChats)} ids=${JSON.stringify(event.message_ids)}`,
      );
      if (targetChats.length === 0) return;
      set((s) => {
        const newMessagesByChat = { ...s.messagesByChat };
        for (const cid of targetChats) {
          const msgs = newMessagesByChat[cid];
          if (msgs) {
            newMessagesByChat[cid] = msgs.filter((m) => !event.message_ids.includes(m.id));
          }
        }
        return { messagesByChat: newMessagesByChat };
      });
    }

    if (event.type === 'read_outbox') {
      const chatId = event.chat_id;
      const maxId = event.last_read_outbox_message_id;
      const all = [...get().chats, ...get().archivedChats];
      const c = all.find((c) => c.id === chatId);
      log.info(
        `store read_outbox: chat=${chatId} maxId=${maxId} old=${c?.last_read_outbox_message_id}`,
      );
      const updateReadMax = (list: Td.chat[]) =>
        list.map((c) => (c.id === chatId ? { ...c, last_read_outbox_message_id: maxId } : c));
      set((s) => ({
        chats: updateReadMax(s.chats),
        archivedChats: updateReadMax(s.archivedChats),
      }));
    }

    if (event.type === 'user_typing') {
      const chatId = event.chat_id;
      const userId = getSenderUserId(event.sender_id);
      if (!userId) return;

      // Check if action is a cancel-type (chatActionCancel)
      const isCancel = event.action._ === 'chatActionCancel';

      if (isCancel) {
        const timerKey = `${chatId}:${userId}`;
        const timer = typingTimers.get(timerKey);
        if (timer) {
          clearTimeout(timer);
          typingTimers.delete(timerKey);
        }
        set((s) => {
          const chatTyping = s.typingByChat[chatId];
          if (!chatTyping?.[userId]) return s;
          const { [userId]: _, ...rest } = chatTyping;
          return { typingByChat: { ...s.typingByChat, [chatId]: rest } };
        });
      } else {
        const expiresAt = Date.now() + 6000;
        const timerKey = `${chatId}:${userId}`;
        const prev = typingTimers.get(timerKey);
        if (prev) clearTimeout(prev);
        const timer = setTimeout(() => {
          typingTimers.delete(timerKey);
          set((s) => {
            const chatTyping = s.typingByChat[chatId];
            if (!chatTyping?.[userId]) return s;
            const { [userId]: _, ...rest } = chatTyping;
            return { typingByChat: { ...s.typingByChat, [chatId]: rest } };
          });
        }, 6000);
        typingTimers.set(timerKey, timer);
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
    }

    if (event.type === 'user_status') {
      const { user_id: userId, status } = event;
      const prev = statusTimers.get(userId);
      if (prev) {
        clearTimeout(prev);
        statusTimers.delete(userId);
      }
      if (status._ === 'userStatusOnline') {
        const msUntilExpiry = status.expires * 1000 - Date.now();
        if (msUntilExpiry > 0) {
          const timer = setTimeout(() => {
            statusTimers.delete(userId);
            set((s) => ({
              userStatuses: {
                ...s.userStatuses,
                [userId]: {
                  _: 'userStatusOffline' as const,
                  was_online: status.expires,
                },
              },
            }));
          }, msUntilExpiry);
          statusTimers.set(userId, timer);
        }
      }
      set((s) => ({
        userStatuses: { ...s.userStatuses, [userId]: status },
      }));
    }

    if (event.type === 'message_reactions') {
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
    }

    if (event.type === 'message_send_succeeded') {
      const chatId = event.chat_id;
      set((s) => {
        // Remove matching pending message by text
        const pending = s.pendingByChat[chatId] ?? [];
        const msgText = getMessageText(event.message);
        const pendingIdx = pending.findIndex((p) => p.text === msgText);
        const newPending =
          pendingIdx !== -1
            ? [...pending.slice(0, pendingIdx), ...pending.slice(pendingIdx + 1)]
            : pending;

        // Replace the old message in messagesByChat if present
        const chatMsgs = s.messagesByChat[chatId] ?? [];
        const oldIdx = chatMsgs.findIndex((m) => m.id === event.old_message_id);
        let newMsgs = chatMsgs;
        if (oldIdx !== -1) {
          newMsgs = [...chatMsgs];
          newMsgs[oldIdx] = event.message;
        } else {
          newMsgs = [...chatMsgs, event.message];
        }
        return {
          messagesByChat: { ...s.messagesByChat, [chatId]: newMsgs },
          pendingByChat: { ...s.pendingByChat, [chatId]: newPending },
        };
      });
    }

    if (event.type === 'chat_read_inbox') {
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
    }

    if (event.type === 'new_chat') {
      set((s) => {
        const exists =
          s.chats.some((c) => c.id === event.chat.id) ||
          s.archivedChats.some((c) => c.id === event.chat.id);
        if (exists) return s;
        return { chats: [event.chat, ...s.chats] };
      });
    }

    if (event.type === 'chat_last_message') {
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
        return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
      });
      if (event.last_message) {
        loadThumbnailForMessage(event.chat_id, event.last_message, set);
      }
    }

    if (event.type === 'chat_position') {
      set((s) => {
        const update = (list: Td.chat[]) =>
          list.map((c) => {
            if (c.id !== event.chat_id) return c;
            const pos = event.position;
            const newPositions = c.positions.filter((p) => p.list._ !== pos.list._);
            // Only add position if order is non-zero (zero means removed from list)
            if (pos.order !== '0') newPositions.push(pos);
            return { ...c, positions: newPositions };
          });
        return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
      });
    }

    if (event.type === 'message_send_failed') {
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
    }

    if (event.type === 'chat_title') {
      set((s) => {
        const update = (list: Td.chat[]) =>
          list.map((c) => (c.id === event.chat_id ? { ...c, title: event.title } : c));
        return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
      });
    }

    if (event.type === 'chat_photo') {
      set((s) => {
        const update = (list: Td.chat[]) =>
          list.map((c) => (c.id === event.chat_id ? { ...c, photo: event.photo } : c));
        return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
      });
    }

    if (event.type === 'chat_notification_settings') {
      set((s) => {
        const update = (list: Td.chat[]) =>
          list.map((c) =>
            c.id === event.chat_id
              ? { ...c, notification_settings: event.notification_settings }
              : c,
          );
        return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
      });
    }

    if (event.type === 'chat_draft_message') {
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
        return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
      });
    }

    if (event.type === 'connection_state') {
      set({ connectionState: event.state });
    }

    if (event.type === 'chat_is_marked_as_unread') {
      set((s) => {
        const update = (list: Td.chat[]) =>
          list.map((c) =>
            c.id === event.chat_id ? { ...c, is_marked_as_unread: event.is_marked_as_unread } : c,
          );
        return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
      });
    }

    if (event.type === 'chat_unread_mention_count') {
      set((s) => {
        const update = (list: Td.chat[]) =>
          list.map((c) =>
            c.id === event.chat_id ? { ...c, unread_mention_count: event.unread_mention_count } : c,
          );
        return { chats: update(s.chats), archivedChats: update(s.archivedChats) };
      });
    }

    if (event.type === 'message_is_pinned') {
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
    }
  },

  loadProfilePhoto: (chatId: number) => {
    if (photoRequested.has(chatId)) return;
    photoRequested.add(chatId);
    getProfilePhotoUrl(chatId).then((url) => {
      if (url) {
        set((s) => ({ profilePhotos: { ...s.profilePhotos, [chatId]: url } }));
      }
    });
  },

  loadMedia: (chatId: number, messageId: number) => {
    const key = `${chatId}_${messageId}`;
    if (mediaRequested.has(key)) return;
    mediaRequested.add(key);
    downloadMedia(chatId, messageId).then((url) => {
      set((s) => ({ mediaUrls: { ...s.mediaUrls, [key]: url } }));
    });
  },

  loadCustomEmojiUrl: (documentId: string) => {
    if (customEmojiRequested.has(documentId)) return;
    customEmojiRequested.add(documentId);
    getCustomEmojiUrl(documentId).then((url) => {
      set((s) => ({ customEmojiUrls: { ...s.customEmojiUrls, [documentId]: url } }));
    });
  },

  recognizeSpeech: (chatId: number, messageId: number) => {
    tdRecognizeSpeech(chatId, messageId).catch(() => {});
  },

  clearMediaUrl: (chatId: number, messageId: number) => {
    const key = `${chatId}_${messageId}`;
    mediaRequested.delete(key);
    clearMediaCache(messageId);
    set((s) => {
      const { [key]: _, ...rest } = s.mediaUrls;
      return { mediaUrls: rest };
    });
  },

  seedMedia: (urls: Record<string, string>) => {
    set((s) => ({ mediaUrls: { ...s.mediaUrls, ...urls } }));
  },

  clearError: () => set({ error: '' }),

  // --- Global search actions ---

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
      // Guard: if query changed while we were loading, discard
      if (get().searchQuery !== query) return;
      const { profilePhotos } = get();
      set({
        searchResults: result.messages.map((m) =>
          toUISearchResult(m, profilePhotos[m.chat_id] ?? null),
        ),
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
      // Guard: if query changed while we were loading, discard
      if (get().searchQuery !== query) return;
      // Combine myResults and globalResults, dedup by id
      const seen = new Set<number>();
      const combined: PeerInfo[] = [];
      for (const p of [...result.myResults, ...result.globalResults]) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          combined.push(p);
        }
      }
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
      const { profilePhotos } = get();
      set((s) => ({
        searchResults: [
          ...s.searchResults,
          ...result.messages.map((m) => toUISearchResult(m, profilePhotos[m.chat_id] ?? null)),
        ],
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

  // --- In-chat search actions ---

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
      set({
        chatSearchLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
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
      set({
        chatSearchLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  chatSearchNext: () => {
    set((s) => {
      if (s.chatSearchResults.length === 0) return s;
      const next = s.chatSearchCurrentIndex + 1;
      if (next >= s.chatSearchResults.length) return s;
      return { chatSearchCurrentIndex: next };
    });
  },

  chatSearchPrev: () => {
    set((s) => {
      if (s.chatSearchResults.length === 0) return s;
      const prev = s.chatSearchCurrentIndex - 1;
      if (prev < 0) return s;
      return { chatSearchCurrentIndex: prev };
    });
  },
}));

// --- Selectors (memoized to return stable references) ---

const EMPTY_UI_MESSAGES: UIMessageItem[] = [];
let _prevMsgReal: Td.message[] | undefined;
let _prevMsgPending: PendingMessage[] | undefined;
let _prevMsgUsers: Map<number, Td.user> | undefined;
let _prevMsgLastReadOutboxId: number | undefined;
let _prevMsgResult: UIMessageItem[] = EMPTY_UI_MESSAGES;

export function selectChatMessages(state: ChatState): UIMessageItem[] {
  const { selectedChatId, messagesByChat, pendingByChat, users, chats, archivedChats } = state;
  if (!selectedChatId) return EMPTY_UI_MESSAGES;

  const rawChat =
    chats.find((c) => c.id === selectedChatId) ??
    archivedChats.find((c) => c.id === selectedChatId) ??
    null;
  const lastReadOutboxId = rawChat?.last_read_outbox_message_id ?? 0;

  const real = messagesByChat[selectedChatId];
  const pending = pendingByChat[selectedChatId];

  if (
    real === _prevMsgReal &&
    pending === _prevMsgPending &&
    users === _prevMsgUsers &&
    lastReadOutboxId === _prevMsgLastReadOutboxId
  ) {
    return _prevMsgResult;
  }

  _prevMsgReal = real;
  _prevMsgPending = pending;
  _prevMsgUsers = users;
  _prevMsgLastReadOutboxId = lastReadOutboxId;

  const uiMessages: UIMessageItem[] = real
    ? real.map((msg) => toUIMessage(msg, users, lastReadOutboxId))
    : [];
  if (pending && pending.length > 0) {
    for (const p of pending) {
      uiMessages.push(toUIPendingMessage(p));
    }
  }

  _prevMsgResult = uiMessages.length > 0 ? uiMessages : EMPTY_UI_MESSAGES;
  return _prevMsgResult;
}

let _prevSelRawChat: Td.chat | null = null;
let _prevSelPhoto: string | undefined;
let _prevSelUser: Td.user | undefined;
let _prevSelStatus: Td.UserStatus | undefined;
let _prevSelUIChat: UIChat | null = null;

export function selectSelectedChat(state: ChatState): UIChat | null {
  const { selectedChatId, chats, archivedChats, profilePhotos, users, userStatuses } = state;
  if (!selectedChatId) return null;
  const rawChat =
    chats.find((c) => c.id === selectedChatId) ??
    archivedChats.find((c) => c.id === selectedChatId) ??
    null;
  if (!rawChat) return null;
  const photo = profilePhotos[rawChat.id];
  const userId = rawChat.type._ === 'chatTypePrivate' ? rawChat.type.user_id : 0;
  const user = userId ? users.get(userId) : undefined;
  const status = userId ? userStatuses[userId] : undefined;
  if (
    rawChat === _prevSelRawChat &&
    photo === _prevSelPhoto &&
    user === _prevSelUser &&
    status === _prevSelStatus
  ) {
    return _prevSelUIChat;
  }
  _prevSelRawChat = rawChat;
  _prevSelPhoto = photo;
  _prevSelUser = user;
  _prevSelStatus = status;
  _prevSelUIChat = toUIChat(rawChat, {
    photoUrl: photo ?? null,
    user,
    isOnline: status?._ === 'userStatusOnline',
    myUserId: state.myUserId,
  });
  return _prevSelUIChat;
}

/** @deprecated alias for backward compat during migration */
export const selectSelectedDialog = selectSelectedChat;

let _prevHeaderChatId: number | null = null;
let _prevHeaderRawChat: Td.chat | null = null;
let _prevHeaderTyping: Record<number, { action: Td.ChatAction; expiresAt: number }> | undefined;
let _prevHeaderUserStatus: Td.UserStatus | undefined;
let _prevHeaderResult: HeaderStatus = null;

function computeHeaderStatus(state: ChatState): HeaderStatus {
  const { selectedChatId, chats, archivedChats } = state;
  if (!selectedChatId) return null;
  const chat =
    chats.find((c) => c.id === selectedChatId) ??
    archivedChats.find((c) => c.id === selectedChatId) ??
    null;
  if (!chat) return null;
  const chatId = chat.id;
  const isPrivate = chat.type._ === 'chatTypePrivate';
  const isGroup =
    chat.type._ === 'chatTypeBasicGroup' ||
    (chat.type._ === 'chatTypeSupergroup' && !chat.type.is_channel);
  const isChannel = chat.type._ === 'chatTypeSupergroup' && chat.type.is_channel;

  const chatTyping = state.typingByChat[chatId];
  if (chatTyping && Object.keys(chatTyping).length > 0) {
    if (isPrivate) {
      return { type: 'typing', text: 'typing' };
    }
    const typerIds = Object.keys(chatTyping);
    const names = typerIds.map((uid) => {
      const user = state.users.get(Number(uid));
      return user?.first_name ?? 'Someone';
    });
    const text = names.length === 1 ? `${names[0]} is typing` : `${names.join(', ')} are typing`;
    return { type: 'typing', text };
  }
  if (isPrivate) {
    const status = state.userStatuses[chatId];
    if (status?._ === 'userStatusOnline') return { type: 'online' };
    if (status?._ === 'userStatusOffline' && status.was_online) {
      return { type: 'last_seen', text: formatLastSeen(status.was_online) };
    }
    if (status?._ === 'userStatusRecently')
      return { type: 'last_seen', text: 'last seen recently' };
    if (status?._ === 'userStatusLastWeek')
      return { type: 'last_seen', text: 'last seen within a week' };
    if (status?._ === 'userStatusLastMonth')
      return { type: 'last_seen', text: 'last seen within a month' };
    return null;
  }
  if (isChannel) return { type: 'label', text: 'Channel' };
  if (isGroup) return { type: 'label', text: 'Group' };
  return null;
}

export function selectHeaderStatus(state: ChatState): HeaderStatus {
  const { selectedChatId, chats, archivedChats } = state;
  const rawChat = selectedChatId
    ? (chats.find((c) => c.id === selectedChatId) ??
      archivedChats.find((c) => c.id === selectedChatId) ??
      null)
    : null;
  const chatId = rawChat?.id ?? null;
  const chatTyping = chatId ? state.typingByChat[chatId] : undefined;
  const userStatus = chatId ? state.userStatuses[chatId] : undefined;

  if (
    chatId === _prevHeaderChatId &&
    rawChat === _prevHeaderRawChat &&
    chatTyping === _prevHeaderTyping &&
    userStatus === _prevHeaderUserStatus
  ) {
    return _prevHeaderResult;
  }
  _prevHeaderChatId = chatId;
  _prevHeaderRawChat = rawChat;
  _prevHeaderTyping = chatTyping;
  _prevHeaderUserStatus = userStatus;
  _prevHeaderResult = computeHeaderStatus(state);
  return _prevHeaderResult;
}

// --- UI list selectors (memoized) ---

let _prevUIChatsRaw: Td.chat[] = [];
let _prevUIChatsPhotos: Record<number, string> = {};
let _prevUIChatsUsers: Map<number, Td.user> = new Map();
let _prevUIChatsStatuses: Record<number, Td.UserStatus> = {};
let _prevUIChatsMyUserId = 0;
let _prevUIChatsResult: UIChat[] = [];

function chatContext(
  c: Td.chat,
  state: ChatState,
): { photoUrl: string | null; user: Td.user | undefined; isOnline: boolean; myUserId: number } {
  const userId = c.type._ === 'chatTypePrivate' ? c.type.user_id : 0;
  return {
    photoUrl: state.profilePhotos[c.id] ?? null,
    user: userId ? state.users.get(userId) : undefined,
    isOnline: userId ? state.userStatuses[userId]?._ === 'userStatusOnline' : false,
    myUserId: state.myUserId,
  };
}

export function selectUIChats(state: ChatState): UIChat[] {
  const { chats, profilePhotos, users, userStatuses, myUserId } = state;
  if (
    chats === _prevUIChatsRaw &&
    profilePhotos === _prevUIChatsPhotos &&
    users === _prevUIChatsUsers &&
    userStatuses === _prevUIChatsStatuses &&
    myUserId === _prevUIChatsMyUserId
  ) {
    return _prevUIChatsResult;
  }
  _prevUIChatsRaw = chats;
  _prevUIChatsPhotos = profilePhotos;
  _prevUIChatsUsers = users;
  _prevUIChatsStatuses = userStatuses;
  _prevUIChatsMyUserId = myUserId;
  _prevUIChatsResult = chats.map((c) => toUIChat(c, chatContext(c, state)));
  return _prevUIChatsResult;
}

let _prevUIArchivedRaw: Td.chat[] = [];
let _prevUIArchivedPhotos: Record<number, string> = {};
let _prevUIArchivedUsers: Map<number, Td.user> = new Map();
let _prevUIArchivedStatuses: Record<number, Td.UserStatus> = {};
let _prevUIArchivedMyUserId = 0;
let _prevUIArchivedResult: UIChat[] = [];

export function selectUIArchivedChats(state: ChatState): UIChat[] {
  const { archivedChats, profilePhotos, users, userStatuses, myUserId } = state;
  if (
    archivedChats === _prevUIArchivedRaw &&
    profilePhotos === _prevUIArchivedPhotos &&
    users === _prevUIArchivedUsers &&
    userStatuses === _prevUIArchivedStatuses &&
    myUserId === _prevUIArchivedMyUserId
  ) {
    return _prevUIArchivedResult;
  }
  _prevUIArchivedRaw = archivedChats;
  _prevUIArchivedPhotos = profilePhotos;
  _prevUIArchivedUsers = users;
  _prevUIArchivedStatuses = userStatuses;
  _prevUIArchivedMyUserId = myUserId;
  _prevUIArchivedResult = archivedChats.map((c) => toUIChat(c, chatContext(c, state)));
  return _prevUIArchivedResult;
}

let _prevUIUserRaw: Td.user | undefined;
let _prevUIUserResult: UIUser | null = null;

export function selectUIUser(state: ChatState, userId: number): UIUser | null {
  const user = state.users.get(userId);
  if (!user) return null;
  if (user === _prevUIUserRaw) return _prevUIUserResult;
  _prevUIUserRaw = user;
  _prevUIUserResult = toUIUser(user);
  return _prevUIUserResult;
}

// --- Test helpers ---

export function _resetForTests() {
  tempIdCounter = 0;
  photoRequested.clear();
  mediaRequested.clear();
  customEmojiRequested.clear();
  userFetchRequested.clear();
  for (const t of typingTimers.values()) clearTimeout(t);
  typingTimers.clear();
  for (const t of statusTimers.values()) clearTimeout(t);
  statusTimers.clear();
  _prevMsgReal = undefined;
  _prevMsgPending = undefined;
  _prevMsgUsers = undefined;
  _prevMsgLastReadOutboxId = undefined;
  _prevMsgResult = EMPTY_UI_MESSAGES;
  _prevSelRawChat = null;
  _prevSelPhoto = undefined;
  _prevSelUIChat = null;
  _prevHeaderChatId = null;
  _prevHeaderRawChat = null;
  _prevHeaderTyping = undefined;
  _prevHeaderUserStatus = undefined;
  _prevHeaderResult = null;
  _prevUIChatsRaw = [];
  _prevUIChatsPhotos = {};
  _prevUIChatsResult = [];
  _prevUIArchivedRaw = [];
  _prevUIArchivedPhotos = {};
  _prevUIArchivedResult = [];
  useChatStore.setState(
    {
      chats: [],
      archivedChats: [],
      selectedChatId: null,
      messagesByChat: {},
      pendingByChat: {},
      users: new Map(),
      profilePhotos: {},
      mediaUrls: {},
      thumbUrls: {},
      typingByChat: {},
      userStatuses: {},
      authState: null,
      loadingDialogs: true,
      loadingMessages: false,
      loadingOlderMessages: false,
      hasMoreMessages: {},
      error: '',
      searchQuery: '',
      searchMode: 'none',
      searchResults: [],
      searchTotalCount: undefined,
      searchLoading: false,
      searchHasMore: false,
      searchNextCursor: undefined,
      contactResults: [],
      contactsLoading: false,
      chatSearchQuery: '',
      chatSearchResults: [],
      chatSearchTotalCount: 0,
      chatSearchCurrentIndex: 0,
      chatSearchLoading: false,
      chatSearchHasMore: false,
      chatSearchNextOffsetId: undefined,
    },
    false,
  );
}

// --- Real-time subscription (runs once on import) ---

onUpdate((event) => useChatStore.getState().handleUpdate(event));
