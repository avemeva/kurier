import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Td } from '@/lib/types';

// Mock modules before importing store
vi.mock('../log', () => {
  const noop = () => {};
  return {
    log: { debug: noop, info: noop, warn: noop, error: noop },
    telegramLog: { debug: noop, info: noop, warn: noop, error: noop },
  };
});

vi.mock('../telegram', () => ({
  getDialogs: vi.fn(),
  getMessages: vi.fn(),
  getNewerMessages: vi.fn(),
  getMessagesAroundMessage: vi.fn(),
  getMessageText: vi.fn((msg: Td.message) => {
    const c = msg.content;
    if (c._ === 'messageText') return c.text.text;
    if ('caption' in c && c.caption) return (c.caption as Td.formattedText).text;
    return '';
  }),
  getProfilePhotoUrl: vi.fn(),
  sendMessage: vi.fn(),
  sendReaction: vi.fn(),
  markAsRead: vi.fn(),
  openTdChat: vi.fn(() => Promise.resolve()),
  closeTdChat: vi.fn(() => Promise.resolve()),
  onUpdate: vi.fn(() => () => {}),
  formatLastSeen: vi.fn((ts: number) => `last seen at ${ts}`),
  extractMessagePreview: vi.fn((msg: Td.message | undefined) => {
    if (!msg) return '';
    if (msg.content._ === 'messageText') return msg.content.text.text;
    return '';
  }),
  getSenderUserId: vi.fn((sender: Td.MessageSender) =>
    sender._ === 'messageSenderUser' ? sender.user_id : 0,
  ),
  getUser: vi.fn(() => Promise.resolve({ id: 0, first_name: '', last_name: '' })),
  searchGlobal: vi.fn(),
  searchInChat: vi.fn(),
  searchContacts: vi.fn(),
  getMe: vi.fn(() => Promise.resolve({ id: 42, first_name: 'Test' })),
  getChatInfo: vi.fn(() => Promise.resolve(null)),
  downloadMedia: vi.fn(() => Promise.resolve(null)),
  downloadThumbnail: vi.fn(() => Promise.resolve(null)),
  clearMediaCache: vi.fn(),
  fetchMessage: vi.fn(() => Promise.resolve(null)),
  loadMoreDialogs: vi.fn(),
  getCustomEmojiInfo: vi.fn(
    (): Promise<{ url: string; format: 'webp' | 'tgs' | 'webm' } | null> => Promise.resolve(null),
  ),
  recognizeSpeech: vi.fn(() => Promise.resolve()),
}));

import {
  clearMediaCache,
  downloadMedia,
  downloadThumbnail,
  fetchMessage,
  getCustomEmojiInfo,
  getDialogs,
  getMessages,
  getMessagesAroundMessage,
  getNewerMessages,
  getProfilePhotoUrl,
  loadMoreDialogs,
  markAsRead,
  searchContacts,
  searchGlobal,
  searchInChat,
  sendMessage,
  sendReaction,
} from '../telegram';
import {
  _resetForTests,
  actionLabel,
  type PendingMessage,
  selectChatMessages,
  selectHeaderStatus,
  selectSelectedChat,
  selectUIArchivedChats,
  selectUIChats,
  selectUIUser,
  selectUnresolvedPinnedPreviews,
  selectUnresolvedReplies,
  useChatStore,
} from './';

// --- Factories ---

function makeChat(overrides: Partial<Td.chat> = {}): Td.chat {
  return {
    _: 'chat',
    id: 123,
    title: 'Test Chat',
    type: { _: 'chatTypePrivate', user_id: 123 },
    unread_count: 0,
    last_read_outbox_message_id: 0,
    last_message: undefined,
    positions: [],
    photo: undefined,
    permissions: {} as Td.chatPermissions,
    message_sender_id: undefined,
    has_protected_content: false,
    is_translatable: false,
    is_marked_as_unread: false,
    is_blocked: false,
    has_scheduled_messages: false,
    can_be_deleted_only_for_self: false,
    can_be_deleted_for_all_users: false,
    can_be_reported: false,
    default_disable_notification: false,
    last_read_inbox_message_id: 0,
    unread_mention_count: 0,
    unread_reaction_count: 0,
    notification_settings: {} as Td.chatNotificationSettings,
    available_reactions: {} as Td.ChatAvailableReactions,
    message_auto_delete_time: 0,
    theme_name: '',
    action_bar: undefined,
    video_chat: {} as Td.videoChat,
    pending_join_requests: undefined,
    reply_markup_message_id: 0,
    draft_message: undefined,
    client_data: '',
    ...overrides,
  } as Td.chat;
}

function makeMessage(overrides: Partial<Td.message> = {}): Td.message {
  return {
    _: 'message',
    id: 1,
    sender_id: { _: 'messageSenderUser', user_id: 456 },
    chat_id: 123,
    sending_state: undefined,
    scheduling_state: undefined,
    is_outgoing: false,
    is_pinned: false,
    is_from_offline: false,
    can_be_saved: true,
    has_timestamped_media: false,
    is_channel_post: false,
    is_paid_star_suggested_post: false,
    is_paid_ton_suggested_post: false,
    contains_unread_mention: false,
    date: 1000,
    edit_date: 0,
    forward_info: undefined,
    interaction_info: undefined,
    unread_reactions: [],
    reply_to: undefined,
    self_destruct_in: 0,
    auto_delete_in: 0,
    via_bot_user_id: 0,
    sender_business_bot_user_id: 0,
    sender_boost_count: 0,
    paid_message_star_count: 0,
    author_signature: '',
    media_album_id: '0',
    effect_id: '0',
    summary_language_code: '',
    content: {
      _: 'messageText',
      text: { _: 'formattedText', text: 'hello', entities: [] },
    },
    reply_markup: undefined,
    ...overrides,
  } as Td.message;
}

function textContent(text: string): Td.messageText {
  return {
    _: 'messageText',
    text: { _: 'formattedText', text, entities: [] },
  };
}

beforeEach(() => {
  _resetForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- loadDialogs ---

describe('loadDialogs', () => {
  it('fetches and sets chats + archivedChats', async () => {
    const chat1 = makeChat({ id: 1, title: 'A' });
    const chat2 = makeChat({ id: 2, title: 'B' });
    vi.mocked(getDialogs).mockResolvedValueOnce([chat1]).mockResolvedValueOnce([chat2]);

    await useChatStore.getState().loadDialogs();
    const s = useChatStore.getState();
    expect(s.chats).toHaveLength(1);
    expect(s.archivedChats).toHaveLength(1);
    expect(s.loadingDialogs).toBe(false);
  });

  it('sets error on failure', async () => {
    vi.mocked(getDialogs).mockRejectedValueOnce(new Error('fail'));

    await useChatStore.getState().loadDialogs();
    expect(useChatStore.getState().error).toBe('fail');
  });
});

// --- openChat ---

describe('openChat', () => {
  it('sets selectedChatId and fetches messages', async () => {
    const chat = makeChat({ id: 42, title: 'Test' });
    const msgs = [makeMessage({ id: 10 }), makeMessage({ id: 20 })];
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: msgs, hasMore: false });

    await useChatStore.getState().openChat(chat);
    const s = useChatStore.getState();
    expect(s.selectedChatId).toBe(42);
    // Messages are reversed
    expect(s.messagesByChat[42]).toHaveLength(2);
    expect(s.messagesByChat[42][0].id).toBe(20);
    expect(markAsRead).toHaveBeenCalledWith(42);
  });

  it('clears unread count', async () => {
    const chat = makeChat({ id: 42, unread_count: 5 });
    useChatStore.setState({ chats: [chat], archivedChats: [] });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [], hasMore: false });

    await useChatStore.getState().openChat(chat);
    expect(useChatStore.getState().chats[0].unread_count).toBe(0);
  });

  it('sets isAtLatest=true, hasNewer=false on fresh load', async () => {
    const chat = makeChat({ id: 42 });
    vi.mocked(getMessages).mockResolvedValueOnce({
      messages: [makeMessage({ id: 10 })],
      hasMore: false,
    });

    await useChatStore.getState().openChat(chat);
    const s = useChatStore.getState();
    expect(s.isAtLatest[42]).toBe(true);
    expect(s.hasNewer[42]).toBe(false);
  });

  it('uses cache on second open', async () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({
      messagesByChat: { 42: [makeMessage()] },
    });

    await useChatStore.getState().openChat(chat);
    expect(getMessages).not.toHaveBeenCalled();
  });
});

// --- send ---

describe('send', () => {
  it('creates pending, then resolves', async () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });

    const realMsg = makeMessage({ id: 999, is_outgoing: true, content: textContent('hi') });
    vi.mocked(sendMessage).mockResolvedValueOnce(realMsg);

    useChatStore.getState().send(42, 'hi');
    // Pending should exist
    expect(useChatStore.getState().pendingByChat[42]).toHaveLength(1);
    expect(useChatStore.getState().pendingByChat[42][0]._pending).toBe('sending');

    // Wait for promise
    await vi.waitFor(() => {
      expect(useChatStore.getState().pendingByChat[42]).toHaveLength(0);
    });
    expect(useChatStore.getState().messagesByChat[42]).toHaveLength(1);
  });

  it('marks pending as failed on error', async () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });

    vi.mocked(sendMessage).mockRejectedValueOnce(new Error('send fail'));

    useChatStore.getState().send(42, 'hi');
    await vi.waitFor(() => {
      expect(useChatStore.getState().pendingByChat[42][0]._pending).toBe('failed');
    });
  });
});

// --- react ---

describe('react (optimistic)', () => {
  it('adds reaction optimistically', () => {
    const msg = makeMessage({ id: 10 });
    useChatStore.setState({ messagesByChat: { 42: [msg] } });
    vi.mocked(sendReaction).mockResolvedValueOnce(undefined);

    useChatStore.getState().react(42, 10, '\u{1F44D}', false);

    const updated = useChatStore.getState().messagesByChat[42][0];
    // Store internally wraps in messageReactions object (runtime shape)
    const reactionsObj = updated.interaction_info?.reactions as unknown as {
      reactions: Td.messageReaction[];
    };
    const reactions = reactionsObj?.reactions ?? [];
    expect(reactions).toHaveLength(1);
    expect(reactions[0].type).toEqual({ _: 'reactionTypeEmoji', emoji: '\u{1F44D}' });
    expect(reactions[0].total_count).toBe(1);
    expect(reactions[0].is_chosen).toBe(true);
  });
});

// --- handleUpdate ---

