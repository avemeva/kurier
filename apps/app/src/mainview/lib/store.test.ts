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
  getMe: vi.fn(() => Promise.resolve({ id: 42, first_name: 'Test' })),
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
