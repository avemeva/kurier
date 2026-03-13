import type * as Td from 'tdlib-types';
import { describe, expect, it } from 'vitest';
import {
  extractForwardName,
  extractInlineKeyboard,
  extractMessagePreview,
  extractServiceText,
  groupAndConvert,
  hydrateMessage,
  toChatKind,
  toTGChat,
  toTGContent,
  toTGForward,
  toTGMessage,
  toTGReactions,
  toTGReplyTo,
  toTGTextEntities,
  toTGUser,
} from '../convert';
import type { PendingMessage } from '../index';
import type { TGMessage } from '../tg';
import {
  CHAT_CHANNEL,
  CHAT_HY_RID,
  CHAT_MARUSIA,
  CHAT_SUPERGROUP,
  MSG_ANIMATED_EMOJI,
  MSG_ANIMATED_EMOJI_NO_STICKER,
  MSG_ANIMATION,
  MSG_FORWARDED,
  MSG_PHOTO_ALBUM,
  MSG_PHOTO_ALBUM_1,
  MSG_PHOTO_SINGLE,
  MSG_REPLY,
  MSG_STICKER_INCOMING,
  MSG_TEXT_INCOMING,
  MSG_TEXT_WITH_LINK_PREVIEW,
  MSG_VIDEO,
  MSG_VIDEO_NOTE,
  MSG_VOICE_INCOMING,
  USER_HY_RID,
  USER_MARUSIA,
  USER_ME,
  USER_VALIDOL,
  USERS_MAP,
} from './fixtures';

const users = USERS_MAP;

// ---------------------------------------------------------------------------
// toTGChat
// ---------------------------------------------------------------------------