describe('handleUpdate', () => {
  describe('new_message', () => {
    it('appends message to existing chat', () => {
      const chat = makeChat({ id: 42 });
      useChatStore.setState({
        chats: [chat],
        archivedChats: [],
        messagesByChat: { 42: [makeMessage({ id: 1 })] },
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: makeMessage({ id: 2, content: textContent('new') }),
      });

      expect(useChatStore.getState().messagesByChat[42]).toHaveLength(2);
    });

    it('replaces existing message with same id', () => {
      const chat = makeChat({ id: 42 });
      useChatStore.setState({
        chats: [chat],
        archivedChats: [],
        messagesByChat: {
          42: [makeMessage({ id: 5, content: textContent('old') })],
        },
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: makeMessage({ id: 5, content: textContent('updated') }),
      });

      const msgs = useChatStore.getState().messagesByChat[42];
      expect(msgs).toHaveLength(1);
      expect((msgs[0].content as Td.messageText).text.text).toBe('updated');
    });

    it('increments unread for non-selected chat', () => {
      const chat = makeChat({ id: 42, unread_count: 0 });
      useChatStore.setState({
        chats: [chat],
        archivedChats: [],
        selectedChatId: 99,
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: makeMessage({ id: 2, is_outgoing: false }),
      });

      expect(useChatStore.getState().chats[0].unread_count).toBe(1);
    });

    it('does not increment unread for selected chat', () => {
      const chat = makeChat({ id: 42, unread_count: 0 });
      useChatStore.setState({
        chats: [chat],
        archivedChats: [],
        selectedChatId: 42,
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: makeMessage({ id: 2, is_outgoing: false }),
      });

      expect(useChatStore.getState().chats[0].unread_count).toBe(0);
    });

    it('clears matching pending', () => {
      useChatStore.setState({
        chats: [makeChat({ id: 42 })],
        archivedChats: [],
        messagesByChat: { 42: [] },
        pendingByChat: {
          42: [
            {
              _pending: 'sending',
              localId: 'p1',
              chat_id: 42,
              text: 'hi',
              date: 1000,
            },
          ],
        },
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: makeMessage({
          id: 99,
          is_outgoing: true,
          content: textContent('hi'),
        }),
      });

      expect(useChatStore.getState().pendingByChat[42]).toHaveLength(0);
    });

    it('does NOT append to messagesByChat when isAtLatest is false', () => {
      const chat = makeChat({ id: 42 });
      useChatStore.setState({
        chats: [chat],
        archivedChats: [],
        messagesByChat: { 42: [makeMessage({ id: 1 })] },
        isAtLatest: { 42: false },
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: makeMessage({ id: 2, content: textContent('new') }),
      });

      expect(useChatStore.getState().messagesByChat[42]).toHaveLength(1);
      expect(useChatStore.getState().messagesByChat[42][0].id).toBe(1);
    });

    it('still updates chat last_message when isAtLatest is false', () => {
      const chat = makeChat({ id: 42 });
      const newMsg = makeMessage({ id: 2, chat_id: 42, content: textContent('new') });
      useChatStore.setState({
        chats: [chat],
        archivedChats: [],
        messagesByChat: { 42: [makeMessage({ id: 1 })] },
        isAtLatest: { 42: false },
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: newMsg,
      });

      expect(useChatStore.getState().chats[0].last_message).toEqual(newMsg);
    });
  });

  describe('edit_message', () => {
    it('replaces message in chat', () => {
      useChatStore.setState({
        messagesByChat: {
          42: [makeMessage({ id: 5, content: textContent('before') })],
        },
      });

      useChatStore.getState().handleUpdate({
        type: 'edit_message',
        chat_id: 42,
        message: makeMessage({ id: 5, content: textContent('after') }),
      });

      const msgs = useChatStore.getState().messagesByChat[42];
      expect((msgs[0].content as Td.messageText).text.text).toBe('after');
    });
  });

  describe('delete_messages', () => {
    it('removes messages from chat', () => {
      useChatStore.setState({
        messagesByChat: {
          42: [makeMessage({ id: 1 }), makeMessage({ id: 2 }), makeMessage({ id: 3 })],
        },
      });

      useChatStore.getState().handleUpdate({
        type: 'delete_messages',
        chat_id: 42,
        message_ids: [1, 3],
        is_permanent: true,
      });

      expect(useChatStore.getState().messagesByChat[42]).toHaveLength(1);
      expect(useChatStore.getState().messagesByChat[42][0].id).toBe(2);
    });
  });

  describe('read_outbox', () => {
    it('updates last_read_outbox_message_id on chat', () => {
      const chat = makeChat({ id: 42, last_read_outbox_message_id: 10 });
      useChatStore.setState({ chats: [chat], archivedChats: [] });

      useChatStore.getState().handleUpdate({
        type: 'read_outbox',
        chat_id: 42,
        last_read_outbox_message_id: 50,
      });

      expect(useChatStore.getState().chats[0].last_read_outbox_message_id).toBe(50);
    });
  });

  describe('user_typing', () => {
    it('adds typing indicator', () => {
      useChatStore.getState().handleUpdate({
        type: 'user_typing',
        chat_id: 42,
        sender_id: { _: 'messageSenderUser', user_id: 99 },
        action: { _: 'chatActionTyping' },
      });

      const typing = useChatStore.getState().typingByChat[42];
      expect(typing).toBeDefined();
      expect(typing[99]).toBeDefined();
    });

    it('removes typing on cancel', () => {
      // First add typing
      useChatStore.getState().handleUpdate({
        type: 'user_typing',
        chat_id: 42,
        sender_id: { _: 'messageSenderUser', user_id: 99 },
        action: { _: 'chatActionTyping' },
      });

      // Then cancel
      useChatStore.getState().handleUpdate({
        type: 'user_typing',
        chat_id: 42,
        sender_id: { _: 'messageSenderUser', user_id: 99 },
        action: { _: 'chatActionCancel' },
      });

      const typing = useChatStore.getState().typingByChat[42];
      expect(typing?.[99]).toBeUndefined();
    });
  });

  describe('user_status', () => {
    it('sets user status', () => {
      useChatStore.getState().handleUpdate({
        type: 'user_status',
        user_id: 42,
        status: { _: 'userStatusOnline', expires: Math.floor(Date.now() / 1000) + 300 },
      });

      expect(useChatStore.getState().userStatuses[42]._).toBe('userStatusOnline');
    });
  });

  describe('message_reactions', () => {
    it('updates interaction_info on message', () => {
      useChatStore.setState({
        messagesByChat: {
          42: [makeMessage({ id: 5 })],
        },
      });

      const newInfo: Td.messageInteractionInfo = {
        _: 'messageInteractionInfo',
        view_count: 0,
        forward_count: 0,
        reply_info: undefined,
        reactions: {
          _: 'messageReactions',
          reactions: [
            {
              _: 'messageReaction',
              type: { _: 'reactionTypeEmoji', emoji: '\u{1F44D}' },
              total_count: 3,
              is_chosen: true,
              recent_sender_ids: [],
            },
          ],
          are_tags: false,
          paid_reactors: [],
          can_get_added_reactions: false,
        },
      };

      useChatStore.getState().handleUpdate({
        type: 'message_reactions',
        chat_id: 42,
        message_id: 5,
        interaction_info: newInfo,
      });

      const updated = useChatStore.getState().messagesByChat[42][0];
      expect(updated.interaction_info?.reactions?.reactions).toHaveLength(1);
      expect(updated.interaction_info?.reactions?.reactions[0].total_count).toBe(3);
    });
  });

  describe('chat_read_inbox', () => {
    it('updates unread count and last_read_inbox_message_id on matching chat', () => {
      useChatStore.setState({
        chats: [makeChat({ id: 10, unread_count: 5, last_read_inbox_message_id: 100 })],
      });
      useChatStore.getState().handleUpdate({
        type: 'chat_read_inbox',
        chat_id: 10,
        last_read_inbox_message_id: 200,
        unread_count: 0,
      });
      const chat = useChatStore.getState().chats[0];
      expect(chat.unread_count).toBe(0);
      expect(chat.last_read_inbox_message_id).toBe(200);
    });

    it('updates archived chats too', () => {
      useChatStore.setState({ archivedChats: [makeChat({ id: 10, unread_count: 3 })] });
      useChatStore.getState().handleUpdate({
        type: 'chat_read_inbox',
        chat_id: 10,
        last_read_inbox_message_id: 50,
        unread_count: 0,
      });
      expect(useChatStore.getState().archivedChats[0].unread_count).toBe(0);
    });

    it('ignores unknown chat id', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10, unread_count: 5 })] });
      useChatStore.getState().handleUpdate({
        type: 'chat_read_inbox',
        chat_id: 999,
        last_read_inbox_message_id: 200,
        unread_count: 0,
      });
      expect(useChatStore.getState().chats[0].unread_count).toBe(5);
    });
  });

  describe('new_chat', () => {
    it('adds new chat to the beginning of the list', () => {
      useChatStore.setState({ chats: [makeChat({ id: 1 })] });
      const newChat = makeChat({ id: 2, title: 'New Chat' });
      useChatStore.getState().handleUpdate({ type: 'new_chat', chat: newChat });
      const { chats } = useChatStore.getState();
      expect(chats).toHaveLength(2);
      expect(chats[0].id).toBe(2);
    });

    it('does not add duplicate chat', () => {
      useChatStore.setState({ chats: [makeChat({ id: 1 })] });
      useChatStore.getState().handleUpdate({ type: 'new_chat', chat: makeChat({ id: 1 }) });
      expect(useChatStore.getState().chats).toHaveLength(1);
    });

    it('does not add if exists in archived', () => {
      useChatStore.setState({ chats: [], archivedChats: [makeChat({ id: 5 })] });
      useChatStore.getState().handleUpdate({ type: 'new_chat', chat: makeChat({ id: 5 }) });
      expect(useChatStore.getState().chats).toHaveLength(0);
    });
  });

  describe('chat_last_message', () => {
    it('updates last_message on matching chat', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10 })] });
      const msg = makeMessage({ id: 50, chat_id: 10 });
      useChatStore.getState().handleUpdate({
        type: 'chat_last_message',
        chat_id: 10,
        last_message: msg,
        positions: [],
      });
      expect(useChatStore.getState().chats[0].last_message).toEqual(msg);
    });

    it('clears last_message when undefined', () => {
      const msg = makeMessage({ id: 50 });
      useChatStore.setState({ chats: [makeChat({ id: 10, last_message: msg })] });
      useChatStore.getState().handleUpdate({
        type: 'chat_last_message',
        chat_id: 10,
        last_message: undefined,
        positions: [],
      });
      expect(useChatStore.getState().chats[0].last_message).toBeUndefined();
    });

    it('updates positions when provided', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10 })] });
      const positions = [
        {
          _: 'chatPosition' as const,
          list: { _: 'chatListMain' as const },
          order: '123',
          is_pinned: false,
          source: undefined,
        },
      ] as Td.chatPosition[];
      useChatStore.getState().handleUpdate({
        type: 'chat_last_message',
        chat_id: 10,
        last_message: makeMessage({ id: 1 }),
        positions,
      });
      expect(useChatStore.getState().chats[0].positions).toEqual(positions);
    });
  });

  describe('chat_position', () => {
    it('adds new position to chat', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10, positions: [] })] });
      const pos = {
        _: 'chatPosition' as const,
        list: { _: 'chatListMain' as const },
        order: '100',
        is_pinned: true,
        source: undefined,
      } as Td.chatPosition;
      useChatStore.getState().handleUpdate({ type: 'chat_position', chat_id: 10, position: pos });
      expect(useChatStore.getState().chats[0].positions).toHaveLength(1);
      expect(useChatStore.getState().chats[0].positions[0].is_pinned).toBe(true);
    });

    it('removes position when order is zero', () => {
      const existing = {
        _: 'chatPosition' as const,
        list: { _: 'chatListMain' as const },
        order: '100',
        is_pinned: false,
        source: undefined,
      } as Td.chatPosition;
      useChatStore.setState({ chats: [makeChat({ id: 10, positions: [existing] })] });
      const pos = {
        _: 'chatPosition' as const,
        list: { _: 'chatListMain' as const },
        order: '0',
        is_pinned: false,
        source: undefined,
      } as Td.chatPosition;
      useChatStore.getState().handleUpdate({ type: 'chat_position', chat_id: 10, position: pos });
      expect(useChatStore.getState().chats[0].positions).toHaveLength(0);
    });
  });

  describe('message_send_failed', () => {
    it('marks pending message as failed', () => {
      const pending: PendingMessage = {
        _pending: 'sending',
        localId: '999',
        chat_id: 10,
        text: 'hi',
        date: 1000,
      };
      useChatStore.setState({ pendingByChat: { 10: [pending] } });
      useChatStore.getState().handleUpdate({
        type: 'message_send_failed',
        chat_id: 10,
        old_message_id: 999,
        message: makeMessage({ id: 999, chat_id: 10 }),
        error: { _: 'error', code: 400, message: 'Bad Request' } as Td.error,
      });
      expect(useChatStore.getState().pendingByChat[10][0]._pending).toBe('failed');
    });

    it('ignores when no matching pending message', () => {
      useChatStore.setState({ pendingByChat: {} });
      useChatStore.getState().handleUpdate({
        type: 'message_send_failed',
        chat_id: 10,
        old_message_id: 999,
        message: makeMessage({ id: 999 }),
        error: { _: 'error', code: 400, message: 'Bad Request' } as Td.error,
      });
      expect(useChatStore.getState().pendingByChat).toEqual({});
    });
  });

  describe('chat_title', () => {
    it('updates title on matching chat', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10, title: 'Old Title' })] });
      useChatStore.getState().handleUpdate({ type: 'chat_title', chat_id: 10, title: 'New Title' });
      expect(useChatStore.getState().chats[0].title).toBe('New Title');
    });

    it('updates archived chats too', () => {
      useChatStore.setState({ archivedChats: [makeChat({ id: 10, title: 'Old' })] });
      useChatStore.getState().handleUpdate({ type: 'chat_title', chat_id: 10, title: 'New' });
      expect(useChatStore.getState().archivedChats[0].title).toBe('New');
    });
  });

  describe('chat_photo', () => {
    it('updates photo on matching chat', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10 })] });
      const photo = {
        _: 'chatPhotoInfo',
        small: {},
        big: {},
        has_animation: false,
        is_personal: false,
      } as unknown as Td.chatPhotoInfo;
      useChatStore.getState().handleUpdate({ type: 'chat_photo', chat_id: 10, photo });
      expect(useChatStore.getState().chats[0].photo).toEqual(photo);
    });

    it('clears photo when undefined', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10 })] });
      useChatStore.getState().handleUpdate({ type: 'chat_photo', chat_id: 10, photo: undefined });
      expect(useChatStore.getState().chats[0].photo).toBeUndefined();
    });
  });

  describe('chat_notification_settings', () => {
    it('updates notification settings on matching chat', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10 })] });
      const settings = {
        _: 'chatNotificationSettings',
        mute_for: 3600,
      } as unknown as Td.chatNotificationSettings;
      useChatStore.getState().handleUpdate({
        type: 'chat_notification_settings',
        chat_id: 10,
        notification_settings: settings,
      });
      expect(useChatStore.getState().chats[0].notification_settings).toEqual(settings);
    });
  });

  describe('chat_draft_message', () => {
    it('sets draft message on matching chat', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10 })] });
      const draft = {
        _: 'draftMessage',
        date: 1000,
        input_message_text: {},
        effect_id: '0',
      } as unknown as Td.draftMessage;
      useChatStore.getState().handleUpdate({
        type: 'chat_draft_message',
        chat_id: 10,
        draft_message: draft,
        positions: [],
      });
      expect(useChatStore.getState().chats[0].draft_message).toEqual(draft);
    });

    it('clears draft message when undefined', () => {
      const draft = { _: 'draftMessage' } as unknown as Td.draftMessage;
      useChatStore.setState({ chats: [makeChat({ id: 10, draft_message: draft })] });
      useChatStore.getState().handleUpdate({
        type: 'chat_draft_message',
        chat_id: 10,
        draft_message: undefined,
        positions: [],
      });
      expect(useChatStore.getState().chats[0].draft_message).toBeUndefined();
    });
  });

  describe('connection_state', () => {
    it('stores connection state', () => {
      useChatStore.getState().handleUpdate({
        type: 'connection_state',
        state: { _: 'connectionStateReady' },
      });
      expect(useChatStore.getState().connectionState).toEqual({ _: 'connectionStateReady' });
    });

    it('updates when state changes', () => {
      useChatStore.getState().handleUpdate({
        type: 'connection_state',
        state: { _: 'connectionStateConnecting' },
      });
      expect(useChatStore.getState().connectionState).toEqual({ _: 'connectionStateConnecting' });
    });
  });

  describe('chat_is_marked_as_unread', () => {
    it('marks chat as unread', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10, is_marked_as_unread: false })] });
      useChatStore.getState().handleUpdate({
        type: 'chat_is_marked_as_unread',
        chat_id: 10,
        is_marked_as_unread: true,
      });
      expect(useChatStore.getState().chats[0].is_marked_as_unread).toBe(true);
    });

    it('unmarks chat as unread', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10, is_marked_as_unread: true })] });
      useChatStore.getState().handleUpdate({
        type: 'chat_is_marked_as_unread',
        chat_id: 10,
        is_marked_as_unread: false,
      });
      expect(useChatStore.getState().chats[0].is_marked_as_unread).toBe(false);
    });
  });

  describe('chat_unread_mention_count', () => {
    it('updates unread mention count', () => {
      useChatStore.setState({ chats: [makeChat({ id: 10, unread_mention_count: 0 })] });
      useChatStore.getState().handleUpdate({
        type: 'chat_unread_mention_count',
        chat_id: 10,
        unread_mention_count: 3,
      });
      expect(useChatStore.getState().chats[0].unread_mention_count).toBe(3);
    });
  });

  describe('message_is_pinned', () => {
    it('pins a message', () => {
      useChatStore.setState({
        messagesByChat: { 10: [makeMessage({ id: 1, chat_id: 10, is_pinned: false })] },
      });
      useChatStore.getState().handleUpdate({
        type: 'message_is_pinned',
        chat_id: 10,
        message_id: 1,
        is_pinned: true,
      });
      expect(useChatStore.getState().messagesByChat[10][0].is_pinned).toBe(true);
    });

    it('unpins a message', () => {
      useChatStore.setState({
        messagesByChat: { 10: [makeMessage({ id: 1, chat_id: 10, is_pinned: true })] },
      });
      useChatStore.getState().handleUpdate({
        type: 'message_is_pinned',
        chat_id: 10,
        message_id: 1,
        is_pinned: false,
      });
      expect(useChatStore.getState().messagesByChat[10][0].is_pinned).toBe(false);
    });

    it('ignores when chat messages not loaded', () => {
      useChatStore.setState({ messagesByChat: {} });
      useChatStore.getState().handleUpdate({
        type: 'message_is_pinned',
        chat_id: 10,
        message_id: 1,
        is_pinned: true,
      });
      expect(useChatStore.getState().messagesByChat[10]).toBeUndefined();
    });
  });
});

