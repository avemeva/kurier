import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Td } from '@/lib/types';

// Mock @tg/protocol before importing telegram module
const {
  mockInvoke,
  mockOn,
  mockOff,
  mockClose,
  mockGetAuthState,
  mockSubmitPhone,
  mockSubmitCode,
  mockSubmitPassword,
} = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockOn: vi.fn(),
  mockOff: vi.fn(),
  mockClose: vi.fn(),
  mockGetAuthState: vi.fn(),
  mockSubmitPhone: vi.fn(),
  mockSubmitCode: vi.fn(),
  mockSubmitPassword: vi.fn(),
}));

vi.mock('@tg/protocol', () => ({
  TelegramClient: class MockTelegramClient {
    invoke = mockInvoke;
    on = mockOn;
    off = mockOff;
    close = mockClose;
    getAuthState = mockGetAuthState;
    submitPhone = mockSubmitPhone;
    submitCode = mockSubmitCode;
    submitPassword = mockSubmitPassword;
  },
}));

// Mock log
vi.mock('./log', () => {
  const noop = () => {};
  return {
    log: { debug: noop, info: noop, warn: noop, error: noop },
    telegramLog: { debug: noop, info: noop, warn: noop, error: noop },
  };
});

import {
  clearMediaCache,
  closeTdChat,
  extractMessagePreview,
  formatLastSeen,
  formatTelegramError,
  formatTime,
  getDialogs,
  getMe,
  getMediaTypeLabel,
  getMessageEntities,
  getMessages,
  getMessageText,
  getSenderUserId,
  initialize,
  isAuthorized,
  logout,
  markAsRead,
  onUpdate,
  openTdChat,
  searchContacts,
  searchGlobal,
  searchInChat,
  sendMessage,
  sendReaction,
} from './telegram';

// --- Factories ---

function makeMessage(overrides: Partial<Td.message> = {}): Td.message {
  return {
    _: 'message',
    id: 1,
    chat_id: 100,
    sender_id: { _: 'messageSenderUser', user_id: 42 },
    content: {
      _: 'messageText',
      text: { _: 'formattedText', text: 'Hello', entities: [] },
    },
    date: 1700000000,
    is_outgoing: false,
    media_album_id: '0',
    ...overrides,
  } as Td.message;
}

