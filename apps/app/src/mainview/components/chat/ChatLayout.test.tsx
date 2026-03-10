import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Td } from '@/lib/types';

// Mock modules before importing store
vi.mock('@/lib/log', () => {
  const noop = () => {};
  return {
    log: { debug: noop, info: noop, warn: noop, error: noop },
    telegramLog: { debug: noop, info: noop, warn: noop, error: noop },
  };
});

vi.mock('@/lib/telegram', () => ({
  getDialogs: vi.fn(),
  getMessages: vi.fn(),
  getProfilePhotoUrl: vi.fn(() => Promise.resolve(null)),
  sendMessage: vi.fn(),
  sendReaction: vi.fn(),
  markAsRead: vi.fn(),
  onUpdate: vi.fn(() => () => {}),
  formatTime: vi.fn(() => '12:00'),
  formatLastSeen: vi.fn((ts: number) => `last seen at ${ts}`),
  extractMessagePreview: vi.fn((msg: Td.message | undefined) => {
    if (!msg) return '';
    if (msg.content._ === 'messageText') return msg.content.text.text;
    return '';
  }),
  getMessageText: vi.fn((msg: Td.message) => {
    if (msg.content._ === 'messageText') return msg.content.text.text;
    return '';
  }),
  getMessageEntities: vi.fn((msg: Td.message) => {
    if (msg.content._ === 'messageText') return msg.content.text.entities ?? [];
    return [];
  }),
  getMediaTypeLabel: vi.fn(() => ''),
  getSenderUserId: vi.fn((sender: Td.MessageSender) =>
    sender._ === 'messageSenderUser' ? sender.user_id : 0,
  ),
  searchContacts: vi.fn(),
  searchGlobal: vi.fn(),
  searchInChat: vi.fn(),
  getCustomEmojiUrl: vi.fn(() => Promise.resolve(null)),
  downloadMedia: vi.fn(() => Promise.resolve(null)),
  clearMediaCache: vi.fn(),
  getMe: vi.fn(() => Promise.resolve({ id: 42, first_name: 'Test' })),
}));

vi.mock('@/lib/types', async () => {
  const actual = await vi.importActual('@/lib/types');
  return {
    ...actual,
    groupUIMessages: (items: unknown[]) => items.map((m) => ({ type: 'single', message: m })),
  };
});