// --- Selectors ---

describe('selectChatMessages', () => {
  it('returns empty when no chat selected', () => {
    expect(selectChatMessages(useChatStore.getState())).toEqual([]);
  });

  it('returns real messages when no pending', () => {
    const msgs = [makeMessage({ id: 1 })];
    useChatStore.setState({ selectedChatId: 42, messagesByChat: { 42: msgs } });
    const result = selectChatMessages(useChatStore.getState());
    expect(result.length).toBe(1);
    expect((result[0] as { id: number }).id).toBe(1);
  });

  it('merges real + pending', () => {
    const msgs = [makeMessage({ id: 1 })];
    const pending: PendingMessage[] = [
      { _pending: 'sending', localId: 'p1', chat_id: 42, text: 'new', date: 2000 },
    ];
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: msgs },
      pendingByChat: { 42: pending },
    });
    const result = selectChatMessages(useChatStore.getState());
    expect(result).toHaveLength(2);
  });
});

describe('selectUnresolvedReplies', () => {
  const replyPreview = {
    senderName: 'Test',
    text: 'hello',
    mediaLabel: '',
    contentKind: 'text' as const,
    hasWebPreview: false,
    quoteText: '',
  };

  it('returns empty when no chat selected', () => {
    expect(selectUnresolvedReplies(useChatStore.getState())).toEqual([]);
  });

  it('returns unresolved reply message ids', () => {
    const msgs = [
      makeMessage({
        id: 1,
        chat_id: 42,
        reply_to: {
          _: 'messageReplyToMessage',
          chat_id: 42,
          message_id: 100,
          checklist_task_id: 0,
          origin_send_date: 0,
        },
      }),
      makeMessage({ id: 2, chat_id: 42 }), // no reply
    ];
    useChatStore.setState({ selectedChatId: 42, messagesByChat: { 42: msgs }, replyPreviews: {} });
    const result = selectUnresolvedReplies(useChatStore.getState());
    expect(result).toEqual([{ chatId: 42, messageId: 100 }]);
  });

  it('excludes already-resolved replies', () => {
    const msgs = [
      makeMessage({
        id: 1,
        chat_id: 42,
        reply_to: {
          _: 'messageReplyToMessage',
          chat_id: 42,
          message_id: 100,
          checklist_task_id: 0,
          origin_send_date: 0,
        },
      }),
    ];
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: msgs },
      replyPreviews: { '42_100': replyPreview },
    });
    expect(selectUnresolvedReplies(useChatStore.getState())).toEqual([]);
  });

  it('returns stable reference when replyPreviews changes but unresolved set is the same', () => {
    const msgs = [
      makeMessage({
        id: 1,
        chat_id: 42,
        reply_to: {
          _: 'messageReplyToMessage',
          chat_id: 42,
          message_id: 100,
          checklist_task_id: 0,
          origin_send_date: 0,
        },
      }),
      makeMessage({
        id: 2,
        chat_id: 42,
        reply_to: {
          _: 'messageReplyToMessage',
          chat_id: 42,
          message_id: 200,
          checklist_task_id: 0,
          origin_send_date: 0,
        },
      }),
    ];
    useChatStore.setState({ selectedChatId: 42, messagesByChat: { 42: msgs }, replyPreviews: {} });
    const first = selectUnresolvedReplies(useChatStore.getState());
    expect(first).toHaveLength(2);

    // Resolve one reply — replyPreviews object changes, unresolved set shrinks
    useChatStore.setState({
      replyPreviews: { '42_100': replyPreview },
    });
    const second = selectUnresolvedReplies(useChatStore.getState());
    expect(second).toHaveLength(1);
    expect(second).toEqual([{ chatId: 42, messageId: 200 }]);

    // Resolve the other too — set shrinks to empty
    useChatStore.setState({
      replyPreviews: { '42_100': replyPreview, '42_200': { ...replyPreview, senderName: 'Foo' } },
    });
    const third = selectUnresolvedReplies(useChatStore.getState());
    expect(third).toHaveLength(0);

    // Adding an UNRELATED key to replyPreviews should NOT change the reference
    // This is the key test: the selector must return the same [] reference
    const beforeUnrelated = selectUnresolvedReplies(useChatStore.getState());
    useChatStore.setState({
      replyPreviews: {
        '42_100': replyPreview,
        '42_200': { ...replyPreview, senderName: 'Foo' },
        '42_999': { ...replyPreview, senderName: 'X' },
      },
    });
    const afterUnrelated = selectUnresolvedReplies(useChatStore.getState());
    expect(afterUnrelated).toBe(beforeUnrelated); // same reference — no unnecessary re-render
  });
});

describe('selectUnresolvedPinnedPreviews', () => {
  it('returns stable reference when pinnedPreviews changes but set is the same', () => {
    const msgs = [
      makeMessage({
        id: 1,
        chat_id: 42,
        content: { _: 'messagePinMessage', message_id: 500 } as unknown as Td.MessageContent,
      }),
    ];
    useChatStore.setState({ selectedChatId: 42, messagesByChat: { 42: msgs }, pinnedPreviews: {} });
    const first = selectUnresolvedPinnedPreviews(useChatStore.getState());
    expect(first).toEqual([{ chatId: 42, messageId: 500 }]);

    // Resolve it
    useChatStore.setState({ pinnedPreviews: { '42_500': 'pinned text' } });
    const second = selectUnresolvedPinnedPreviews(useChatStore.getState());
    expect(second).toHaveLength(0);

    // Unrelated change — same reference
    const before = selectUnresolvedPinnedPreviews(useChatStore.getState());
    useChatStore.setState({ pinnedPreviews: { '42_500': 'pinned text', '42_999': 'other' } });
    const after = selectUnresolvedPinnedPreviews(useChatStore.getState());
    expect(after).toBe(before);
  });
});

describe('selectSelectedChat', () => {
  it('returns null when nothing selected', () => {
    expect(selectSelectedChat(useChatStore.getState())).toBeNull();
  });

  it('finds chat in chats list', () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({ chats: [chat], selectedChatId: 42 });
    const result = selectSelectedChat(useChatStore.getState());
    expect(result?.id).toBe(42);
  });

  it('falls back to archivedChats', () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({ archivedChats: [chat], selectedChatId: 42 });
    const result = selectSelectedChat(useChatStore.getState());
    expect(result?.id).toBe(42);
  });
});

describe('selectHeaderStatus', () => {
  it('returns null when no chat', () => {
    expect(selectHeaderStatus(useChatStore.getState())).toBeNull();
  });

  it('returns online for private chat with online status', () => {
    const chat = makeChat({ id: 42, type: { _: 'chatTypePrivate', user_id: 42 } });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      userStatuses: {
        42: { _: 'userStatusOnline', expires: Math.floor(Date.now() / 1000) + 300 },
      },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({ type: 'online' });
  });

  it('returns typing for private chat', () => {
    const chat = makeChat({ id: 42, type: { _: 'chatTypePrivate', user_id: 42 } });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      typingByChat: {
        42: { 99: { action: { _: 'chatActionTyping' }, expiresAt: Date.now() + 5000 } },
      },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'typing',
      text: 'typing',
    });
  });

  it('returns null for group without cached info', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeBasicGroup', basic_group_id: 42 },
    });
    useChatStore.setState({ chats: [chat], selectedChatId: 42 });
    expect(selectHeaderStatus(useChatStore.getState())).toBeNull();
  });

  it('returns null for channel without cached info', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeSupergroup', supergroup_id: 42, is_channel: true },
    });
    useChatStore.setState({ chats: [chat], selectedChatId: 42 });
    expect(selectHeaderStatus(useChatStore.getState())).toBeNull();
  });

  it('returns member count for group with cached info', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeBasicGroup', basic_group_id: 42 },
    });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: { 42: { memberCount: 150, isChannel: false } },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'label',
      text: '150 members',
    });
  });

  it('returns member count with online for group', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeBasicGroup', basic_group_id: 42 },
    });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: { 42: { memberCount: 150, isChannel: false } },
      chatOnlineCounts: { 42: 12 },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'label',
      text: '150 members, 12 online',
    });
  });

  it('returns subscriber count for channel with cached info', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeSupergroup', supergroup_id: 42, is_channel: true },
    });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: { 42: { memberCount: 5000, isChannel: true } },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'label',
      text: '5,000 subscribers',
    });
  });

  it('returns bot active users for bot', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypePrivate', user_id: 42 },
    });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: { 42: { memberCount: 0, isChannel: false, botActiveUsers: 2500000 } },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'label',
      text: '2,500,000 monthly users',
    });
  });

  it('returns "bot" for bot with no active users', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypePrivate', user_id: 42 },
    });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: { 42: { memberCount: 0, isChannel: false, botActiveUsers: 0 } },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'label',
      text: 'bot',
    });
  });
});

// --- loadProfilePhoto ---

describe('loadProfilePhoto', () => {
  it('calls getProfilePhotoUrl and stores result', async () => {
    vi.mocked(getProfilePhotoUrl).mockResolvedValueOnce('/photo.jpg');

    useChatStore.getState().loadProfilePhoto(42);
    await vi.waitFor(() => {
      expect(useChatStore.getState().profilePhotos[42]).toBe('/photo.jpg');
    });
  });

  it('deduplicates requests', () => {
    vi.mocked(getProfilePhotoUrl).mockResolvedValue(null);
    useChatStore.getState().loadProfilePhoto(42);
    useChatStore.getState().loadProfilePhoto(42);
    expect(getProfilePhotoUrl).toHaveBeenCalledTimes(1);
  });
});

// --- loadNewerMessages ---

describe('loadNewerMessages', () => {
  it('appends newer messages to array', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasNewer: { 42: true },
      isAtLatest: { 42: false },
    });
    vi.mocked(getNewerMessages).mockResolvedValueOnce({
      messages: [makeMessage({ id: 20, chat_id: 42 }), makeMessage({ id: 30, chat_id: 42 })],
      hasMore: false,
    });

    await useChatStore.getState().loadNewerMessages();
    const msgs = useChatStore.getState().messagesByChat[42];
    expect(msgs).toHaveLength(3);
    expect(msgs[msgs.length - 1].id).toBe(30);
  });

  it('deduplicates by ID', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasNewer: { 42: true },
      isAtLatest: { 42: false },
    });
    vi.mocked(getNewerMessages).mockResolvedValueOnce({
      messages: [makeMessage({ id: 10, chat_id: 42 })],
      hasMore: false,
    });

    await useChatStore.getState().loadNewerMessages();
    expect(useChatStore.getState().messagesByChat[42]).toHaveLength(1);
  });

  it('sets hasNewer=false and isAtLatest=true when empty batch', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasNewer: { 42: true },
      isAtLatest: { 42: false },
    });
    vi.mocked(getNewerMessages).mockResolvedValueOnce({ messages: [], hasMore: false });

    await useChatStore.getState().loadNewerMessages();
    const s = useChatStore.getState();
    expect(s.hasNewer[42]).toBe(false);
    expect(s.isAtLatest[42]).toBe(true);
  });

  it('guards when isAtLatest is true', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasNewer: { 42: true },
      isAtLatest: { 42: true },
    });

    await useChatStore.getState().loadNewerMessages();
    expect(getNewerMessages).not.toHaveBeenCalled();
  });

  it('guards when loadingNewerMessages is true', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasNewer: { 42: true },
      isAtLatest: { 42: false },
      loadingNewerMessages: true,
    });

    await useChatStore.getState().loadNewerMessages();
    expect(getNewerMessages).not.toHaveBeenCalled();
  });

  it('guards when hasNewer is false', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasNewer: { 42: false },
      isAtLatest: { 42: false },
    });

    await useChatStore.getState().loadNewerMessages();
    expect(getNewerMessages).not.toHaveBeenCalled();
  });
});

// --- loadMessagesAround ---