function makeChat(overrides: Partial<Td.chat> = {}): Td.chat {
  return {
    _: 'chat',
    id: 100,
    title: 'Test Chat',
    type: { _: 'chatTypePrivate', user_id: 100 },
    unread_count: 0,
    last_read_outbox_message_id: 0,
    last_message: undefined,
    positions: [],
    photo: undefined,
    ...overrides,
  } as Td.chat;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Pure utility functions ---

describe('formatTime', () => {
  it('returns empty string for zero timestamp', () => {
    expect(formatTime(0)).toBe('');
  });

  it("returns time for today's timestamps", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = formatTime(now - 60); // 1 minute ago
    // Should be a time string like "14:30"
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatLastSeen', () => {
  it("includes 'last seen' in output", () => {
    const ts = Math.floor(Date.now() / 1000) - 86400; // yesterday
    expect(formatLastSeen(ts)).toContain('last seen');
  });
});

describe('getMessageText', () => {
  it('extracts text from messageText content', () => {
    const msg = makeMessage({
      content: {
        _: 'messageText',
        text: { _: 'formattedText', text: 'Hello world', entities: [] },
      },
    });
    expect(getMessageText(msg)).toBe('Hello world');
  });

  it('extracts caption from photo content', () => {
    const msg = makeMessage({
      content: {
        _: 'messagePhoto',
        photo: { _: 'photo', has_stickers: false, minithumbnail: undefined, sizes: [] },
        caption: { _: 'formattedText', text: 'Nice photo', entities: [] },
        has_spoiler: false,
        is_secret: false,
        show_caption_above_media: false,
      } as Td.messagePhoto,
    });
    expect(getMessageText(msg)).toBe('Nice photo');
  });

  it('returns empty string for content without text', () => {
    const msg = makeMessage({
      content: {
        _: 'messagePhoto',
        photo: { _: 'photo', has_stickers: false, minithumbnail: undefined, sizes: [] },
        caption: { _: 'formattedText', text: '', entities: [] },
        has_spoiler: false,
        is_secret: false,
        show_caption_above_media: false,
      } as Td.messagePhoto,
    });
    expect(getMessageText(msg)).toBe('');
  });
});

describe('getMessageEntities', () => {
  it('returns entities from messageText', () => {
    const entities: Td.textEntity[] = [
      { _: 'textEntity', offset: 0, length: 5, type: { _: 'textEntityTypeBold' } },
    ];
    const msg = makeMessage({
      content: {
        _: 'messageText',
        text: { _: 'formattedText', text: 'Hello', entities },
      },
    });
    expect(getMessageEntities(msg)).toEqual(entities);
  });

  it('returns empty array for content without entities', () => {
    const msg = makeMessage({
      content: {
        _: 'messageContact',
        contact: {
          _: 'contact',
          phone_number: '+1234567890',
          first_name: 'John',
          last_name: '',
          vcard: '',
          user_id: 0,
        },
      } as Td.messageContact,
    });
    expect(getMessageEntities(msg)).toEqual([]);
  });
});

describe('getMediaTypeLabel', () => {
  it("returns 'Photo' for photo messages", () => {
    const msg = makeMessage({
      content: {
        _: 'messagePhoto',
        photo: { _: 'photo', has_stickers: false, minithumbnail: undefined, sizes: [] },
        caption: { _: 'formattedText', text: '', entities: [] },
        has_spoiler: false,
        is_secret: false,
        show_caption_above_media: false,
      } as Td.messagePhoto,
    });
    expect(getMediaTypeLabel(msg)).toBe('Photo');
  });

  it('returns empty string for text messages', () => {
    const msg = makeMessage();
    expect(getMediaTypeLabel(msg)).toBe('');
  });
});

describe('extractMessagePreview', () => {
  it('returns text if present', () => {
    const msg = makeMessage();
    expect(extractMessagePreview(msg)).toBe('Hello');
  });

  it('returns empty string for undefined', () => {
    expect(extractMessagePreview(undefined)).toBe('');
  });

  it('falls back to media type label', () => {
    const msg = makeMessage({
      content: {
        _: 'messagePhoto',
        photo: { _: 'photo', has_stickers: false, minithumbnail: undefined, sizes: [] },
        caption: { _: 'formattedText', text: '', entities: [] },
        has_spoiler: false,
        is_secret: false,
        show_caption_above_media: false,
      } as Td.messagePhoto,
    });
    expect(extractMessagePreview(msg)).toBe('Photo');
  });
});

describe('getSenderUserId', () => {
  it('returns user_id for messageSenderUser', () => {
    expect(getSenderUserId({ _: 'messageSenderUser', user_id: 42 })).toBe(42);
  });

  it('returns 0 for messageSenderChat', () => {
    expect(getSenderUserId({ _: 'messageSenderChat', chat_id: 100 })).toBe(0);
  });
});

describe('formatTelegramError', () => {
  it('maps known error codes', () => {
    const err = new Error('PHONE_NUMBER_INVALID');
    expect(formatTelegramError(err)).toBe('Invalid phone number. Check the format and try again');
  });

  it('handles FLOOD_WAIT errors', () => {
    const err = new Error('FLOOD_WAIT_120');
    expect(formatTelegramError(err)).toContain('2 minutes');
  });

  it('falls back to error message', () => {
    const err = new Error('Something went wrong');
    expect(formatTelegramError(err)).toBe('Something went wrong');
  });

  it('handles non-Error values', () => {
    expect(formatTelegramError('raw string error')).toBe('raw string error');
  });
});

// --- Data fetching via TelegramClient ---

describe('getDialogs', () => {
  it('fetches chats via getChats + getChat', async () => {
    const chat1 = makeChat({ id: 1, title: 'Chat 1' });
    const chat2 = makeChat({ id: 2, title: 'Chat 2' });

    mockInvoke
      .mockResolvedValueOnce({ _: 'chats', total_count: 2, chat_ids: [1, 2] })
      .mockResolvedValueOnce(chat1)
      .mockResolvedValueOnce(chat2);

    const result = await getDialogs();

    expect(mockInvoke).toHaveBeenCalledWith({
      _: 'getChats',
      chat_list: { _: 'chatListMain' },
      limit: 100,
    });
    expect(result).toEqual([chat1, chat2]);
  });

  it('uses chatListArchive for archived option', async () => {
    mockInvoke.mockResolvedValueOnce({ _: 'chats', total_count: 0, chat_ids: [] });

    await getDialogs({ archived: true });

    expect(mockInvoke).toHaveBeenCalledWith({
      _: 'getChats',
      chat_list: { _: 'chatListArchive' },
      limit: 100,
    });
  });

  it('respects limit option', async () => {
    mockInvoke.mockResolvedValueOnce({ _: 'chats', total_count: 0, chat_ids: [] });

    await getDialogs({ limit: 20 });

    expect(mockInvoke).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });
});

describe('getMessages', () => {
  it('fetches chat history and filters undefined messages', async () => {
    const msg1 = makeMessage({ id: 1 });
    const msg2 = makeMessage({ id: 2 });

    mockInvoke.mockResolvedValueOnce({
      _: 'messages',
      total_count: 3,
      messages: [msg1, undefined, msg2],
    });

    const result = await getMessages(100);

    expect(mockInvoke).toHaveBeenCalledWith({
      _: 'getChatHistory',
      chat_id: 100,
      from_message_id: 0,
      offset: 0,
      limit: 50,
      only_local: false,
    });
    expect(result.messages).toEqual([msg1, msg2]);
    expect(result.hasMore).toBe(true);
  });
});

describe('sendMessage', () => {
  it('sends message and returns result', async () => {
    const sentMsg = makeMessage({ id: 999, is_outgoing: true });
    mockInvoke.mockResolvedValueOnce(sentMsg);

    const result = await sendMessage(100, 'Hello world');

    expect(mockInvoke).toHaveBeenCalledWith({
      _: 'sendMessage',
      chat_id: 100,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text: 'Hello world', entities: [] },
        clear_draft: true,
      },
    });
    expect(result).toEqual(sentMsg);
  });
});