// Mock child components that do heavy lifting
vi.mock('./AlbumGrid', () => ({
  AlbumGrid: () => null,
}));
vi.mock('./EmojiStatusBadge', () => ({ EmojiStatusBadge: () => null }));
vi.mock('./FormattedText', () => ({
  FormattedText: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock('./Message', () => ({
  Message: ({ input }: { input: { kind: string; message?: { isRead?: boolean } } }) => {
    const msg = input.kind === 'single' ? input.message : undefined;
    return <div data-testid="bubble" data-read={msg?.isRead ?? false} />;
  },
}));

import { _resetForTests, useChatStore } from '@/lib/store';
import { ChatLayout } from './ChatLayout';

function makeChat(overrides: Partial<Td.chat> = {}): Td.chat {
  return {
    _: 'chat',
    id: 123,
    title: 'Test User',
    type: { _: 'chatTypePrivate', user_id: 123 },
    photo: undefined,
    permissions: {} as Td.chatPermissions,
    last_message: undefined,
    positions: [],
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
    unread_count: 0,
    last_read_inbox_message_id: 0,
    last_read_outbox_message_id: 0,
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

beforeEach(() => {
  _resetForTests();
});

describe('ChatLayout UI updates', () => {
  it('shows online status in header when user_status event arrives', () => {
    const chat = makeChat({
      id: 100,
      title: 'Alice',
      type: { _: 'chatTypePrivate', user_id: 100 },
    });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 100,
      messagesByChat: { 100: [makeMessage()] },
      loadingDialogs: false,
      loadingMessages: false,
      userStatuses: {},
    });

    const { container } = render(<ChatLayout onLogout={() => {}} />);

    // Before: no "online" text
    expect(container.textContent).not.toContain('online');

    // Fire user_status event through the store
    act(() => {
      useChatStore.getState().handleUpdate({
        type: 'user_status',
        user_id: 100,
        status: { _: 'userStatusOnline', expires: Math.floor(Date.now() / 1000) + 300 },
      });
    });

    // After: "online" should appear in header
    expect(container.textContent).toContain('online');
  });

  it('shows online dot in sidebar when user goes online', () => {
    const chat = makeChat({
      id: 100,
      type: { _: 'chatTypePrivate', user_id: 100 },
    });
    useChatStore.setState({
      chats: [chat],
      loadingDialogs: false,
      userStatuses: {},
    });

    const { container } = render(<ChatLayout onLogout={() => {}} />);

    // Before: no green dot
    expect(container.querySelector('.bg-online')).toBeNull();

    act(() => {
      useChatStore.getState().handleUpdate({
        type: 'user_status',
        user_id: 100,
        status: { _: 'userStatusOnline', expires: Math.floor(Date.now() / 1000) + 300 },
      });
    });

    // After: green dot should appear
    expect(container.querySelector('.bg-online')).not.toBeNull();
  });

  it('shows typing indicator in sidebar when user starts typing', () => {
    const chat = makeChat({ id: 100 });
    useChatStore.setState({
      chats: [chat],
      loadingDialogs: false,
      typingByChat: {},
    });

    const { container } = render(<ChatLayout onLogout={() => {}} />);

    act(() => {
      useChatStore.getState().handleUpdate({
        type: 'user_typing',
        chat_id: 100,
        sender_id: { _: 'messageSenderUser', user_id: 100 },
        action: { _: 'chatActionTyping' },
      });
    });

    // After: shows "typing" instead
    expect(container.textContent).toContain('typing');
  });

  it('shows typing status in header for selected DM chat', () => {
    const chat = makeChat({
      id: 100,
      type: { _: 'chatTypePrivate', user_id: 100 },
    });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 100,
      messagesByChat: { 100: [makeMessage()] },
      loadingDialogs: false,
      loadingMessages: false,
      typingByChat: {},
    });

    const { container } = render(<ChatLayout onLogout={() => {}} />);

    act(() => {
      useChatStore.getState().handleUpdate({
        type: 'user_typing',
        chat_id: 100,
        sender_id: { _: 'messageSenderUser', user_id: 100 },
        action: { _: 'chatActionTyping' },
      });
    });

    // "typing" should appear in header
    expect(container.textContent).toContain('typing');
  });

  it('updates read checkmarks when read_outbox event arrives', () => {
    const chat = makeChat({ id: 100, last_read_outbox_message_id: 10 });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 100,
      messagesByChat: {
        100: [
          makeMessage({
            id: 50,
            is_outgoing: true,
            content: {
              _: 'messageText',
              text: { _: 'formattedText', text: 'my message', entities: [] },
            },
          }),
        ],
      },
      loadingDialogs: false,
      loadingMessages: false,
    });

    const { container } = render(<ChatLayout onLogout={() => {}} />);

    // Before: message 50 is NOT read (maxId=10 < 50)
    const bubbleBefore = container.querySelector("[data-testid='bubble']");
    expect(bubbleBefore?.getAttribute('data-read')).toBe('false');

    act(() => {
      useChatStore.getState().handleUpdate({
        type: 'read_outbox',
        chat_id: 100,
        last_read_outbox_message_id: 50,
      });
    });

    // After: message 50 IS read (maxId=50 >= 50)
    const bubbleAfter = container.querySelector("[data-testid='bubble']");
    expect(bubbleAfter?.getAttribute('data-read')).toBe('true');
  });

  it('pending message (-1 id) never shows as read even with high maxId', () => {
    const chat = makeChat({ id: 100, last_read_outbox_message_id: 999999 });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 100,
      messagesByChat: {
        100: [
          makeMessage({
            id: -1,
            is_outgoing: true,
            content: {
              _: 'messageText',
              text: { _: 'formattedText', text: 'pending msg', entities: [] },
            },
          }),
        ],
      },
      loadingDialogs: false,
      loadingMessages: false,
    });

    const { container } = render(<ChatLayout onLogout={() => {}} />);

    // The -1 message should NOT be read even though maxId is huge
    // because isRead = msg.is_outgoing && msg.id > 0 && msg.id <= last_read_outbox_message_id
    const bubble = container.querySelector("[data-testid='bubble']");
    expect(bubble?.getAttribute('data-read')).toBe('false');
  });

  it('updates reactions when message_reactions event arrives', () => {
    const chat = makeChat({ id: 100 });
    const msg = makeMessage({ id: 42 });
    useChatStore.setState({
      chats: [chat],
      selectedChatId: 100,
      messagesByChat: { 100: [msg] },
      loadingDialogs: false,
      loadingMessages: false,
    });

    render(<ChatLayout onLogout={() => {}} />);

    act(() => {
      useChatStore.getState().handleUpdate({
        type: 'message_reactions',
        chat_id: 100,
        message_id: 42,
        interaction_info: {
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
        },
      });
    });

    // Verify the store updated (component will re-render via selectChatMessages)
    const updated = useChatStore.getState().messagesByChat[100][0];
    expect(updated.interaction_info?.reactions?.reactions).toHaveLength(1);
    expect(updated.interaction_info?.reactions?.reactions[0].total_count).toBe(3);
  });
});