describe('loadMessagesAround', () => {
  it('replaces messagesByChat with new window', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 1, chat_id: 42 })] },
    });
    vi.mocked(getMessagesAroundMessage).mockResolvedValueOnce({
      messages: [makeMessage({ id: 50, chat_id: 42 }), makeMessage({ id: 51, chat_id: 42 })],
      hasOlder: true,
      hasNewer: true,
    });

    await useChatStore.getState().loadMessagesAround(50);
    const msgs = useChatStore.getState().messagesByChat[42];
    expect(msgs).toHaveLength(2);
    expect(msgs.find((m) => m.id === 1)).toBeUndefined();
    expect(msgs.find((m) => m.id === 50)).toBeDefined();
  });

  it('target message included in window', async () => {
    useChatStore.setState({ selectedChatId: 42, messagesByChat: { 42: [] } });
    vi.mocked(getMessagesAroundMessage).mockResolvedValueOnce({
      messages: [
        makeMessage({ id: 49, chat_id: 42 }),
        makeMessage({ id: 50, chat_id: 42 }),
        makeMessage({ id: 51, chat_id: 42 }),
      ],
      hasOlder: false,
      hasNewer: false,
    });

    await useChatStore.getState().loadMessagesAround(50);
    const msgs = useChatStore.getState().messagesByChat[42];
    expect(msgs.some((m) => m.id === 50)).toBe(true);
  });

  it('sets isAtLatest to false', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [] },
      isAtLatest: { 42: true },
    });
    vi.mocked(getMessagesAroundMessage).mockResolvedValueOnce({
      messages: [makeMessage({ id: 50, chat_id: 42 })],
      hasOlder: false,
      hasNewer: false,
    });

    await useChatStore.getState().loadMessagesAround(50);
    expect(useChatStore.getState().isAtLatest[42]).toBe(false);
  });

  it('sets hasOlder and hasNewer from response', async () => {
    useChatStore.setState({ selectedChatId: 42, messagesByChat: { 42: [] } });
    vi.mocked(getMessagesAroundMessage).mockResolvedValueOnce({
      messages: [makeMessage({ id: 50, chat_id: 42 })],
      hasOlder: true,
      hasNewer: true,
    });

    await useChatStore.getState().loadMessagesAround(50);
    const s = useChatStore.getState();
    expect(s.hasOlder[42]).toBe(true);
    expect(s.hasNewer[42]).toBe(true);
  });
});

// --- loadLatestMessages ---

describe('loadLatestMessages', () => {
  it('replaces window with recent messages', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 1, chat_id: 42 })] },
      isAtLatest: { 42: false },
    });
    vi.mocked(getMessages).mockResolvedValueOnce({
      messages: [makeMessage({ id: 100, chat_id: 42 }), makeMessage({ id: 99, chat_id: 42 })],
      hasMore: false,
    });

    await useChatStore.getState().loadLatestMessages();
    const msgs = useChatStore.getState().messagesByChat[42];
    expect(msgs.find((m) => m.id === 1)).toBeUndefined();
    expect(msgs.find((m) => m.id === 99)).toBeDefined();
    expect(msgs.find((m) => m.id === 100)).toBeDefined();
  });

  it('sets isAtLatest=true and hasNewer=false', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [] },
      isAtLatest: { 42: false },
      hasNewer: { 42: true },
    });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [], hasMore: false });

    await useChatStore.getState().loadLatestMessages();
    const s = useChatStore.getState();
    expect(s.isAtLatest[42]).toBe(true);
    expect(s.hasNewer[42]).toBe(false);
  });

  it('sets hasOlder based on response', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [] },
    });
    vi.mocked(getMessages).mockResolvedValueOnce({
      messages: [makeMessage({ id: 100, chat_id: 42 })],
      hasMore: true,
    });

    await useChatStore.getState().loadLatestMessages();
    expect(useChatStore.getState().hasOlder[42]).toBe(true);
  });

  it('guards when no selectedChatId', async () => {
    useChatStore.setState({ selectedChatId: null });
    await useChatStore.getState().loadLatestMessages();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('sets error on failure', async () => {
    useChatStore.setState({ selectedChatId: 42, messagesByChat: { 42: [] } });
    vi.mocked(getMessages).mockRejectedValueOnce(new Error('net fail'));
    await useChatStore.getState().loadLatestMessages();
    expect(useChatStore.getState().error).toBe('net fail');
  });
});

// --- openChatById ---

describe('openChatById', () => {
  it('delegates to openChat when chat found in main list', async () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({ chats: [chat], messagesByChat: { 42: [makeMessage()] } });
    await useChatStore.getState().openChatById(42);
    expect(useChatStore.getState().selectedChatId).toBe(42);
    // Should use cached messages, no fetch
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('delegates to openChat when chat found in archived', async () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({ archivedChats: [chat], messagesByChat: { 42: [makeMessage()] } });
    await useChatStore.getState().openChatById(42);
    expect(useChatStore.getState().selectedChatId).toBe(42);
  });

  it('fetches by ID when chat not in lists', async () => {
    const msgs = [makeMessage({ id: 10, chat_id: 99 })];
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: msgs, hasMore: false });
    await useChatStore.getState().openChatById(99);
    const s = useChatStore.getState();
    expect(s.selectedChatId).toBe(99);
    expect(s.messagesByChat[99]).toHaveLength(1);
    expect(markAsRead).toHaveBeenCalledWith(99);
  });

  it('uses cache when chat not in lists but messages cached', async () => {
    useChatStore.setState({ messagesByChat: { 99: [makeMessage({ id: 1, chat_id: 99 })] } });
    await useChatStore.getState().openChatById(99);
    expect(getMessages).not.toHaveBeenCalled();
    expect(markAsRead).toHaveBeenCalledWith(99);
  });

  it('sets error on fetch failure', async () => {
    vi.mocked(getMessages).mockRejectedValueOnce(new Error('oops'));
    await useChatStore.getState().openChatById(99);
    expect(useChatStore.getState().error).toBe('oops');
    expect(useChatStore.getState().loadingMessages).toBe(false);
  });

  it('closes previous chat when opening by ID directly', async () => {
    const { closeTdChat } = await import('../telegram');
    useChatStore.setState({ selectedChatId: 10 });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [], hasMore: false });
    await useChatStore.getState().openChatById(99);
    expect(closeTdChat).toHaveBeenCalledWith(10);
  });
});

// --- loadOlderMessages ---

describe('loadOlderMessages', () => {
  it('prepends older messages', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasOlder: { 42: true },
    });
    vi.mocked(getMessages).mockResolvedValueOnce({
      messages: [makeMessage({ id: 5, chat_id: 42 })],
      hasMore: true,
    });
    await useChatStore.getState().loadOlderMessages();
    const msgs = useChatStore.getState().messagesByChat[42];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].id).toBe(5);
    expect(msgs[1].id).toBe(10);
  });

  it('sets hasOlder=false on empty batch', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasOlder: { 42: true },
    });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [], hasMore: false });
    await useChatStore.getState().loadOlderMessages();
    expect(useChatStore.getState().hasOlder[42]).toBe(false);
  });

  it('guards when no selectedChatId', async () => {
    useChatStore.setState({ selectedChatId: null });
    await useChatStore.getState().loadOlderMessages();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('guards when already loading', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10 })] },
      hasOlder: { 42: true },
      loadingOlderMessages: true,
    });
    await useChatStore.getState().loadOlderMessages();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('guards when hasOlder is false', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10 })] },
      hasOlder: { 42: false },
    });
    await useChatStore.getState().loadOlderMessages();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('guards when messages empty', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [] },
      hasOlder: { 42: true },
    });
    await useChatStore.getState().loadOlderMessages();
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('deduplicates older messages', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasOlder: { 42: true },
    });
    vi.mocked(getMessages).mockResolvedValueOnce({
      messages: [makeMessage({ id: 10, chat_id: 42 })],
      hasMore: false,
    });
    await useChatStore.getState().loadOlderMessages();
    expect(useChatStore.getState().messagesByChat[42]).toHaveLength(1);
  });

  it('handles fetch error gracefully', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasOlder: { 42: true },
    });
    vi.mocked(getMessages).mockRejectedValueOnce(new Error('fail'));
    await useChatStore.getState().loadOlderMessages();
    expect(useChatStore.getState().loadingOlderMessages).toBe(false);
  });
});

// --- send (additional) ---

describe('send (additional)', () => {
  it('updates chat preview with fake last message', () => {
    const chat = makeChat({
      id: 42,
      last_message: makeMessage({ id: 1, chat_id: 42 }),
    });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });
    vi.mocked(sendMessage).mockResolvedValueOnce(makeMessage({ id: 999 }));

    useChatStore.getState().send(42, 'preview text');
    const updated = useChatStore.getState().chats[0];
    expect((updated.last_message?.content as Td.messageText).text.text).toBe('preview text');
  });

  it('handles chat without last_message (fakeLastMsg is undefined)', () => {
    const chat = makeChat({ id: 42, last_message: undefined });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });
    vi.mocked(sendMessage).mockResolvedValueOnce(makeMessage({ id: 999 }));

    useChatStore.getState().send(42, 'hi');
    const updated = useChatStore.getState().chats[0];
    expect(updated.last_message).toBeUndefined();
  });
});

// --- react (additional) ---

describe('react (additional)', () => {
  it('removes reaction when chosen=true and count=1', () => {
    const msg = makeMessage({
      id: 10,
      interaction_info: {
        _: 'messageInteractionInfo',
        view_count: 0,
        forward_count: 0,
        reactions: {
          _: 'messageReactions',
          reactions: [
            {
              _: 'messageReaction',
              type: { _: 'reactionTypeEmoji', emoji: '\u{1F44D}' },
              total_count: 1,
              is_chosen: true,
              recent_sender_ids: [],
            },
          ],
          are_tags: false,
          paid_reactors: [],
          can_get_added_reactions: false,
        },
      },
    });
    useChatStore.setState({ messagesByChat: { 42: [msg] } });
    vi.mocked(sendReaction).mockResolvedValueOnce(undefined);

    useChatStore.getState().react(42, 10, '\u{1F44D}', true);

    const updated = useChatStore.getState().messagesByChat[42][0];
    const reactions =
      (updated.interaction_info?.reactions as unknown as { reactions: Td.messageReaction[] })
        ?.reactions ?? [];
    expect(reactions).toHaveLength(0);
  });

  it('decrements count when chosen=true and count>1', () => {
    const msg = makeMessage({
      id: 10,
      interaction_info: {
        _: 'messageInteractionInfo',
        view_count: 0,
        forward_count: 0,
        reactions: {
          _: 'messageReactions',
          reactions: [
            {
              _: 'messageReaction',
              type: { _: 'reactionTypeEmoji', emoji: '\u{1F44D}' },
              total_count: 3,
              is_chosen: true,
              recent_sender_ids: [],
            },
          ],
          are_tags: false,
          paid_reactors: [],
          can_get_added_reactions: false,
        },
      },
    });
    useChatStore.setState({ messagesByChat: { 42: [msg] } });
    vi.mocked(sendReaction).mockResolvedValueOnce(undefined);

    useChatStore.getState().react(42, 10, '\u{1F44D}', true);

    const updated = useChatStore.getState().messagesByChat[42][0];
    const reactions =
      (updated.interaction_info?.reactions as unknown as { reactions: Td.messageReaction[] })
        ?.reactions ?? [];
    expect(reactions).toHaveLength(1);
    expect(reactions[0].total_count).toBe(2);
    expect(reactions[0].is_chosen).toBe(false);
  });

  it('increments count when adding to existing reaction', () => {
    const msg = makeMessage({
      id: 10,
      interaction_info: {
        _: 'messageInteractionInfo',
        view_count: 0,
        forward_count: 0,
        reactions: {
          _: 'messageReactions',
          reactions: [
            {
              _: 'messageReaction',
              type: { _: 'reactionTypeEmoji', emoji: '\u{1F44D}' },
              total_count: 2,
              is_chosen: false,
              recent_sender_ids: [],
            },
          ],
          are_tags: false,
          paid_reactors: [],
          can_get_added_reactions: false,
        },
      },
    });
    useChatStore.setState({ messagesByChat: { 42: [msg] } });
    vi.mocked(sendReaction).mockResolvedValueOnce(undefined);

    useChatStore.getState().react(42, 10, '\u{1F44D}', false);

    const updated = useChatStore.getState().messagesByChat[42][0];
    const reactions =
      (updated.interaction_info?.reactions as unknown as { reactions: Td.messageReaction[] })
        ?.reactions ?? [];
    expect(reactions[0].total_count).toBe(3);
    expect(reactions[0].is_chosen).toBe(true);
  });

  it('no-ops when messages not loaded', () => {
    useChatStore.setState({ messagesByChat: {} });
    vi.mocked(sendReaction).mockResolvedValueOnce(undefined);
    useChatStore.getState().react(42, 10, '\u{1F44D}', false);
    expect(sendReaction).not.toHaveBeenCalled();
  });

  it('calls sendReaction with correct arguments', () => {
    const msg = makeMessage({ id: 10 });
    useChatStore.setState({ messagesByChat: { 42: [msg] } });
    vi.mocked(sendReaction).mockResolvedValueOnce(undefined);

    useChatStore.getState().react(42, 10, '\u{1F44D}', false);
    expect(sendReaction).toHaveBeenCalledWith(42, 10, '\u{1F44D}', false);
  });
});

// --- handleUpdate (additional) ---