describe('sendReaction', () => {
  it('adds reaction when not chosen', async () => {
    mockInvoke.mockResolvedValueOnce({ _: 'ok' });

    await sendReaction(100, 1, '👍', false);

    expect(mockInvoke).toHaveBeenCalledWith({
      _: 'addMessageReaction',
      chat_id: 100,
      message_id: 1,
      reaction_type: { _: 'reactionTypeEmoji', emoji: '👍' },
      is_big: false,
      update_recent_reactions: true,
    });
  });

  it('removes reaction when chosen', async () => {
    mockInvoke.mockResolvedValueOnce({ _: 'ok' });

    await sendReaction(100, 1, '👍', true);

    expect(mockInvoke).toHaveBeenCalledWith({
      _: 'removeMessageReaction',
      chat_id: 100,
      message_id: 1,
      reaction_type: { _: 'reactionTypeEmoji', emoji: '👍' },
    });
  });
});

describe('markAsRead', () => {
  it('views the latest message in chat', async () => {
    const msg = makeMessage({ id: 42 });
    mockInvoke
      .mockResolvedValueOnce({ _: 'messages', total_count: 1, messages: [msg] })
      .mockResolvedValueOnce({ _: 'ok' });

    await markAsRead(100);

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ _: 'getChatHistory', chat_id: 100, limit: 1 }),
    );
    expect(mockInvoke).toHaveBeenCalledWith({
      _: 'viewMessages',
      chat_id: 100,
      message_ids: [42],
      force_read: true,
    });
  });

  it('does nothing when no messages available', async () => {
    mockInvoke.mockResolvedValueOnce({
      _: 'messages',
      total_count: 0,
      messages: [undefined],
    });

    await markAsRead(100);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('silently catches errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('network error'));
    // Should not throw
    await markAsRead(100);
  });
});

describe('openTdChat / closeTdChat', () => {
  it('opens chat', async () => {
    mockInvoke.mockResolvedValueOnce({ _: 'ok' });
    await openTdChat(100);
    expect(mockInvoke).toHaveBeenCalledWith({ _: 'openChat', chat_id: 100 });
  });

  it('closes chat', async () => {
    mockInvoke.mockResolvedValueOnce({ _: 'ok' });
    await closeTdChat(100);
    expect(mockInvoke).toHaveBeenCalledWith({ _: 'closeChat', chat_id: 100 });
  });
});

describe('getMe', () => {
  it('returns user from getMe invoke', async () => {
    const user = { _: 'user', id: 42, first_name: 'John' };
    mockInvoke.mockResolvedValueOnce(user);

    const result = await getMe();
    expect(result).toEqual(user);
    expect(mockInvoke).toHaveBeenCalledWith({ _: 'getMe' });
  });
});

// --- Auth state ---

describe('initialize', () => {
  it('starts updates when auth is ready', async () => {
    mockGetAuthState.mockResolvedValueOnce({ state: 'ready', ready: true });
    await initialize();
    expect(mockGetAuthState).toHaveBeenCalled();
    // Updates started => on('update') was called
    expect(mockOn).toHaveBeenCalledWith('update', expect.any(Function));
  });

  it('does not start updates when not ready', async () => {
    mockGetAuthState.mockResolvedValueOnce({ state: 'waitPhoneNumber', ready: false });
    await initialize();
    expect(mockOn).not.toHaveBeenCalled();
  });

  it('handles daemon not running', async () => {
    mockGetAuthState.mockRejectedValueOnce(new Error('fetch failed'));
    await initialize();
    // Should not throw
    expect(mockOn).not.toHaveBeenCalled();
  });
});