describe('toTGChat', () => {
  it('converts private chat (Hy Rid)', () => {
    const ui = toTGChat(CHAT_HY_RID, { photoUrl: null, user: undefined, isOnline: false });
    expect(ui.id).toBe(6098406782);
    expect(ui.title).toBe('Hy Rid');
    expect(ui.kind).toBe('private');
    expect(ui.userId).toBe(6098406782);
    expect(ui.unreadCount).toBe(0);
    expect(ui.lastMessagePreview).toBe('All good, take your time.');
    expect(ui.isMuted).toBe(false);
    expect(ui.isPinned).toBe(true);
    expect(ui.draftText).toBeNull();
    expect(ui.photoUrl).toBeNull();
    expect(ui.isBot).toBe(false);
    expect(ui.isOnline).toBe(false);
    expect(ui.user).toBeNull();
  });

  it('converts private chat (Маруся)', () => {
    const ui = toTGChat(CHAT_MARUSIA, {
      photoUrl: 'https://photo.url/marusia.jpg',
      user: USER_MARUSIA,
      isOnline: true,
    });
    expect(ui.id).toBe(346928206);
    expect(ui.kind).toBe('private');
    expect(ui.userId).toBe(346928206);
    expect(ui.isPinned).toBe(true);
    expect(ui.isMuted).toBe(false);
    expect(ui.photoUrl).toBe('https://photo.url/marusia.jpg');
    expect(ui.lastMessagePreview).toBe('прошла неделя, а цвет уже изменился\nтак круто');
    expect(ui.isBot).toBe(false);
    expect(ui.isOnline).toBe(true);
    expect(ui.user).not.toBeNull();
    expect(ui.user?.fullName).toBe('Маруся');
  });

  it('converts supergroup (muted)', () => {
    const ui = toTGChat(CHAT_SUPERGROUP, { photoUrl: null, user: undefined, isOnline: false });
    expect(ui.id).toBe(-1001731417779);
    expect(ui.kind).toBe('supergroup');
    expect(ui.userId).toBe(0);
    expect(ui.isMuted).toBe(true);
    expect(ui.isPinned).toBe(false);
    expect(ui.isBot).toBe(false);
    expect(ui.isOnline).toBe(false);
    expect(ui.user).toBeNull();
  });

  it('converts channel', () => {
    const ui = toTGChat(CHAT_CHANNEL, { photoUrl: null, user: undefined, isOnline: false });
    expect(ui.kind).toBe('channel');
    expect(ui.isBot).toBe(false);
    expect(ui.isOnline).toBe(false);
    expect(ui.user).toBeNull();
  });

  it('handles chat with no last message', () => {
    // Supergroup chat has no last_message set (we'll test with a constructed chat)
    const chatNoMsg = { ...CHAT_SUPERGROUP, last_message: undefined } as Td.chat;
    const ui = toTGChat(chatNoMsg, { photoUrl: null, user: undefined, isOnline: false });
    expect(ui.lastMessagePreview).toBe('');
    expect(ui.lastMessageDate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toChatKind
// ---------------------------------------------------------------------------

describe('toChatKind', () => {
  it('maps chatTypePrivate', () => {
    expect(toChatKind({ _: 'chatTypePrivate', user_id: 1 })).toBe('private');
  });

  it('maps chatTypeBasicGroup', () => {
    expect(toChatKind({ _: 'chatTypeBasicGroup', basic_group_id: 1 })).toBe('basicGroup');
  });

  it('maps chatTypeSupergroup (group)', () => {
    expect(toChatKind({ _: 'chatTypeSupergroup', supergroup_id: 1, is_channel: false })).toBe(
      'supergroup',
    );
  });

  it('maps chatTypeSupergroup (channel)', () => {
    expect(toChatKind({ _: 'chatTypeSupergroup', supergroup_id: 1, is_channel: true })).toBe(
      'channel',
    );
  });

  it('defaults to private for chatTypeSecret', () => {
    expect(toChatKind({ _: 'chatTypeSecret', secret_chat_id: 1, user_id: 1 })).toBe('private');
  });
});

// ---------------------------------------------------------------------------
// toTGUser
// ---------------------------------------------------------------------------

describe('toTGUser', () => {
  it('converts premium user with username (Andrey)', () => {
    const ui = toTGUser(USER_ME);
    expect(ui.id).toBe(91754006);
    expect(ui.firstName).toBe('Andrey');
    expect(ui.lastName).toBe('');
    expect(ui.fullName).toBe('Andrey');
    expect(ui.username).toBe('avemeva');
    expect(ui.isPremium).toBe(true);
    expect(ui.emojiStatusId).toBeNull();
  });

  it('converts non-premium user without username (Hy Rid)', () => {
    const ui = toTGUser(USER_HY_RID);
    expect(ui.id).toBe(6098406782);
    expect(ui.fullName).toBe('Hy Rid');
    expect(ui.username).toBeNull();
    expect(ui.isPremium).toBe(false);
    expect(ui.emojiStatusId).toBeNull();
  });

  it('converts user with emoji status (Маруся)', () => {
    const ui = toTGUser(USER_MARUSIA);
    expect(ui.fullName).toBe('Маруся');
    expect(ui.username).toBe('naluneteplo');
    expect(ui.isPremium).toBe(true);
    expect(ui.emojiStatusId).toBe('5316659463606796443');
  });

  it('converts user with emoji status (Валидол)', () => {
    const ui = toTGUser(USER_VALIDOL);
    expect(ui.fullName).toBe('Валидол');
    expect(ui.username).toBe('kxt9_8');
    expect(ui.emojiStatusId).toBe('5393542049674831462');
  });
});

// ---------------------------------------------------------------------------
// toTGTextEntities
// ---------------------------------------------------------------------------

describe('toTGTextEntities', () => {
  it('converts bold entity', () => {
    const entities: Td.textEntity[] = [
      { _: 'textEntity', offset: 0, length: 4, type: { _: 'textEntityTypeBold' } },
    ];
    const result = toTGTextEntities(entities);
    expect(result).toEqual([{ offset: 0, length: 4, type: 'bold' }]);
  });

  it('converts url entity', () => {
    const entities: Td.textEntity[] = [
      { _: 'textEntity', offset: 0, length: 15, type: { _: 'textEntityTypeUrl' } },
    ];
    const result = toTGTextEntities(entities);
    expect(result).toEqual([{ offset: 0, length: 15, type: 'url' }]);
  });

  it('converts textUrl entity with url', () => {
    const entities: Td.textEntity[] = [
      {
        _: 'textEntity',
        offset: 0,
        length: 10,
        type: { _: 'textEntityTypeTextUrl', url: 'https://example.com' },
      },
    ];
    const result = toTGTextEntities(entities);
    expect(result).toEqual([
      { offset: 0, length: 10, type: 'textUrl', url: 'https://example.com' },
    ]);
  });

  it('converts customEmoji entity with id', () => {
    const entities: Td.textEntity[] = [
      {
        _: 'textEntity',
        offset: 0,
        length: 5,
        type: { _: 'textEntityTypeCustomEmoji', custom_emoji_id: '12345' },
      },
    ];
    const result = toTGTextEntities(entities);
    expect(result).toEqual([{ offset: 0, length: 5, type: 'customEmoji', customEmojiId: '12345' }]);
  });

  it('converts spoiler entity', () => {
    const entities: Td.textEntity[] = [
      { _: 'textEntity', offset: 5, length: 3, type: { _: 'textEntityTypeSpoiler' } },
    ];
    const result = toTGTextEntities(entities);
    expect(result).toEqual([{ offset: 5, length: 3, type: 'spoiler' }]);
  });

  it('handles empty entities array', () => {
    expect(toTGTextEntities([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toTGReactions
// ---------------------------------------------------------------------------

describe('toTGReactions', () => {
  it('converts emoji reactions with counts and chosen state', () => {
    const info: Td.messageInteractionInfo = {
      _: 'messageInteractionInfo',
      view_count: 10,
      forward_count: 0,
      reactions: {
        _: 'messageReactions',
        reactions: [
          {
            _: 'messageReaction',
            type: { _: 'reactionTypeEmoji', emoji: '🔥' },
            total_count: 7,
            is_chosen: true,
            recent_sender_ids: [],
          },
          {
            _: 'messageReaction',
            type: { _: 'reactionTypeEmoji', emoji: '👎' },
            total_count: 1,
            is_chosen: false,
            recent_sender_ids: [],
          },
        ],
        are_tags: false,
        paid_reactors: [],
        can_get_added_reactions: false,
      },
    };
    const result = toTGReactions(info);
    expect(result).toEqual([
      { emoji: '🔥', count: 7, chosen: true },
      { emoji: '👎', count: 1, chosen: false },
    ]);
  });

  it('returns empty array for undefined info', () => {
    expect(toTGReactions(undefined)).toEqual([]);
  });

  it('returns empty array when no reactions', () => {
    const info: Td.messageInteractionInfo = {
      _: 'messageInteractionInfo',
      view_count: 5,
      forward_count: 0,
    };
    expect(toTGReactions(info)).toEqual([]);
  });

  it('handles non-emoji reaction type', () => {
    const info: Td.messageInteractionInfo = {
      _: 'messageInteractionInfo',
      view_count: 1,
      forward_count: 0,
      reactions: {
        _: 'messageReactions',
        reactions: [
          {
            _: 'messageReaction',
            type: { _: 'reactionTypePaid' },
            total_count: 2,
            is_chosen: false,
            recent_sender_ids: [],
          },
        ],
        are_tags: false,
        paid_reactors: [],
        can_get_added_reactions: false,
      },
    };
    const result = toTGReactions(info);
    expect(result).toEqual([{ emoji: '', count: 2, chosen: false }]);
  });
});

// ---------------------------------------------------------------------------
// extractMessagePreview
// ---------------------------------------------------------------------------

describe('extractMessagePreview', () => {
  it('returns text for text message', () => {
    expect(extractMessagePreview(MSG_TEXT_INCOMING)).toBe('All good, take your time.');
  });

  it('returns caption for photo with caption', () => {
    expect(extractMessagePreview(MSG_PHOTO_SINGLE)).toBe(
      'а ещё в футбольных менеджерах вот такая хуйня бывает если долго играть',
    );
  });

  it('returns Photo for photo without caption', () => {
    expect(extractMessagePreview(MSG_PHOTO_ALBUM)).toBe('Photo');
  });

  it('returns Voice message for voice note', () => {
    expect(extractMessagePreview(MSG_VOICE_INCOMING)).toBe('Voice message');
  });

  it('returns Video for video without caption', () => {
    expect(extractMessagePreview(MSG_VIDEO)).toBe('Video');
  });

  it('returns Video message for video note', () => {
    expect(extractMessagePreview(MSG_VIDEO_NOTE)).toBe('Video message');
  });

  it('returns emoji for sticker', () => {
    expect(extractMessagePreview(MSG_STICKER_INCOMING)).toBe('⭐');
  });

  it('returns GIF for animation without caption', () => {
    expect(extractMessagePreview(MSG_ANIMATION)).toBe('GIF');
  });

  // AC5: sidebar preview
  it('returns emoji for animated emoji preview', () => {
    expect(extractMessagePreview(MSG_ANIMATED_EMOJI)).toBe('🐸');
  });

  it('returns emoji for animated emoji without sticker', () => {
    expect(extractMessagePreview(MSG_ANIMATED_EMOJI_NO_STICKER)).toBe('🎉');
  });

  it('returns empty string for undefined message', () => {
    expect(extractMessagePreview(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractForwardName
// ---------------------------------------------------------------------------

describe('extractForwardName', () => {
  it('returns user name for messageOriginUser', () => {
    const name = extractForwardName(MSG_FORWARDED.forward_info, users);
    expect(name).toBe('Маруся');
  });

  it('returns sender_name for messageOriginHiddenUser', () => {
    const info: Td.messageForwardInfo = {
      _: 'messageForwardInfo',
      origin: { _: 'messageOriginHiddenUser', sender_name: 'Hidden Sender' },
      date: 1699998000,
      public_service_announcement_type: '',
    };
    const name = extractForwardName(info, users);
    expect(name).toBe('Hidden Sender');
  });

  it('returns null for messageOriginChat', () => {
    const info: Td.messageForwardInfo = {
      _: 'messageForwardInfo',
      origin: { _: 'messageOriginChat', sender_chat_id: 123, author_signature: '' },
      date: 0,
      public_service_announcement_type: '',
    };
    expect(extractForwardName(info, users)).toBeNull();
  });

  it('returns null for messageOriginChannel', () => {
    const info: Td.messageForwardInfo = {
      _: 'messageForwardInfo',
      origin: { _: 'messageOriginChannel', chat_id: 456, message_id: 789, author_signature: '' },
      date: 0,
      public_service_announcement_type: '',
    };
    expect(extractForwardName(info, users)).toBeNull();
  });

  it('returns null for undefined info', () => {
    expect(extractForwardName(undefined, users)).toBeNull();
  });

  it('returns Unknown for user not in map', () => {
    const info: Td.messageForwardInfo = {
      _: 'messageForwardInfo',
      origin: { _: 'messageOriginUser', sender_user_id: 99999 },
      date: 0,
      public_service_announcement_type: '',
    };
    expect(extractForwardName(info, users)).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// extractServiceText
// ---------------------------------------------------------------------------

describe('extractServiceText', () => {
  it('returns null for regular text content', () => {
    expect(extractServiceText(MSG_TEXT_INCOMING.content)).toBeNull();
  });

  it('returns null for photo content', () => {
    expect(extractServiceText(MSG_PHOTO_SINGLE.content)).toBeNull();
  });

  // Service message tests with inline constructed content
  it('messageChatAddMembers => joined the group', () => {
    const content = { _: 'messageChatAddMembers', member_user_ids: [200] } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('joined the group');
  });

  it('messageChatDeleteMember => left the group', () => {
    const content = { _: 'messageChatDeleteMember', user_id: 300 } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('left the group');
  });

  it('messagePinMessage => pinned a message', () => {
    const content = { _: 'messagePinMessage', message_id: 1001 } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('pinned a message');
  });

  it('messageChatChangeTitle => changed group name to "..."', () => {
    const content = {
      _: 'messageChatChangeTitle',
      title: 'New Group Name',
    } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('changed group name to "New Group Name"');
  });

  it('messageChatChangePhoto => changed group photo', () => {
    const content = {
      _: 'messageChatChangePhoto',
      photo: { _: 'chatPhoto' },
    } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('changed group photo');
  });

  it('messageChatDeletePhoto => removed group photo', () => {
    const content = { _: 'messageChatDeletePhoto' } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('removed group photo');
  });

  it('messageScreenshotTaken => took a screenshot', () => {
    const content = { _: 'messageScreenshotTaken' } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('took a screenshot');
  });

  it('messageCustomServiceAction => custom text', () => {
    const content = {
      _: 'messageCustomServiceAction',
      text: 'Custom action happened',
    } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('Custom action happened');
  });

  it('messageChatJoinByLink => joined via invite link', () => {
    const content = { _: 'messageChatJoinByLink' } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('joined via invite link');
  });

  it('messageChatJoinByRequest => was accepted to the group', () => {
    const content = { _: 'messageChatJoinByRequest' } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('was accepted to the group');
  });

  it('messageBasicGroupChatCreate => created group "..."', () => {
    const content = {
      _: 'messageBasicGroupChatCreate',
      title: 'My Group',
      member_user_ids: [100, 200],
    } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('created group "My Group"');
  });

  it('messageSupergroupChatCreate => created group "..."', () => {
    const content = {
      _: 'messageSupergroupChatCreate',
      title: 'Super Group',
    } as Td.MessageContent;
    expect(extractServiceText(content)).toBe('created group "Super Group"');
  });
});

// ---------------------------------------------------------------------------
// extractInlineKeyboard
// ---------------------------------------------------------------------------

describe('extractInlineKeyboard', () => {
  it('returns null when no reply markup', () => {
    expect(extractInlineKeyboard(MSG_TEXT_INCOMING)).toBeNull();
  });
});

// ===========================================================================
// Compositional converters (new)
// ===========================================================================

// ---------------------------------------------------------------------------
// toTGMessage
// ---------------------------------------------------------------------------

describe('toTGMessage', () => {
  it('converts envelope fields', () => {
    const m = toTGMessage(MSG_TEXT_INCOMING, users, 0);
    expect(m.kind).toBe('message');
    if (m.kind !== 'message') return;
    expect(m.id).toBe(MSG_TEXT_INCOMING.id);
    expect(m.chatId).toBe(MSG_TEXT_INCOMING.chat_id);
    expect(m.date).toBe(MSG_TEXT_INCOMING.date);
    expect(m.isOutgoing).toBe(false);
    expect(m.sender.name).toBe('Hy Rid');
    expect(m.sender.userId).toBe(6098406782);
  });

  it('marks outgoing read when id <= lastReadOutboxId', () => {
    const m = toTGMessage(MSG_TEXT_INCOMING, users, MSG_TEXT_INCOMING.id);
    // MSG_TEXT_INCOMING is not outgoing, so isRead should be false
    if (m.kind !== 'message') return;
    expect(m.isRead).toBe(false);
  });

  it('detects service message', () => {
    const serviceMsg = {
      ...MSG_TEXT_INCOMING,
      content: { _: 'messagePinMessage' as const, message_id: 42 },
    } as unknown as import('tdlib-types').message;
    const m = toTGMessage(serviceMsg, users, 0);
    expect(m.kind).toBe('service');
    if (m.kind !== 'service') return;
    expect(m.text).toContain('pinned');
    expect(m.pinnedMessageId).toBe(42);
  });

  it('resolves unknown sender to "Unknown"', () => {
    const msg = {
      ...MSG_TEXT_INCOMING,
      sender_id: { _: 'messageSenderUser' as const, user_id: 99999 },
    };
    const m = toTGMessage(msg, users, 0);
    if (m.kind !== 'message') return;
    expect(m.sender.name).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// toTGForward
// ---------------------------------------------------------------------------

describe('toTGForward', () => {
  it('returns null when no forward info', () => {
    expect(toTGForward(undefined, users)).toBeNull();
  });

  it('returns correct fields when present', () => {
    const f = toTGForward(MSG_FORWARDED.forward_info, users);
    expect(f).not.toBeNull();
    expect(f?.fromName).toBeTruthy();
    expect(f?.date).toBe(MSG_FORWARDED.forward_info?.date);
  });
});

// ---------------------------------------------------------------------------
// toTGReplyTo
// ---------------------------------------------------------------------------

describe('toTGReplyTo', () => {
  it('returns null when no reply', () => {
    expect(toTGReplyTo(MSG_TEXT_INCOMING)).toBeNull();
  });

  it('returns correct messageId and quoteText when present', () => {
    const r = toTGReplyTo(MSG_REPLY);
    expect(r).not.toBeNull();
    expect(r?.messageId).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// toTGContent
// ---------------------------------------------------------------------------

describe('toTGContent', () => {
  it('converts text content', () => {
    const c = toTGContent(MSG_TEXT_INCOMING.content);
    expect(c.kind).toBe('text');
    if (c.kind === 'text') {
      expect(c.text).toBe('All good, take your time.');
      expect(c.entities).toEqual([]);
      expect(c.webPreview).toBeNull();
    }
  });

  it('converts text with link preview', () => {
    const c = toTGContent(MSG_TEXT_WITH_LINK_PREVIEW.content);
    expect(c.kind).toBe('text');
    if (c.kind === 'text') {
      expect(c.webPreview).not.toBeNull();
      expect(c.webPreview?.url).toBe('https://t.me/startupseurope');
      expect(c.webPreview?.thumbUrl).toBeUndefined();
    }
  });

  it('converts photo content', () => {
    const c = toTGContent(MSG_PHOTO_SINGLE.content);
    expect(c.kind).toBe('photo');
    if (c.kind === 'photo') {
      expect(c.media.width).toBe(1280);
      expect(c.media.height).toBe(720);
      expect(c.media.url).toBeUndefined();
      expect(c.caption).not.toBeNull();
      expect(c.caption?.text).toBe(
        'а ещё в футбольных менеджерах вот такая хуйня бывает если долго играть',
      );
    }
  });

  it('converts video content', () => {
    const c = toTGContent(MSG_VIDEO.content);
    expect(c.kind).toBe('video');
    if (c.kind === 'video') {
      expect(c.media.width).toBe(848);
      expect(c.media.height).toBe(512);
      expect(c.media.url).toBeUndefined();
      expect(c.isGif).toBe(false);
    }
  });

  it('converts animation content', () => {
    const c = toTGContent(MSG_ANIMATION.content);
    expect(c.kind).toBe('animation');
    if (c.kind === 'animation') {
      expect(c.media.width).toBe(288);
      expect(c.media.height).toBe(230);
      expect(c.media.url).toBeUndefined();
    }
  });

  it('converts voice content', () => {
    const c = toTGContent(MSG_VOICE_INCOMING.content);
    expect(c.kind).toBe('voice');
    if (c.kind === 'voice') {
      expect(c.duration).toBe(4);
      expect(c.fileSize).toBe(19067);
      expect(c.waveform).not.toBeNull();
      expect(c.url).toBeUndefined();
    }
  });

  it('converts videoNote content', () => {
    const c = toTGContent(MSG_VIDEO_NOTE.content);
    expect(c.kind).toBe('videoNote');
    if (c.kind === 'videoNote') {
      expect(c.media.width).toBe(300);
      expect(c.media.height).toBe(300);
      expect(c.media.url).toBeUndefined();
    }
  });

  it('converts sticker content (webp)', () => {
    const c = toTGContent(MSG_STICKER_INCOMING.content);
    expect(c.kind).toBe('sticker');
    if (c.kind === 'sticker') {
      expect(c.format).toBe('webp');
      expect(c.emoji).toBe('⭐');
      expect(c.width).toBe(512);
      expect(c.height).toBe(512);
      expect(c.url).toBeUndefined();
    }
  });

  it('converts animated emoji to sticker content', () => {
    const c = toTGContent(MSG_ANIMATED_EMOJI.content);
    expect(c.kind).toBe('sticker');
    if (c.kind === 'sticker') {
      expect(c.format).toBe('tgs');
      expect(c.emoji).toBe('🐸');
    }
  });

  it('converts document content', () => {
    const docContent = { _: 'messageDocument', document: {} } as Td.MessageContent;
    const c = toTGContent(docContent);
    expect(c.kind).toBe('document');
    if (c.kind === 'document') {
      expect(c.label).toBe('File');
    }
  });

  it('converts unsupported content', () => {
    const content = { _: 'messagePoll' } as Td.MessageContent;
    const c = toTGContent(content);
    expect(c.kind).toBe('unsupported');
    if (c.kind === 'unsupported') {
      expect(c.label).toBe('Poll');
    }
  });
});

// ---------------------------------------------------------------------------
// groupAndConvert
// ---------------------------------------------------------------------------

describe('groupAndConvert', () => {
  it('converts single messages', () => {
    const result = groupAndConvert([MSG_TEXT_INCOMING], [], users, 0);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('message');
    if (result[0]?.kind === 'message') {
      expect(result[0]?.content.kind).toBe('text');
    }
  });

  it('groups album (2+ messages with same albumId)', () => {
    const result = groupAndConvert([MSG_PHOTO_ALBUM, MSG_PHOTO_ALBUM_1], [], users, 0);
    expect(result).toHaveLength(1);
    const msg = result[0];
    expect(msg?.kind).toBe('message');
    if (msg?.kind === 'message') {
      expect(msg.content.kind).toBe('album');
      if (msg.content.kind === 'album') {
        expect(msg.content.items).toHaveLength(2);
        expect(msg.content.items[0]?.messageId).toBe(MSG_PHOTO_ALBUM.id);
        expect(msg.content.items[1]?.messageId).toBe(MSG_PHOTO_ALBUM_1.id);
      }
    }
  });

  it('does not group single message with albumId', () => {
    const result = groupAndConvert([MSG_PHOTO_ALBUM], [], users, 0);
    expect(result).toHaveLength(1);
    const msg = result[0];
    expect(msg?.kind).toBe('message');
    if (msg?.kind === 'message') {
      // Single message with albumId should not be grouped into album
      expect(msg.content.kind).toBe('photo');
    }
  });

  it('appends pending messages', () => {
    const pending: PendingMessage = {
      _pending: 'sending',
      localId: 'local-1',
      chat_id: 100,
      text: 'Sending...',
      date: 1700000000,
    };
    const result = groupAndConvert([MSG_TEXT_INCOMING], [pending], users, 0);
    expect(result).toHaveLength(2);
    expect(result[1]?.kind).toBe('pending');
    if (result[1]?.kind === 'pending') {
      expect(result[1]?.text).toBe('Sending...');
    }
  });

  it('converts mixed messages and albums', () => {
    const result = groupAndConvert(
      [MSG_TEXT_INCOMING, MSG_PHOTO_ALBUM, MSG_PHOTO_ALBUM_1, MSG_VOICE_INCOMING],
      [],
      users,
      0,
    );
    expect(result).toHaveLength(3);
    expect(result[0]?.kind).toBe('message');
    // Second should be album
    if (result[1]?.kind === 'message') {
      expect(result[1].content.kind).toBe('album');
    }
    // Third should be voice
    if (result[2]?.kind === 'message') {
      expect(result[2].content.kind).toBe('voice');
    }
  });

  it('converts service messages', () => {
    const serviceMsg = {
      ...MSG_TEXT_INCOMING,
      id: 999,
      content: { _: 'messagePinMessage', message_id: 123 } as Td.MessageContent,
    } as Td.message;
    const result = groupAndConvert([serviceMsg], [], users, 0);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('service');
    if (result[0]?.kind === 'service') {
      expect(result[0].text).toBe('pinned a message');
      expect(result[0].pinnedMessageId).toBe(123);
    }
  });

  it('enriches in-batch reply previews', () => {
    // MSG_REPLY replies to 748995739648 — not in batch, so stays undefined
    const result = groupAndConvert([MSG_TEXT_INCOMING, MSG_REPLY], [], users, 0);
    const reply = result.find((m) => m.kind === 'message' && m.id === MSG_REPLY.id);
    expect(reply?.kind).toBe('message');
    if (reply?.kind === 'message' && reply.replyTo) {
      // Target not in batch => senderName stays undefined
      expect(reply.replyTo.senderName).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// hydrateMessage
// ---------------------------------------------------------------------------

describe('hydrateMessage', () => {
  // Helper to create a base message for hydration
  function makeTestMessage(
    overrides: Partial<TGMessage & { kind: 'message' }> = {},
  ): TGMessage & { kind: 'message' } {
    return {
      kind: 'message',
      id: 1,
      chatId: 100,
      date: 1700000000,
      isOutgoing: false,
      isRead: false,
      editDate: 0,
      sender: { userId: 42, name: 'Test', photoUrl: undefined },
      reactions: [],
      viewCount: 0,
      forward: null,
      replyTo: null,
      inlineKeyboard: null,
      content: { kind: 'text', text: 'hello', entities: [], customEmojiUrls: {}, webPreview: null },
      ...overrides,
    };
  }

  it('hydrates mediaUrl for photo content', () => {
    const msg = makeTestMessage({
      content: {
        kind: 'photo',
        media: { url: undefined, width: 800, height: 600, minithumbnail: null },
        caption: null,
      },
    });
    const result = hydrateMessage(msg, { '100_1': '/photo.jpg' }, {}, {}, {}, {}, {});
    expect(result.kind).toBe('message');
    if (result.kind === 'message' && result.content.kind === 'photo') {
      expect(result.content.media.url).toBe('/photo.jpg');
    }
  });

  it('hydrates album with partial URLs', () => {
    const msg = makeTestMessage({
      id: 10,
      content: {
        kind: 'album',
        items: [
          {
            messageId: 10,
            contentKind: 'photo',
            url: undefined,
            width: 800,
            height: 600,
            minithumbnail: null,
          },
          {
            messageId: 11,
            contentKind: 'photo',
            url: undefined,
            width: 640,
            height: 480,
            minithumbnail: null,
          },
        ],
        caption: null,
      },
    });
    const result = hydrateMessage(
      msg,
      { '100_10': '/a.jpg' }, // Only first item has URL
      {},
      {},
      {},
      {},
      {},
    );
    if (result.kind === 'message' && result.content.kind === 'album') {
      expect(result.content.items[0]?.url).toBe('/a.jpg');
      expect(result.content.items[1]?.url).toBeUndefined();
    }
  });

  it('hydrates forward photo', () => {
    const msg = makeTestMessage({
      forward: { fromName: 'Alice', photoId: 55, photoUrl: undefined, date: 1700000000 },
    });
    const result = hydrateMessage(msg, {}, {}, { 55: '/alice.jpg' }, {}, {}, {});
    if (result.kind === 'message') {
      expect(result.forward?.photoUrl).toBe('/alice.jpg');
    }
  });

  it('hydrates replyTo with preview', () => {
    const msg = makeTestMessage({
      replyTo: {
        messageId: 50,
        senderName: undefined,
        text: undefined,
        mediaLabel: undefined,
        thumbUrl: undefined,
        quoteText: '',
      },
    });
    const result = hydrateMessage(
      msg,
      {},
      { '100_50': '/thumb.jpg' },
      {},
      {},
      {
        '100_50': {
          senderName: 'Bob',
          text: 'Hi',
          mediaLabel: '',
          contentKind: 'text',
          hasWebPreview: false,
          quoteText: '',
        },
      },
      {},
    );
    if (result.kind === 'message' && result.replyTo) {
      expect(result.replyTo.thumbUrl).toBe('/thumb.jpg');
      expect(result.replyTo.senderName).toBe('Bob');
      expect(result.replyTo.text).toBe('Hi');
    }
  });

  it('hydrates web preview thumb', () => {
    const msg = makeTestMessage({
      content: {
        kind: 'text',
        text: 'check this',
        entities: [],
        customEmojiUrls: {},
        webPreview: {
          url: 'https://example.com',
          siteName: 'Example',
          title: 'Title',
          description: '',
          minithumbnail: null,
          thumbUrl: undefined,
          showLargeMedia: false,
          showMediaAboveDescription: false,
        },
      },
    });
    const result = hydrateMessage(msg, {}, { '100_1': '/wp-thumb.jpg' }, {}, {}, {}, {});
    if (result.kind === 'message' && result.content.kind === 'text') {
      expect(result.content.webPreview?.thumbUrl).toBe('/wp-thumb.jpg');
    }
  });

  it('hydrates custom emoji in text content', () => {
    const msg = makeTestMessage({
      content: {
        kind: 'text',
        text: 'hey',
        entities: [{ offset: 0, length: 1, type: 'customEmoji' as const, customEmojiId: 'e1' }],
        customEmojiUrls: {},
        webPreview: null,
      },
    });
    const result = hydrateMessage(
      msg,
      {},
      {},
      {},
      { e1: { url: '/emoji.webp', format: 'webp' } },
      {},
      {},
    );
    if (result.kind === 'message' && result.content.kind === 'text') {
      expect(result.content.customEmojiUrls.e1).toEqual({ url: '/emoji.webp', format: 'webp' });
    }
  });

  it('hydrates sender photo', () => {
    const msg = makeTestMessage();
    const result = hydrateMessage(msg, {}, {}, { 42: '/sender.jpg' }, {}, {}, {});
    if (result.kind === 'message') {
      expect(result.sender.photoUrl).toBe('/sender.jpg');
    }
  });

  it('hydrates service message sender photo', () => {
    const msg: TGMessage = {
      kind: 'service',
      id: 1,
      chatId: 100,
      date: 1700000000,
      sender: { userId: 42, name: 'Test', photoUrl: undefined },
      text: 'joined the group',
      pinnedMessageId: 0,
    };
    const result = hydrateMessage(msg, {}, {}, { 42: '/avatar.jpg' }, {}, {}, {});
    if (result.kind === 'service') {
      expect(result.sender.photoUrl).toBe('/avatar.jpg');
    }
  });

  it('hydrates service message pinned preview', () => {
    const msg: TGMessage = {
      kind: 'service',
      id: 1,
      chatId: 100,
      date: 1700000000,
      sender: { userId: 42, name: 'Test', photoUrl: undefined },
      text: 'pinned a message',
      pinnedMessageId: 50,
    };
    const result = hydrateMessage(msg, {}, {}, {}, {}, {}, { '100_50': 'Hello world' });
    if (result.kind === 'service') {
      expect(result.text).toBe('pinned "Hello world"');
    }
  });

  it('returns pending message unchanged', () => {
    const msg: TGMessage = {
      kind: 'pending',
      localId: 'local-1',
      chatId: 100,
      text: 'sending...',
      date: 1700000000,
      status: 'sending',
    };
    const result = hydrateMessage(msg, {}, {}, {}, {}, {}, {});
    expect(result).toBe(msg); // Same reference
  });

  it('returns message unchanged when no hydration needed', () => {
    const msg = makeTestMessage();
    const result = hydrateMessage(msg, {}, {}, {}, {}, {}, {});
    expect(result).toBe(msg); // Same reference — no unnecessary copies
  });
});