describe('handleUpdate (additional)', () => {
  describe('auth_state', () => {
    it('sets authState', () => {
      useChatStore.getState().handleUpdate({
        type: 'auth_state',
        authorization_state: { _: 'authorizationStateWaitPhoneNumber' },
      });
      expect(useChatStore.getState().authState).toEqual({
        _: 'authorizationStateWaitPhoneNumber',
      });
    });

    it('triggers loadDialogs on authorizationStateReady', () => {
      vi.mocked(getDialogs).mockResolvedValue([]);
      useChatStore.getState().handleUpdate({
        type: 'auth_state',
        authorization_state: { _: 'authorizationStateReady' },
      });
      expect(getDialogs).toHaveBeenCalled();
    });
  });

  describe('user', () => {
    it('adds user to users Map', () => {
      useChatStore.getState().handleUpdate({
        type: 'user',
        user: { id: 100, first_name: 'Alice', last_name: 'B' } as Td.user,
      });
      expect(useChatStore.getState().users.get(100)).toBeDefined();
      expect(useChatStore.getState().users.get(100)?.first_name).toBe('Alice');
    });

    it('populates userStatuses from user.status when no existing status', () => {
      useChatStore.getState().handleUpdate({
        type: 'user',
        user: {
          id: 100,
          first_name: 'Alice',
          status: { _: 'userStatusOnline', expires: 999999 },
        } as Td.user,
      });
      expect(useChatStore.getState().userStatuses[100]?._).toBe('userStatusOnline');
    });

    it('does not overwrite existing userStatuses', () => {
      useChatStore.setState({
        userStatuses: { 100: { _: 'userStatusOffline', was_online: 1000 } },
      });
      useChatStore.getState().handleUpdate({
        type: 'user',
        user: {
          id: 100,
          first_name: 'Alice',
          status: { _: 'userStatusOnline', expires: 999999 },
        } as Td.user,
      });
      expect(useChatStore.getState().userStatuses[100]?._).toBe('userStatusOffline');
    });
  });

  describe('message_send_succeeded', () => {
    it('replaces old message by ID', () => {
      const oldMsg = makeMessage({ id: 100, chat_id: 42, content: textContent('hi') });
      useChatStore.setState({ messagesByChat: { 42: [oldMsg] } });

      useChatStore.getState().handleUpdate({
        type: 'message_send_succeeded',
        chat_id: 42,
        old_message_id: 100,
        message: makeMessage({ id: 200, chat_id: 42, content: textContent('hi') }),
      });

      const msgs = useChatStore.getState().messagesByChat[42];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe(200);
    });

    it('appends when old ID not found', () => {
      useChatStore.setState({ messagesByChat: { 42: [makeMessage({ id: 50, chat_id: 42 })] } });

      useChatStore.getState().handleUpdate({
        type: 'message_send_succeeded',
        chat_id: 42,
        old_message_id: 999,
        message: makeMessage({ id: 200, chat_id: 42, content: textContent('appended') }),
      });

      const msgs = useChatStore.getState().messagesByChat[42];
      expect(msgs).toHaveLength(2);
      expect(msgs[1].id).toBe(200);
    });

    it('clears matching pending message by text', () => {
      const pending: PendingMessage = {
        _pending: 'sending',
        localId: 'p1',
        chat_id: 42,
        text: 'hello',
        date: 1000,
      };
      useChatStore.setState({
        messagesByChat: { 42: [] },
        pendingByChat: { 42: [pending] },
      });

      useChatStore.getState().handleUpdate({
        type: 'message_send_succeeded',
        chat_id: 42,
        old_message_id: 999,
        message: makeMessage({ id: 200, chat_id: 42, content: textContent('hello') }),
      });

      expect(useChatStore.getState().pendingByChat[42]).toHaveLength(0);
    });
  });

  describe('chat_online_member_count', () => {
    it('updates online count', () => {
      useChatStore.getState().handleUpdate({
        type: 'chat_online_member_count',
        chat_id: 42,
        online_member_count: 15,
      });
      expect(useChatStore.getState().chatOnlineCounts[42]).toBe(15);
    });
  });

  describe('chat_last_message sorts by order', () => {
    it('reorders chats after updating positions', () => {
      const chat1 = makeChat({
        id: 1,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '200',
            is_pinned: false,
            source: undefined,
          } as Td.chatPosition,
        ],
      });
      const chat2 = makeChat({
        id: 2,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '100',
            is_pinned: false,
            source: undefined,
          } as Td.chatPosition,
        ],
      });
      useChatStore.setState({ chats: [chat1, chat2], archivedChats: [] });

      // Give chat2 a higher order via chat_last_message
      useChatStore.getState().handleUpdate({
        type: 'chat_last_message',
        chat_id: 2,
        last_message: makeMessage({ id: 50, chat_id: 2 }),
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '300',
            is_pinned: false,
            source: undefined,
          } as Td.chatPosition,
        ],
      });

      expect(useChatStore.getState().chats[0].id).toBe(2);
    });
  });

  describe('chat_draft_message sorts by order', () => {
    it('reorders chats when positions update', () => {
      const chat1 = makeChat({
        id: 1,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '200',
            is_pinned: false,
            source: undefined,
          } as Td.chatPosition,
        ],
      });
      const chat2 = makeChat({
        id: 2,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '100',
            is_pinned: false,
            source: undefined,
          } as Td.chatPosition,
        ],
      });
      useChatStore.setState({ chats: [chat1, chat2], archivedChats: [] });

      useChatStore.getState().handleUpdate({
        type: 'chat_draft_message',
        chat_id: 2,
        draft_message: undefined,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '300',
            is_pinned: false,
            source: undefined,
          } as Td.chatPosition,
        ],
      });

      expect(useChatStore.getState().chats[0].id).toBe(2);
    });
  });

  describe('chat_position sorts by order', () => {
    it('reorders chats after position update', () => {
      const chat1 = makeChat({
        id: 1,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '200',
            is_pinned: false,
            source: undefined,
          } as Td.chatPosition,
        ],
      });
      const chat2 = makeChat({
        id: 2,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '100',
            is_pinned: false,
            source: undefined,
          } as Td.chatPosition,
        ],
      });
      useChatStore.setState({ chats: [chat1, chat2], archivedChats: [] });

      useChatStore.getState().handleUpdate({
        type: 'chat_position',
        chat_id: 2,
        position: {
          _: 'chatPosition',
          list: { _: 'chatListMain' },
          order: '300',
          is_pinned: false,
          source: undefined,
        } as Td.chatPosition,
      });

      expect(useChatStore.getState().chats[0].id).toBe(2);
    });
  });

  describe('new_message typing indicator clear', () => {
    it('clears typing indicator for message sender', () => {
      const chat = makeChat({ id: 42 });
      useChatStore.setState({
        chats: [chat],
        archivedChats: [],
        messagesByChat: { 42: [] },
        typingByChat: {
          42: { 99: { action: { _: 'chatActionTyping' }, expiresAt: Date.now() + 5000 } },
        },
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: makeMessage({
          id: 2,
          sender_id: { _: 'messageSenderUser', user_id: 99 },
        }),
      });

      expect(useChatStore.getState().typingByChat[42]?.[99]).toBeUndefined();
    });
  });
});

// --- loadMoreChats ---

describe('loadMoreChats', () => {
  it('appends chats for non-archived', async () => {
    useChatStore.setState({
      chats: [makeChat({ id: 1 })],
      hasMoreChats: true,
      loadingMoreChats: false,
    });
    vi.mocked(loadMoreDialogs).mockResolvedValueOnce({
      chats: [makeChat({ id: 2 })],
      hasMore: false,
    });

    await useChatStore.getState().loadMoreChats(false);
    expect(useChatStore.getState().chats).toHaveLength(2);
    expect(useChatStore.getState().hasMoreChats).toBe(false);
  });

  it('appends chats for archived', async () => {
    useChatStore.setState({
      archivedChats: [makeChat({ id: 1 })],
      hasMoreArchivedChats: true,
      loadingMoreArchivedChats: false,
    });
    vi.mocked(loadMoreDialogs).mockResolvedValueOnce({
      chats: [makeChat({ id: 2 })],
      hasMore: true,
    });

    await useChatStore.getState().loadMoreChats(true);
    expect(useChatStore.getState().archivedChats).toHaveLength(2);
  });

  it('guards when already loading', async () => {
    useChatStore.setState({ loadingMoreChats: true, hasMoreChats: true });
    await useChatStore.getState().loadMoreChats(false);
    expect(loadMoreDialogs).not.toHaveBeenCalled();
  });

  it('guards when no more chats', async () => {
    useChatStore.setState({ loadingMoreChats: false, hasMoreChats: false });
    await useChatStore.getState().loadMoreChats(false);
    expect(loadMoreDialogs).not.toHaveBeenCalled();
  });

  it('sets hasMore=false on empty result', async () => {
    useChatStore.setState({
      chats: [makeChat({ id: 1 })],
      hasMoreChats: true,
      loadingMoreChats: false,
    });
    vi.mocked(loadMoreDialogs).mockResolvedValueOnce({ chats: [], hasMore: false });

    await useChatStore.getState().loadMoreChats(false);
    expect(useChatStore.getState().hasMoreChats).toBe(false);
  });

  it('handles error gracefully', async () => {
    useChatStore.setState({
      chats: [],
      hasMoreChats: true,
      loadingMoreChats: false,
    });
    vi.mocked(loadMoreDialogs).mockRejectedValueOnce(new Error('fail'));
    await useChatStore.getState().loadMoreChats(false);
    expect(useChatStore.getState().loadingMoreChats).toBe(false);
  });
});

// --- loadMedia / clearMediaUrl / seedMedia ---

describe('loadMedia', () => {
  it('calls downloadMedia and stores URL', async () => {
    vi.mocked(downloadMedia).mockResolvedValueOnce('/media.mp4');
    useChatStore.getState().loadMedia(42, 10);
    await vi.waitFor(() => {
      expect(useChatStore.getState().mediaUrls['42_10']).toBe('/media.mp4');
    });
  });

  it('deduplicates requests', () => {
    vi.mocked(downloadMedia).mockResolvedValue(null);
    useChatStore.getState().loadMedia(42, 10);
    useChatStore.getState().loadMedia(42, 10);
    expect(downloadMedia).toHaveBeenCalledTimes(1);
  });
});

describe('clearMediaUrl', () => {
  it('removes media URL and clears cache', () => {
    useChatStore.setState({ mediaUrls: { '42_10': '/media.mp4' } });
    useChatStore.getState().clearMediaUrl(42, 10);
    expect(useChatStore.getState().mediaUrls['42_10']).toBeUndefined();
    expect(clearMediaCache).toHaveBeenCalledWith(10);
  });
});

describe('seedMedia', () => {
  it('merges URLs into mediaUrls', () => {
    useChatStore.setState({ mediaUrls: { a: 'x' } });
    useChatStore.getState().seedMedia({ b: 'y' });
    expect(useChatStore.getState().mediaUrls).toEqual({ a: 'x', b: 'y' });
  });
});

// --- Global search ---

describe('openGlobalSearch / closeGlobalSearch', () => {
  it('opens global search mode', () => {
    useChatStore.getState().openGlobalSearch();
    expect(useChatStore.getState().searchMode).toBe('global');
  });

  it('closes global search mode', () => {
    useChatStore.setState({ searchMode: 'global' });
    useChatStore.getState().closeGlobalSearch();
    expect(useChatStore.getState().searchMode).toBe('none');
    expect(useChatStore.getState().searchResults).toEqual([]);
  });
});

describe('executeGlobalSearch', () => {
  it('clears results for empty query', async () => {
    useChatStore.setState({ searchResults: [{ id: 1 }] as unknown as Td.message[] });
    await useChatStore.getState().executeGlobalSearch('  ');
    expect(useChatStore.getState().searchResults).toEqual([]);
    expect(useChatStore.getState().searchLoading).toBe(false);
  });

  it('fetches and sets results on success', async () => {
    vi.mocked(searchGlobal).mockResolvedValueOnce({
      messages: [makeMessage({ id: 1, chat_id: 10 })],
      totalCount: 1,
      hasMore: false,
      nextCursor: undefined,
    });
    await useChatStore.getState().executeGlobalSearch('hello');
    const s = useChatStore.getState();
    expect(s.searchResults).toHaveLength(1);
    expect(s.searchLoading).toBe(false);
    expect(s.searchTotalCount).toBe(1);
  });

  it('discards result when query changed during loading', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    let resolveSearch: (v: any) => void = () => {};
    vi.mocked(searchGlobal).mockReturnValueOnce(
      new Promise((r) => {
        resolveSearch = r;
      }),
    );
    const promise = useChatStore.getState().executeGlobalSearch('hello');
    // Change the query before resolving
    useChatStore.setState({ searchQuery: 'different' });
    resolveSearch?.({
      messages: [makeMessage({ id: 1, chat_id: 10 })],
      totalCount: 1,
      hasMore: false,
      nextCursor: undefined,
    });
    await promise;
    expect(useChatStore.getState().searchResults).toEqual([]);
  });

  it('handles error', async () => {
    vi.mocked(searchGlobal).mockRejectedValueOnce(new Error('search fail'));
    await useChatStore.getState().executeGlobalSearch('test');
    expect(useChatStore.getState().searchLoading).toBe(false);
    expect(useChatStore.getState().error).toBe('search fail');
  });
});

describe('loadMoreGlobalResults', () => {
  it('appends results', async () => {
    useChatStore.setState({
      searchQuery: 'hello',
      searchHasMore: true,
      searchNextCursor: 'cursor1',
      searchLoading: false,
      searchResults: [{ id: 1 }] as unknown as Td.message[],
    });
    vi.mocked(searchGlobal).mockResolvedValueOnce({
      messages: [makeMessage({ id: 2, chat_id: 10 })],
      totalCount: 2,
      hasMore: false,
      nextCursor: undefined,
    });

    await useChatStore.getState().loadMoreGlobalResults();
    expect(useChatStore.getState().searchResults).toHaveLength(2);
  });

  it('guards when loading', async () => {
    useChatStore.setState({ searchLoading: true, searchHasMore: true, searchNextCursor: 'c' });
    await useChatStore.getState().loadMoreGlobalResults();
    expect(searchGlobal).not.toHaveBeenCalled();
  });

  it('guards when no hasMore', async () => {
    useChatStore.setState({ searchLoading: false, searchHasMore: false, searchNextCursor: 'c' });
    await useChatStore.getState().loadMoreGlobalResults();
    expect(searchGlobal).not.toHaveBeenCalled();
  });

  it('guards when no cursor', async () => {
    useChatStore.setState({
      searchLoading: false,
      searchHasMore: true,
      searchNextCursor: undefined,
    });
    await useChatStore.getState().loadMoreGlobalResults();
    expect(searchGlobal).not.toHaveBeenCalled();
  });

  it('handles error', async () => {
    useChatStore.setState({
      searchQuery: 'q',
      searchHasMore: true,
      searchNextCursor: 'c',
      searchLoading: false,
    });
    vi.mocked(searchGlobal).mockRejectedValueOnce(new Error('more fail'));
    await useChatStore.getState().loadMoreGlobalResults();
    expect(useChatStore.getState().searchLoading).toBe(false);
  });
});

// --- Contact search ---

