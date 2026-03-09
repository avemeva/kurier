import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Td } from '@/lib/types';

// Mock modules before importing store
vi.mock('./log', () => {
  const noop = () => {};
  return {
    log: { debug: noop, info: noop, warn: noop, error: noop },
    telegramLog: { debug: noop, info: noop, warn: noop, error: noop },
  };
});

vi.mock('./telegram', () => ({
  getDialogs: vi.fn(),
  getMessages: vi.fn(),
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
}));

import {
  _resetForTests,
  type PendingMessage,
  selectChatMessages,
  selectHeaderStatus,
  selectSelectedChat,
  useChatStore,
} from './store';
import {
  getDialogs,
  getMessages,
  getProfilePhotoUrl,
  markAsRead,
  sendMessage,
  sendReaction,
} from './telegram';

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

  it('returns Group label for basic group', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeBasicGroup', basic_group_id: 42 },
    });
    useChatStore.setState({ chats: [chat], selectedChatId: 42 });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'label',
      text: 'Group',
    });
  });

  it('returns Channel label for supergroup channel', () => {
    const chat = makeChat({
      id: 42,
      type: { _: 'chatTypeSupergroup', supergroup_id: 42, is_channel: true },
    });
    useChatStore.setState({ chats: [chat], selectedChatId: 42 });
    expect(selectHeaderStatus(useChatStore.getState())).toEqual({
      type: 'label',
      text: 'Channel',
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