describe('isAuthorized', () => {
  it('returns true when ready', async () => {
    mockGetAuthState.mockResolvedValueOnce({ state: 'ready', ready: true });
    expect(await isAuthorized()).toBe(true);
  });

  it('returns false when not ready', async () => {
    mockGetAuthState.mockResolvedValueOnce({ state: 'waitPhoneNumber', ready: false });
    expect(await isAuthorized()).toBe(false);
  });

  it('returns false on error', async () => {
    mockGetAuthState.mockRejectedValueOnce(new Error('network error'));
    expect(await isAuthorized()).toBe(false);
  });
});

describe('logout', () => {
  it('closes client and clears caches', async () => {
    await logout();
    expect(mockClose).toHaveBeenCalled();
  });
});

// --- Search ---

describe('searchInChat', () => {
  it('searches chat messages', async () => {
    const msg = makeMessage({ id: 5 });
    mockInvoke.mockResolvedValueOnce({
      _: 'foundChatMessages',
      total_count: 1,
      messages: [msg],
      next_from_message_id: 0,
    });

    const result = await searchInChat(100, 'hello');

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        _: 'searchChatMessages',
        chat_id: 100,
        query: 'hello',
      }),
    );
    expect(result.messages).toEqual([msg]);
    expect(result.totalCount).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it('indicates hasMore when next_from_message_id is set', async () => {
    const msg = makeMessage({ id: 5 });
    mockInvoke.mockResolvedValueOnce({
      _: 'foundChatMessages',
      total_count: 100,
      messages: [msg],
      next_from_message_id: 4,
    });

    const result = await searchInChat(100, 'hello');
    expect(result.hasMore).toBe(true);
    expect(result.nextOffsetId).toBe(4);
  });
});

describe('searchGlobal', () => {
  it('searches messages globally and enriches with chat titles', async () => {
    const msg = makeMessage({ id: 5, chat_id: 200 });
    const chat = makeChat({ id: 200, title: 'Global Chat' });

    mockInvoke
      .mockResolvedValueOnce({
        _: 'foundMessages',
        total_count: 1,
        messages: [msg],
        next_offset: '',
      })
      .mockResolvedValueOnce(chat);

    const result = await searchGlobal('test');

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].chat_title).toBe('Global Chat');
    expect(result.hasMore).toBe(false);
  });

  it('passes offset cursor', async () => {
    mockInvoke.mockResolvedValueOnce({
      _: 'foundMessages',
      total_count: 0,
      messages: [],
      next_offset: '',
    });

    await searchGlobal('test', { offsetCursor: 'some-offset-string' });

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        _: 'searchMessages',
        offset: 'some-offset-string',
      }),
    );
  });
});

describe('searchContacts', () => {
  it('searches contacts and chats on server', async () => {
    const user = {
      _: 'user',
      id: 42,
      first_name: 'John',
      last_name: 'Doe',
      usernames: {
        _: 'usernames',
        active_usernames: ['johndoe'],
        disabled_usernames: [],
        editable_username: 'johndoe',
      },
    };
    const chat = makeChat({
      id: 200,
      title: 'Group Chat',
      type: { _: 'chatTypeBasicGroup', basic_group_id: 200 },
    });

    mockInvoke
      .mockResolvedValueOnce({ _: 'users', total_count: 1, user_ids: [42] })
      .mockResolvedValueOnce({ _: 'chats', total_count: 1, chat_ids: [200] })
      .mockResolvedValueOnce(user) // getUser for toPeerInfo
      .mockResolvedValueOnce(chat); // getChat for global result

    const result = await searchContacts('john');

    expect(result.myResults).toHaveLength(1);
    expect(result.myResults[0]).toEqual({
      id: 42,
      name: 'John Doe',
      username: 'johndoe',
      isUser: true,
      isGroup: false,
      isChannel: false,
    });
    expect(result.globalResults).toHaveLength(1);
    expect(result.globalResults[0]).toEqual({
      id: 200,
      name: 'Group Chat',
      username: null,
      isUser: false,
      isGroup: true,
      isChannel: false,
    });
  });
});

// --- Update events ---

describe('onUpdate', () => {
  it('returns an unsubscribe function', () => {
    const listener = vi.fn();
    const unsub = onUpdate(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('clearMediaCache', () => {
  it('does not throw when called', () => {
    expect(() => clearMediaCache(123)).not.toThrow();
  });
});