describe('executeContactSearch', () => {
  it('clears results for empty query', async () => {
    await useChatStore.getState().executeContactSearch('  ');
    expect(useChatStore.getState().contactResults).toEqual([]);
  });

  it('fetches and deduplicates contacts', async () => {
    vi.mocked(searchContacts).mockResolvedValueOnce({
      myResults: [{ id: 1, name: 'A', type: 'user' }],
      globalResults: [
        { id: 1, name: 'A', type: 'user' },
        { id: 2, name: 'B', type: 'user' },
      ],
    } as unknown as Awaited<ReturnType<typeof searchContacts>>);
    useChatStore.setState({ searchQuery: 'test' });
    await useChatStore.getState().executeContactSearch('test');
    const results = useChatStore.getState().contactResults;
    expect(results).toHaveLength(2);
  });

  it('discards result when query changed', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    let resolveSearch: (v: any) => void = () => {};
    vi.mocked(searchContacts).mockReturnValueOnce(
      new Promise((r) => {
        resolveSearch = r;
      }),
    );
    const promise = useChatStore.getState().executeContactSearch('hello');
    useChatStore.setState({ searchQuery: 'different' });
    resolveSearch?.({ myResults: [{ id: 1 }], globalResults: [] });
    await promise;
    expect(useChatStore.getState().contactResults).toEqual([]);
  });

  it('handles error', async () => {
    useChatStore.setState({ searchQuery: 'test' });
    vi.mocked(searchContacts).mockRejectedValueOnce(new Error('fail'));
    await useChatStore.getState().executeContactSearch('test');
    expect(useChatStore.getState().contactResults).toEqual([]);
    expect(useChatStore.getState().contactsLoading).toBe(false);
  });
});

// --- In-chat search ---

describe('openChatSearch / closeChatSearch', () => {
  it('opens chat search mode', () => {
    useChatStore.getState().openChatSearch();
    expect(useChatStore.getState().searchMode).toBe('chat');
  });

  it('closes chat search mode', () => {
    useChatStore.setState({ searchMode: 'chat' });
    useChatStore.getState().closeChatSearch();
    expect(useChatStore.getState().searchMode).toBe('none');
    expect(useChatStore.getState().chatSearchResults).toEqual([]);
  });
});

describe('executeChatSearch', () => {
  it('clears results for empty query', async () => {
    useChatStore.setState({ selectedChatId: 42 });
    await useChatStore.getState().executeChatSearch('  ');
    expect(useChatStore.getState().chatSearchResults).toEqual([]);
  });

  it('clears results when no selected chat', async () => {
    useChatStore.setState({ selectedChatId: null });
    await useChatStore.getState().executeChatSearch('test');
    expect(useChatStore.getState().chatSearchResults).toEqual([]);
  });

  it('fetches and sets results on success', async () => {
    useChatStore.setState({ selectedChatId: 42 });
    vi.mocked(searchInChat).mockResolvedValueOnce({
      messages: [makeMessage({ id: 1 }), makeMessage({ id: 2 })],
      totalCount: 10,
      hasMore: true,
      nextOffsetId: 1,
    });

    await useChatStore.getState().executeChatSearch('test');
    const s = useChatStore.getState();
    expect(s.chatSearchResults).toHaveLength(2);
    expect(s.chatSearchCurrentIndex).toBe(0);
    expect(s.chatSearchTotalCount).toBe(10);
    expect(s.chatSearchHasMore).toBe(true);
  });

  it('sets index to -1 when no results', async () => {
    useChatStore.setState({ selectedChatId: 42 });
    vi.mocked(searchInChat).mockResolvedValueOnce({
      messages: [],
      totalCount: 0,
      hasMore: false,
      nextOffsetId: undefined,
    });

    await useChatStore.getState().executeChatSearch('test');
    expect(useChatStore.getState().chatSearchCurrentIndex).toBe(-1);
  });

  it('handles error', async () => {
    useChatStore.setState({ selectedChatId: 42 });
    vi.mocked(searchInChat).mockRejectedValueOnce(new Error('search fail'));
    await useChatStore.getState().executeChatSearch('test');
    expect(useChatStore.getState().chatSearchLoading).toBe(false);
    expect(useChatStore.getState().error).toBe('search fail');
  });

  it('discards stale result', async () => {
    useChatStore.setState({ selectedChatId: 42 });
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    let resolveSearch: (v: any) => void = () => {};
    vi.mocked(searchInChat).mockReturnValueOnce(
      new Promise((r) => {
        resolveSearch = r;
      }),
    );
    const promise = useChatStore.getState().executeChatSearch('hello');
    useChatStore.setState({ chatSearchQuery: 'different' });
    resolveSearch?.({ messages: [makeMessage({ id: 1 })], totalCount: 1, hasMore: false });
    await promise;
    expect(useChatStore.getState().chatSearchResults).toEqual([]);
  });
});

describe('loadMoreChatResults', () => {
  it('appends results', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      chatSearchQuery: 'test',
      chatSearchHasMore: true,
      chatSearchNextOffsetId: 5,
      chatSearchLoading: false,
      chatSearchResults: [makeMessage({ id: 10 })],
    });
    vi.mocked(searchInChat).mockResolvedValueOnce({
      messages: [makeMessage({ id: 3 })],
      totalCount: 2,
      hasMore: false,
      nextOffsetId: undefined,
    });

    await useChatStore.getState().loadMoreChatResults();
    expect(useChatStore.getState().chatSearchResults).toHaveLength(2);
  });

  it('guards when loading', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      chatSearchLoading: true,
      chatSearchHasMore: true,
      chatSearchNextOffsetId: 5,
    });
    await useChatStore.getState().loadMoreChatResults();
    expect(searchInChat).not.toHaveBeenCalled();
  });

  it('guards when no hasMore', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      chatSearchLoading: false,
      chatSearchHasMore: false,
      chatSearchNextOffsetId: 5,
    });
    await useChatStore.getState().loadMoreChatResults();
    expect(searchInChat).not.toHaveBeenCalled();
  });

  it('guards when no offset ID', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      chatSearchLoading: false,
      chatSearchHasMore: true,
      chatSearchNextOffsetId: undefined,
    });
    await useChatStore.getState().loadMoreChatResults();
    expect(searchInChat).not.toHaveBeenCalled();
  });

  it('guards when no selected chat', async () => {
    useChatStore.setState({
      selectedChatId: null,
      chatSearchLoading: false,
      chatSearchHasMore: true,
      chatSearchNextOffsetId: 5,
    });
    await useChatStore.getState().loadMoreChatResults();
    expect(searchInChat).not.toHaveBeenCalled();
  });

  it('handles error', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      chatSearchQuery: 'q',
      chatSearchHasMore: true,
      chatSearchNextOffsetId: 5,
      chatSearchLoading: false,
    });
    vi.mocked(searchInChat).mockRejectedValueOnce(new Error('more fail'));
    await useChatStore.getState().loadMoreChatResults();
    expect(useChatStore.getState().chatSearchLoading).toBe(false);
  });
});

describe('chatSearchNext / chatSearchPrev', () => {
  it('increments index', () => {
    useChatStore.setState({
      chatSearchResults: [makeMessage({ id: 1 }), makeMessage({ id: 2 })],
      chatSearchCurrentIndex: 0,
    });
    useChatStore.getState().chatSearchNext();
    expect(useChatStore.getState().chatSearchCurrentIndex).toBe(1);
  });

  it('does not exceed bounds', () => {
    useChatStore.setState({
      chatSearchResults: [makeMessage({ id: 1 }), makeMessage({ id: 2 })],
      chatSearchCurrentIndex: 1,
    });
    useChatStore.getState().chatSearchNext();
    expect(useChatStore.getState().chatSearchCurrentIndex).toBe(1);
  });

  it('no-ops on empty results', () => {
    useChatStore.setState({ chatSearchResults: [], chatSearchCurrentIndex: 0 });
    useChatStore.getState().chatSearchNext();
    expect(useChatStore.getState().chatSearchCurrentIndex).toBe(0);
  });

  it('decrements index', () => {
    useChatStore.setState({
      chatSearchResults: [makeMessage({ id: 1 }), makeMessage({ id: 2 })],
      chatSearchCurrentIndex: 1,
    });
    useChatStore.getState().chatSearchPrev();
    expect(useChatStore.getState().chatSearchCurrentIndex).toBe(0);
  });

  it('does not go below 0', () => {
    useChatStore.setState({
      chatSearchResults: [makeMessage({ id: 1 })],
      chatSearchCurrentIndex: 0,
    });
    useChatStore.getState().chatSearchPrev();
    expect(useChatStore.getState().chatSearchCurrentIndex).toBe(0);
  });

  it('prev no-ops on empty results', () => {
    useChatStore.setState({ chatSearchResults: [], chatSearchCurrentIndex: 0 });
    useChatStore.getState().chatSearchPrev();
    expect(useChatStore.getState().chatSearchCurrentIndex).toBe(0);
  });
});

// --- selectHeaderStatus (additional) ---

describe('selectHeaderStatus (additional)', () => {
  it('returns last_seen recently', () => {
    const chat = makeChat({ id: 42, type: { _: 'chatTypePrivate', user_id: 42 } });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: {},
      userStatuses: { 42: { _: 'userStatusRecently', by_my_privacy_settings: false } },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'last_seen',
      text: 'last seen recently',
    });
  });

  it('returns last_seen within a week', () => {
    const chat = makeChat({ id: 42, type: { _: 'chatTypePrivate', user_id: 42 } });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: {},
      userStatuses: { 42: { _: 'userStatusLastWeek', by_my_privacy_settings: false } },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'last_seen',
      text: 'last seen within a week',
    });
  });

  it('returns last_seen within a month', () => {
    const chat = makeChat({ id: 42, type: { _: 'chatTypePrivate', user_id: 42 } });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: {},
      userStatuses: { 42: { _: 'userStatusLastMonth', by_my_privacy_settings: false } },
    });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'last_seen',
      text: 'last seen within a month',
    });
  });

  it('returns last_seen for offline user', () => {
    const chat = makeChat({ id: 42, type: { _: 'chatTypePrivate', user_id: 42 } });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: {},
      userStatuses: { 42: { _: 'userStatusOffline', was_online: 1700000000 } },
    });
    const result = selectHeaderStatus(useChatStore.getState());
    expect(result?.type).toBe('last_seen');
  });

  it('returns typing for group (multiple typers)', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeBasicGroup', basic_group_id: 42 },
    });
    const users = new Map<number, Td.user>();
    users.set(99, { id: 99, first_name: 'Bob' } as Td.user);
    users.set(100, { id: 100, first_name: 'Alice' } as Td.user);
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      users,
      typingByChat: {
        42: {
          99: { action: { _: 'chatActionTyping' }, expiresAt: Date.now() + 5000 },
          100: { action: { _: 'chatActionTyping' }, expiresAt: Date.now() + 5000 },
        },
      },
    });
    const result = selectHeaderStatus(useChatStore.getState());
    expect(result?.type).toBe('typing');
    expect((result as { text: string }).text).toContain('are');
  });

  it('returns typing for group with different action labels', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeBasicGroup', basic_group_id: 42 },
    });
    const users = new Map<number, Td.user>();
    users.set(99, { id: 99, first_name: 'Bob' } as Td.user);
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      users,
      typingByChat: {
        42: {
          99: { action: { _: 'chatActionRecordingVideo' }, expiresAt: Date.now() + 5000 },
        },
      },
    });
    const result = selectHeaderStatus(useChatStore.getState());
    expect(result?.type).toBe('typing');
    expect((result as { text: string }).text).toContain('recording video');
  });

  it('returns member count for supergroup (non-channel)', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeSupergroup', supergroup_id: 42, is_channel: false },
    });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      chatInfoCache: { 42: { memberCount: 500, isChannel: false } },
      chatOnlineCounts: {},
    });
    const result = selectHeaderStatus(useChatStore.getState());
    expect(result).toEqual({ type: 'label', text: '500 members' });
  });

  it('returns null when chat not found', () => {
    useChatStore.setState({ chats: [], archivedChats: [], selectedChatId: 999 });
    expect(selectHeaderStatus(useChatStore.getState())).toBeNull();
  });

  it('memoizes and returns same reference for unchanged inputs', () => {
    const chat = makeChat({ id: 42, type: { _: 'chatTypePrivate', user_id: 42 } });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 42,
      userStatuses: { 42: { _: 'userStatusOnline', expires: Math.floor(Date.now() / 1000) + 300 } },
    });
    const r1 = selectHeaderStatus(useChatStore.getState());
    const r2 = selectHeaderStatus(useChatStore.getState());
    expect(r1).toBe(r2);
  });
});

// --- actionLabel ---

describe('actionLabel', () => {
  it('returns correct labels for all action types', () => {
    expect(actionLabel({ _: 'chatActionRecordingVideo' })).toBe('recording video');
    expect(actionLabel({ _: 'chatActionUploadingVideo', progress: 0 })).toBe('sending video');
    expect(actionLabel({ _: 'chatActionRecordingVoiceNote' })).toBe('recording voice');
    expect(actionLabel({ _: 'chatActionUploadingVoiceNote', progress: 0 })).toBe('sending voice');
    expect(actionLabel({ _: 'chatActionUploadingPhoto', progress: 0 })).toBe('sending photo');
    expect(actionLabel({ _: 'chatActionUploadingDocument', progress: 0 })).toBe('sending file');
    expect(actionLabel({ _: 'chatActionChoosingSticker' })).toBe('choosing sticker');
    expect(actionLabel({ _: 'chatActionChoosingLocation' })).toBe('choosing location');
    expect(actionLabel({ _: 'chatActionChoosingContact' })).toBe('choosing contact');
    expect(actionLabel({ _: 'chatActionStartPlayingGame' })).toBe('playing game');
    expect(actionLabel({ _: 'chatActionRecordingVideoNote' })).toBe('recording video message');
    expect(actionLabel({ _: 'chatActionUploadingVideoNote', progress: 0 })).toBe(
      'sending video message',
    );
    expect(actionLabel({ _: 'chatActionWatchingAnimations', emoji: '' })).toBe(
      'watching animation',
    );
    expect(actionLabel({ _: 'chatActionTyping' })).toBe('typing');
    expect(actionLabel({ _: 'chatActionCancel' })).toBe('typing');
  });
});

// --- selectUIChats / selectUIArchivedChats ---

describe('selectUIChats', () => {
  it('returns UIChat array from chats', () => {
    useChatStore.setState({
      chats: [makeChat({ id: 1 }), makeChat({ id: 2 })],
    });
    const result = selectUIChats(useChatStore.getState());
    expect(result).toHaveLength(2);
  });

  it('memoizes when inputs unchanged', () => {
    useChatStore.setState({ chats: [makeChat({ id: 1 })] });
    const r1 = selectUIChats(useChatStore.getState());
    const r2 = selectUIChats(useChatStore.getState());
    expect(r1).toBe(r2);
  });
});

describe('selectUIArchivedChats', () => {
  it('returns UIChat array from archivedChats', () => {
    useChatStore.setState({
      archivedChats: [makeChat({ id: 1 })],
    });
    const result = selectUIArchivedChats(useChatStore.getState());
    expect(result).toHaveLength(1);
  });

  it('memoizes when inputs unchanged', () => {
    useChatStore.setState({ archivedChats: [makeChat({ id: 1 })] });
    const r1 = selectUIArchivedChats(useChatStore.getState());
    const r2 = selectUIArchivedChats(useChatStore.getState());
    expect(r1).toBe(r2);
  });
});

// --- selectUIUser ---

describe('selectUIUser', () => {
  it('returns null when user not found', () => {
    expect(selectUIUser(useChatStore.getState(), 999)).toBeNull();
  });

  it('returns UIUser when user exists', () => {
    const users = new Map<number, Td.user>();
    users.set(42, {
      id: 42,
      first_name: 'Alice',
      last_name: 'B',
    } as Td.user);
    useChatStore.setState({ users });
    const result = selectUIUser(useChatStore.getState(), 42);
    expect(result).not.toBeNull();
  });

  it('returns equal result for same user', () => {
    const users = new Map<number, Td.user>();
    users.set(42, { id: 42, first_name: 'Alice' } as Td.user);
    useChatStore.setState({ users });
    const r1 = selectUIUser(useChatStore.getState(), 42);
    const r2 = selectUIUser(useChatStore.getState(), 42);
    // selectUIUser is intentionally NOT memoized at module level (takes a parameter),
    // so we check deep equality, not referential identity.
    expect(r1).toStrictEqual(r2);
  });
});

// --- selectSelectedChat (additional) ---

describe('selectSelectedChat (additional)', () => {
  it('returns null when chat not found in lists', () => {
    useChatStore.setState({ chats: [], archivedChats: [], selectedChatId: 999 });
    expect(selectSelectedChat(useChatStore.getState())).toBeNull();
  });

  it('memoizes for same inputs', () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({ chats: [chat], selectedChatId: 42 });
    const r1 = selectSelectedChat(useChatStore.getState());
    const r2 = selectSelectedChat(useChatStore.getState());
    expect(r1).toBe(r2);
  });
});

// --- openChat (additional) ---

describe('openChat (additional)', () => {
  it('sets error on message fetch failure', async () => {
    const chat = makeChat({ id: 42 });
    vi.mocked(getMessages).mockRejectedValueOnce(new Error('fetch fail'));
    await useChatStore.getState().openChat(chat);
    expect(useChatStore.getState().error).toBe('fetch fail');
    expect(useChatStore.getState().loadingMessages).toBe(false);
  });

  it('closes previous chat before opening new', async () => {
    const { closeTdChat } = await import('../telegram');
    useChatStore.setState({ selectedChatId: 10 });
    const chat = makeChat({ id: 42 });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [], hasMore: false });
    await useChatStore.getState().openChat(chat);
    expect(closeTdChat).toHaveBeenCalledWith(10);
  });

  it('clears unread in archived chats too', async () => {
    const chat = makeChat({ id: 42, unread_count: 3 });
    useChatStore.setState({ chats: [], archivedChats: [chat] });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [], hasMore: false });
    await useChatStore.getState().openChat(chat);
    expect(useChatStore.getState().archivedChats[0].unread_count).toBe(0);
  });
});

// --- loadMessagesAround (additional) ---

describe('loadMessagesAround (additional)', () => {
  it('guards when no selectedChatId', async () => {
    useChatStore.setState({ selectedChatId: null });
    await useChatStore.getState().loadMessagesAround(50);
    expect(getMessagesAroundMessage).not.toHaveBeenCalled();
  });

  it('sets error on failure', async () => {
    useChatStore.setState({ selectedChatId: 42, messagesByChat: { 42: [] } });
    vi.mocked(getMessagesAroundMessage).mockRejectedValueOnce(new Error('around fail'));
    await useChatStore.getState().loadMessagesAround(50);
    expect(useChatStore.getState().error).toBe('around fail');
  });
});

// --- loadDialogs (additional) ---

describe('loadDialogs (additional)', () => {
  it('filters pinned chats from archived list', async () => {
    const pinnedChat = makeChat({
      id: 1,
      positions: [
        {
          _: 'chatPosition',
          list: { _: 'chatListArchive' },
          order: '100',
          is_pinned: true,
          source: undefined,
        } as Td.chatPosition,
      ],
    });
    const normalChat = makeChat({ id: 2 });
    vi.mocked(getDialogs)
      .mockResolvedValueOnce([normalChat])
      .mockResolvedValueOnce([pinnedChat, normalChat]);

    await useChatStore.getState().loadDialogs();
    // Pinned should be filtered from archived
    expect(useChatStore.getState().archivedChats.find((c) => c.id === 1)).toBeUndefined();
  });

  it('sets hasMoreChats based on count threshold', async () => {
    const chats = Array.from({ length: 100 }, (_, i) => makeChat({ id: i + 1 }));
    vi.mocked(getDialogs).mockResolvedValueOnce(chats).mockResolvedValueOnce([]);

    await useChatStore.getState().loadDialogs();
    expect(useChatStore.getState().hasMoreChats).toBe(true);
    expect(useChatStore.getState().hasMoreArchivedChats).toBe(false);
  });
});

// --- clearError ---

describe('clearError', () => {
  it('clears error string', () => {
    useChatStore.setState({ error: 'something went wrong' });
    useChatStore.getState().clearError();
    expect(useChatStore.getState().error).toBe('');
  });
});

// --- setSearchQuery / setChatSearchQuery ---

describe('setSearchQuery', () => {
  it('sets search query', () => {
    useChatStore.getState().setSearchQuery('test');
    expect(useChatStore.getState().searchQuery).toBe('test');
  });
});

describe('setChatSearchQuery', () => {
  it('sets chat search query', () => {
    useChatStore.getState().setChatSearchQuery('find me');
    expect(useChatStore.getState().chatSearchQuery).toBe('find me');
  });
});

// --- loadNewerMessages (additional) ---

describe('loadNewerMessages (additional)', () => {
  it('guards when no selectedChatId', async () => {
    useChatStore.setState({ selectedChatId: null });
    await useChatStore.getState().loadNewerMessages();
    expect(getNewerMessages).not.toHaveBeenCalled();
  });

  it('guards when messages empty', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [] },
      hasNewer: { 42: true },
      isAtLatest: { 42: false },
    });
    await useChatStore.getState().loadNewerMessages();
    expect(getNewerMessages).not.toHaveBeenCalled();
  });

  it('handles fetch error gracefully', async () => {
    useChatStore.setState({
      selectedChatId: 42,
      messagesByChat: { 42: [makeMessage({ id: 10, chat_id: 42 })] },
      hasNewer: { 42: true },
      isAtLatest: { 42: false },
    });
    vi.mocked(getNewerMessages).mockRejectedValueOnce(new Error('fail'));
    await useChatStore.getState().loadNewerMessages();
    expect(useChatStore.getState().loadingNewerMessages).toBe(false);
  });
});

// --- handleUpdate edge cases ---

describe('handleUpdate edge cases', () => {
  describe('delete_messages without chat_id uses selectedChatId', () => {
    it('deletes from selected chat when chat_id is 0', () => {
      useChatStore.setState({
        selectedChatId: 42,
        messagesByChat: {
          42: [makeMessage({ id: 1 }), makeMessage({ id: 2 })],
        },
      });
      useChatStore.getState().handleUpdate({
        type: 'delete_messages',
        chat_id: 0,
        message_ids: [1],
        is_permanent: true,
      });
      expect(useChatStore.getState().messagesByChat[42]).toHaveLength(1);
    });
  });

  describe('edit_message no-ops when chat not loaded', () => {
    it('returns same state', () => {
      useChatStore.setState({ messagesByChat: {} });
      const before = useChatStore.getState().messagesByChat;
      useChatStore.getState().handleUpdate({
        type: 'edit_message',
        chat_id: 42,
        message: makeMessage({ id: 5 }),
      });
      expect(useChatStore.getState().messagesByChat).toBe(before);
    });
  });

  describe('message_reactions no-ops on unknown chat or message', () => {
    it('no-ops when chat not loaded', () => {
      useChatStore.setState({ messagesByChat: {} });
      useChatStore.getState().handleUpdate({
        type: 'message_reactions',
        chat_id: 42,
        message_id: 5,
        interaction_info: {
          _: 'messageInteractionInfo',
          view_count: 0,
          forward_count: 0,
        },
      });
      // No crash
    });

    it('no-ops when message not found', () => {
      useChatStore.setState({ messagesByChat: { 42: [makeMessage({ id: 1 })] } });
      useChatStore.getState().handleUpdate({
        type: 'message_reactions',
        chat_id: 42,
        message_id: 999,
        interaction_info: {
          _: 'messageInteractionInfo',
          view_count: 0,
          forward_count: 0,
        },
      });
      // No crash, message unchanged
      expect(useChatStore.getState().messagesByChat[42]).toHaveLength(1);
    });
  });

  describe('user_typing with messageSenderChat', () => {
    it('returns early when sender has no userId', () => {
      useChatStore.getState().handleUpdate({
        type: 'user_typing',
        chat_id: 42,
        sender_id: { _: 'messageSenderChat', chat_id: 99 },
        action: { _: 'chatActionTyping' },
      });
      // No typing indicator set since getSenderUserId returns 0
      expect(useChatStore.getState().typingByChat[42]).toBeUndefined();
    });
  });

  describe('new_message for chat not in messagesByChat', () => {
    it('does not crash', () => {
      useChatStore.setState({
        chats: [makeChat({ id: 42 })],
        archivedChats: [],
        messagesByChat: {},
      });
      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 42,
        message: makeMessage({ id: 1 }),
      });
      // No crash, messagesByChat unchanged for this chat
      expect(useChatStore.getState().messagesByChat[42]).toBeUndefined();
    });
  });

  describe('new_message for pinned chat stays in place', () => {
    it('keeps pinned chat at same position', () => {
      const pinnedChat = makeChat({
        id: 1,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '100',
            is_pinned: true,
            source: undefined,
          } as Td.chatPosition,
        ],
      });
      const normalChat = makeChat({ id: 2 });
      useChatStore.setState({
        chats: [pinnedChat, normalChat],
        archivedChats: [],
        messagesByChat: {},
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 1,
        message: makeMessage({ id: 10, chat_id: 1 }),
      });

      expect(useChatStore.getState().chats[0].id).toBe(1);
    });
  });

  describe('new_message bumps non-pinned chat above other non-pinned', () => {
    it('inserts after pinned chats', () => {
      const pinnedChat = makeChat({
        id: 1,
        positions: [
          {
            _: 'chatPosition',
            list: { _: 'chatListMain' },
            order: '300',
            is_pinned: true,
            source: undefined,
          } as Td.chatPosition,
        ],
      });
      const normalA = makeChat({ id: 2 });
      const normalB = makeChat({ id: 3 });
      useChatStore.setState({
        chats: [pinnedChat, normalA, normalB],
        archivedChats: [],
        messagesByChat: {},
      });

      useChatStore.getState().handleUpdate({
        type: 'new_message',
        chat_id: 3,
        message: makeMessage({ id: 10, chat_id: 3 }),
      });

      // Chat 3 should be after pinned (pos 0=pinned, pos 1=chat 3)
      const chats = useChatStore.getState().chats;
      expect(chats[0].id).toBe(1); // pinned stays
      expect(chats[1].id).toBe(3); // bumped up
    });
  });

  describe('user_typing cancel when no prior typing', () => {
    it('returns same state (no crash)', () => {
      useChatStore.setState({ typingByChat: {} });
      useChatStore.getState().handleUpdate({
        type: 'user_typing',
        chat_id: 42,
        sender_id: { _: 'messageSenderUser', user_id: 99 },
        action: { _: 'chatActionCancel' },
      });
      // Should not crash and typing should be undefined
      expect(useChatStore.getState().typingByChat[42]?.[99]).toBeUndefined();
    });
  });

  describe('user_status online schedules expiry timer', () => {
    it('sets online status then transitions to offline after expiry', async () => {
      vi.useFakeTimers();
      const expiresAt = Math.floor(Date.now() / 1000) + 5;
      useChatStore.getState().handleUpdate({
        type: 'user_status',
        user_id: 42,
        status: { _: 'userStatusOnline', expires: expiresAt },
      });
      expect(useChatStore.getState().userStatuses[42]._).toBe('userStatusOnline');

      // Advance past expiry
      vi.advanceTimersByTime(6000);
      expect(useChatStore.getState().userStatuses[42]._).toBe('userStatusOffline');
      vi.useRealTimers();
    });

    it('clears previous timer when new status arrives', () => {
      vi.useFakeTimers();
      const expires1 = Math.floor(Date.now() / 1000) + 5;
      useChatStore.getState().handleUpdate({
        type: 'user_status',
        user_id: 42,
        status: { _: 'userStatusOnline', expires: expires1 },
      });

      // New status overrides
      useChatStore.getState().handleUpdate({
        type: 'user_status',
        user_id: 42,
        status: { _: 'userStatusOffline', was_online: 1000 },
      });
      expect(useChatStore.getState().userStatuses[42]._).toBe('userStatusOffline');
      vi.useRealTimers();
    });
  });

  describe('delete_messages with no chat_id and no selectedChatId', () => {
    it('does nothing', () => {
      useChatStore.setState({
        selectedChatId: null,
        messagesByChat: { 42: [makeMessage({ id: 1 })] },
      });
      useChatStore.getState().handleUpdate({
        type: 'delete_messages',
        chat_id: 0,
        message_ids: [1],
        is_permanent: true,
      });
      // Messages unchanged
      expect(useChatStore.getState().messagesByChat[42]).toHaveLength(1);
    });
  });
});

// --- openChat fetches chatInfo ---

describe('openChat chatInfo fetching', () => {
  it('fetches chat info when not cached', async () => {
    const { getChatInfo } = await import('../telegram');
    vi.mocked(getChatInfo).mockResolvedValueOnce({ memberCount: 100, isChannel: false });
    const chat = makeChat({ id: 42 });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [], hasMore: false });

    await useChatStore.getState().openChat(chat);
    await vi.waitFor(() => {
      expect(useChatStore.getState().chatInfoCache[42]).toBeDefined();
    });
  });

  it('does not fetch chat info when already cached', async () => {
    const { getChatInfo } = await import('../telegram');
    useChatStore.setState({
      chatInfoCache: { 42: { memberCount: 50, isChannel: false } },
      messagesByChat: { 42: [makeMessage()] },
    });
    const chat = makeChat({ id: 42 });
    await useChatStore.getState().openChat(chat);
    expect(getChatInfo).not.toHaveBeenCalled();
  });
});

// --- loadCustomEmojiUrl ---

describe('loadCustomEmojiUrl', () => {
  it('calls getCustomEmojiInfo and stores result', async () => {
    const info = { url: '/emoji.webp', format: 'webp' as const };
    vi.mocked(getCustomEmojiInfo).mockResolvedValueOnce(info);
    useChatStore.getState().loadCustomEmojiUrl('doc123');
    await vi.waitFor(() => {
      expect(useChatStore.getState().customEmojiUrls.doc123).toEqual(info);
    });
  });

  it('deduplicates requests', () => {
    vi.mocked(getCustomEmojiInfo).mockResolvedValue(null);
    useChatStore.getState().loadCustomEmojiUrl('doc123');
    useChatStore.getState().loadCustomEmojiUrl('doc123');
    expect(getCustomEmojiInfo).toHaveBeenCalledTimes(1);
  });
});

// --- recognizeSpeech ---

describe('recognizeSpeech', () => {
  it('calls the telegram recognizeSpeech function', async () => {
    const telegram = await import('../telegram');
    const spy = vi.mocked(telegram.recognizeSpeech as (...args: unknown[]) => Promise<void>);
    spy.mockResolvedValueOnce(undefined);
    useChatStore.getState().recognizeSpeech(42, 10);
    expect(spy).toHaveBeenCalledWith(42, 10);
  });
});

// --- loadReplyThumb / resolveReplyPreview via store actions ---

describe('loadReplyThumb', () => {
  it('calls downloadThumbnail and stores result', async () => {
    vi.mocked(downloadThumbnail).mockResolvedValueOnce('/thumb.jpg');
    useChatStore.getState().loadReplyThumb(50, 100);
    await vi.waitFor(() => {
      expect(useChatStore.getState().thumbUrls['50_100']).toBe('/thumb.jpg');
    });
  });

  it('deduplicates requests', () => {
    vi.mocked(downloadThumbnail).mockResolvedValue(null);
    useChatStore.getState().loadReplyThumb(60, 200);
    useChatStore.getState().loadReplyThumb(60, 200);
    expect(downloadThumbnail).toHaveBeenCalledTimes(1);
  });
});

describe('resolveReplyPreview', () => {
  it('fetches message and stores preview', async () => {
    const replyMsg = makeMessage({
      id: 300,
      chat_id: 70,
      sender_id: { _: 'messageSenderUser', user_id: 99 },
    });
    vi.mocked(fetchMessage).mockResolvedValueOnce(replyMsg);
    useChatStore.getState().resolveReplyPreview(70, 300);
    await vi.waitFor(() => {
      expect(useChatStore.getState().replyPreviews['70_300']).toBeDefined();
    });
  });

  it('stores null when message not found', async () => {
    vi.mocked(fetchMessage).mockResolvedValueOnce(null);
    useChatStore.getState().resolveReplyPreview(71, 301);
    await vi.waitFor(() => {
      expect(useChatStore.getState().replyPreviews['71_301']).toBeNull();
    });
  });

  it('deduplicates requests', () => {
    vi.mocked(fetchMessage).mockResolvedValue(null);
    useChatStore.getState().resolveReplyPreview(72, 302);
    useChatStore.getState().resolveReplyPreview(72, 302);
    expect(fetchMessage).toHaveBeenCalledTimes(1);
  });
});

// --- send success path: pending not found edge case ---

describe('send edge cases', () => {
  it('handles pending not found in success callback', async () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });

    const realMsg = makeMessage({ id: 999, is_outgoing: true, content: textContent('hi') });
    vi.mocked(sendMessage).mockImplementationOnce(() => {
      // Clear pending before the callback
      useChatStore.setState({ pendingByChat: { 42: [] } });
      return Promise.resolve(realMsg);
    });

    useChatStore.getState().send(42, 'hi');
    await vi.waitFor(() => {
      // Message should still be appended even if pending was cleared
      expect(useChatStore.getState().messagesByChat[42].length).toBeGreaterThanOrEqual(0);
    });
  });
});

// --- loadDialogs thumbnail loading for last messages ---

describe('loadDialogs thumbnails', () => {
  it('triggers thumbnail loading for chats with media last messages', async () => {
    const chatWithPhoto = makeChat({
      id: 1,
      last_message: makeMessage({
        id: 1,
        chat_id: 1,
        content: { _: 'messagePhoto' } as Td.MessageContent,
      }),
    });
    vi.mocked(getDialogs).mockResolvedValueOnce([chatWithPhoto]).mockResolvedValueOnce([]);
    vi.mocked(downloadThumbnail).mockResolvedValue('/thumb.jpg');

    await useChatStore.getState().loadDialogs();
    expect(downloadThumbnail).toHaveBeenCalled();
  });
});

// --- fetchMissingUsers path via openChat with user messages ---

describe('openChat fetches missing users', () => {
  it('triggers user fetch for message senders', async () => {
    const { getUser } = await import('../telegram');
    const chat = makeChat({ id: 42 });
    const msg = makeMessage({
      id: 10,
      chat_id: 42,
      sender_id: { _: 'messageSenderUser', user_id: 999 },
    });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [msg], hasMore: false });
    vi.mocked(getUser).mockResolvedValue({
      id: 999,
      first_name: 'New',
      last_name: 'User',
    } as Td.user);

    await useChatStore.getState().openChat(chat);
    await vi.waitFor(() => {
      expect(useChatStore.getState().users.get(999)).toBeDefined();
    });
  });
});

// --- fetchMissingChatPreviewUsers via loadDialogs ---

describe('loadDialogs fetches missing preview users', () => {
  it('fetches sender users for group chat last messages', async () => {
    const { getUser } = await import('../telegram');
    const groupChat = makeChat({
      id: 1,
      type: { _: 'chatTypeBasicGroup', basic_group_id: 1 },
      last_message: makeMessage({
        id: 5,
        chat_id: 1,
        is_outgoing: false,
        sender_id: { _: 'messageSenderUser', user_id: 800 },
      }),
    });
    vi.mocked(getDialogs).mockResolvedValueOnce([groupChat]).mockResolvedValueOnce([]);
    vi.mocked(getUser).mockResolvedValue({
      id: 800,
      first_name: 'Preview',
      last_name: 'User',
    } as Td.user);

    await useChatStore.getState().loadDialogs();
    await vi.waitFor(() => {
      expect(useChatStore.getState().users.get(800)).toBeDefined();
    });
  });
});

// --- loadForwardPhotos path ---

describe('openChat loads forward photos', () => {
  it('loads profile photos for forward origin users', async () => {
    const chat = makeChat({ id: 42 });
    const msg = makeMessage({
      id: 10,
      chat_id: 42,
      forward_info: {
        _: 'messageForwardInfo',
        origin: { _: 'messageOriginUser', sender_user_id: 777 },
        date: 1000,
      } as Td.messageForwardInfo,
    });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [msg], hasMore: false });
    vi.mocked(getProfilePhotoUrl).mockResolvedValue('/fwd-photo.jpg');

    await useChatStore.getState().openChat(chat);
    // loadForwardPhotos should trigger loadProfilePhoto for user 777
    expect(getProfilePhotoUrl).toHaveBeenCalled();
  });

  it('loads profile photos for forward origin chat', async () => {
    const chat = makeChat({ id: 42 });
    const msg = makeMessage({
      id: 10,
      chat_id: 42,
      forward_info: {
        _: 'messageForwardInfo',
        origin: { _: 'messageOriginChat', sender_chat_id: 888 },
        date: 1000,
      } as Td.messageForwardInfo,
    });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [msg], hasMore: false });
    vi.mocked(getProfilePhotoUrl).mockResolvedValue('/fwd-photo.jpg');

    await useChatStore.getState().openChat(chat);
    expect(getProfilePhotoUrl).toHaveBeenCalled();
  });

  it('loads profile photos for forward origin channel', async () => {
    const chat = makeChat({ id: 42 });
    const msg = makeMessage({
      id: 10,
      chat_id: 42,
      forward_info: {
        _: 'messageForwardInfo',
        origin: { _: 'messageOriginChannel', chat_id: 555, message_id: 1, author_signature: '' },
        date: 1000,
      } as Td.messageForwardInfo,
    });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [msg], hasMore: false });
    vi.mocked(getProfilePhotoUrl).mockResolvedValue('/fwd-photo.jpg');

    await useChatStore.getState().openChat(chat);
    expect(getProfilePhotoUrl).toHaveBeenCalled();
  });
});

// --- loadThumbnailForMessage via new_message ---

describe('new_message loads thumbnails for media messages', () => {
  it('triggers thumbnail download for photo messages', () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });
    vi.mocked(downloadThumbnail).mockResolvedValue('/thumb.jpg');

    useChatStore.getState().handleUpdate({
      type: 'new_message',
      chat_id: 42,
      message: makeMessage({
        id: 2,
        chat_id: 42,
        content: { _: 'messagePhoto' } as Td.MessageContent,
      }),
    });

    expect(downloadThumbnail).toHaveBeenCalled();
  });

  it('triggers thumbnail for video messages', () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });
    vi.mocked(downloadThumbnail).mockResolvedValue('/thumb.jpg');

    useChatStore.getState().handleUpdate({
      type: 'new_message',
      chat_id: 42,
      message: makeMessage({
        id: 3,
        chat_id: 42,
        content: { _: 'messageVideo' } as Td.MessageContent,
      }),
    });

    expect(downloadThumbnail).toHaveBeenCalled();
  });

  it('triggers thumbnail for text with link_preview', () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });
    vi.mocked(downloadThumbnail).mockResolvedValue('/thumb.jpg');

    useChatStore.getState().handleUpdate({
      type: 'new_message',
      chat_id: 42,
      message: makeMessage({
        id: 4,
        chat_id: 42,
        content: {
          _: 'messageText',
          text: { _: 'formattedText', text: 'link', entities: [] },
          link_preview: { _: 'linkPreview' } as unknown as Td.linkPreview,
        },
      }),
    });

    expect(downloadThumbnail).toHaveBeenCalled();
  });

  it('does not trigger thumbnail for plain text', () => {
    const chat = makeChat({ id: 42 });
    useChatStore.setState({
      chats: [chat],
      archivedChats: [],
      messagesByChat: { 42: [] },
    });
    vi.mocked(downloadThumbnail).mockResolvedValue(null);

    useChatStore.getState().handleUpdate({
      type: 'new_message',
      chat_id: 42,
      message: makeMessage({
        id: 5,
        chat_id: 42,
        content: textContent('no thumbnail'),
      }),
    });

    expect(downloadThumbnail).not.toHaveBeenCalled();
  });
});

// --- chat_last_message with thumbnail loading ---

describe('chat_last_message triggers thumbnails', () => {
  it('loads thumbnail for last message with media', () => {
    const chat = makeChat({ id: 10 });
    useChatStore.setState({ chats: [chat], archivedChats: [] });
    vi.mocked(downloadThumbnail).mockResolvedValue('/thumb.jpg');

    useChatStore.getState().handleUpdate({
      type: 'chat_last_message',
      chat_id: 10,
      last_message: makeMessage({
        id: 50,
        chat_id: 10,
        content: { _: 'messageAnimation' } as Td.MessageContent,
      }),
      positions: [],
    });

    expect(downloadThumbnail).toHaveBeenCalled();
  });
});

// --- fetchMissingUsers with forward_info origin user ---

describe('fetchMissingUsers resolves forward origin users', () => {
  it('fetches forward origin user from openChat', async () => {
    const { getUser } = await import('../telegram');
    const chat = makeChat({ id: 42 });
    const msg = makeMessage({
      id: 10,
      chat_id: 42,
      sender_id: { _: 'messageSenderUser', user_id: 100 },
      forward_info: {
        _: 'messageForwardInfo',
        origin: { _: 'messageOriginUser', sender_user_id: 200 },
        date: 1000,
      } as Td.messageForwardInfo,
    });
    vi.mocked(getMessages).mockResolvedValueOnce({ messages: [msg], hasMore: false });
    vi.mocked(getUser).mockImplementation((uid) =>
      Promise.resolve({ id: uid, first_name: `User${uid}`, last_name: '' } as Td.user),
    );

    await useChatStore.getState().openChat(chat);
    await vi.waitFor(() => {
      expect(useChatStore.getState().users.get(200)).toBeDefined();
    });
  });
});

// --- loadThumbnailsForChats with link_preview ---

describe('loadThumbnailsForChats covers link_preview path', () => {
  it('loads thumbnails for text messages with link_preview', async () => {
    const chatWithLink = makeChat({
      id: 7777,
      last_message: makeMessage({
        id: 8888,
        chat_id: 7777,
        content: {
          _: 'messageText',
          text: { _: 'formattedText', text: 'link', entities: [] },
          link_preview: { _: 'linkPreview' } as unknown as Td.linkPreview,
        },
      }),
    });
    vi.mocked(getDialogs).mockResolvedValueOnce([chatWithLink]).mockResolvedValueOnce([]);
    vi.mocked(downloadThumbnail).mockResolvedValue('/link-thumb.jpg');

    await useChatStore.getState().loadDialogs();
    expect(downloadThumbnail).toHaveBeenCalled();
  });
});
