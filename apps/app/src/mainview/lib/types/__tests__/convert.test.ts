import type * as Td from 'tdlib-types';
import { describe, expect, it } from 'vitest';
import {
  enrichReplyPreviews,
  extractForwardName,
  extractInlineKeyboard,
  extractMessagePreview,
  extractServiceText,
  groupUIMessages,
  toChatKind,
  toUIChat,
  toUIMessage,
  toUIPendingMessage,
  toUIReactions,
  toUITextEntities,
  toUIUser,
} from '../convert';
import type { PendingMessage } from '../index';
import type { UIPendingMessage } from '../ui';
import {
  CHAT_CHANNEL,
  CHAT_HY_RID,
  CHAT_MARUSIA,
  CHAT_SUPERGROUP,
  MSG_ANIMATION,
  MSG_FORWARDED,
  MSG_PHOTO_ALBUM,
  MSG_PHOTO_ALBUM_1,
  MSG_PHOTO_SINGLE,
  MSG_REPLY,
  MSG_STICKER_INCOMING,
  MSG_TEXT_INCOMING,
  MSG_TEXT_OUTGOING,
  MSG_TEXT_WITH_ENTITIES,
  MSG_TEXT_WITH_LINK_PREVIEW,
  MSG_VIDEO,
  MSG_VIDEO_NOTE,
  MSG_VOICE_INCOMING,
  MSG_WITH_REACTIONS,
  USER_HY_RID,
  USER_MARUSIA,
  USER_ME,
  USER_VALIDOL,
  USERS_MAP,
} from './fixtures';

const users = USERS_MAP;

// ---------------------------------------------------------------------------
// toUIMessage
// ---------------------------------------------------------------------------

describe('toUIMessage', () => {
  it('converts plain text incoming message', () => {
    const ui = toUIMessage(MSG_TEXT_INCOMING, users, 0);
    expect(ui.id).toBe(751105474560);
    expect(ui.contentKind).toBe('text');
    expect(ui.text).toBe('All good, take your time.');
    expect(ui.entities).toEqual([]);
    expect(ui.mediaLabel).toBe('');
    expect(ui.mediaAlbumId).toBe('0');
    expect(ui.isOutgoing).toBe(false);
    expect(ui.senderUserId).toBe(6098406782);
    expect(ui.senderName).toBe('Hy Rid');
    expect(ui.replyToMessageId).toBe(0);
    expect(ui.editDate).toBe(0);
    expect(ui.reactions).toEqual([]);
    expect(ui.webPreview).toBeNull();
    expect(ui.forwardFromName).toBeNull();
    expect(ui.forwardDate).toBe(0);
    expect(ui.serviceText).toBeNull();
    expect(ui.inlineKeyboard).toBeNull();
    expect(ui.replyPreview).toBeNull();
  });

  it('converts text with entities and reactions', () => {
    const ui = toUIMessage(MSG_TEXT_WITH_ENTITIES, users, 0);
    expect(ui.text).toContain('Hey Andery!');
    expect(ui.entities).toHaveLength(6);
    expect(ui.entities[0]).toEqual({ offset: 103, length: 12, type: 'bold' });
    expect(ui.entities[1]).toEqual({ offset: 371, length: 17, type: 'url' });
    expect(ui.reactions).toHaveLength(1);
    expect(ui.reactions[0]).toEqual({ emoji: '👍', count: 1, chosen: true });
  });

  it('converts photo with caption', () => {
    const ui = toUIMessage(MSG_PHOTO_SINGLE, users, 0);
    expect(ui.contentKind).toBe('photo');
    expect(ui.text).toBe('а ещё в футбольных менеджерах вот такая хуйня бывает если долго играть');
    expect(ui.mediaLabel).toBe('Photo');
  });

  it('converts photo without caption', () => {
    const ui = toUIMessage(MSG_PHOTO_ALBUM, users, 0);
    expect(ui.contentKind).toBe('photo');
    expect(ui.text).toBe('');
    expect(ui.mediaLabel).toBe('Photo');
  });

  it('converts video message', () => {
    const ui = toUIMessage(MSG_VIDEO, users, 0);
    expect(ui.contentKind).toBe('video');
    expect(ui.text).toBe('');
    expect(ui.mediaLabel).toBe('Video');
  });

  it('converts voice note', () => {
    const ui = toUIMessage(MSG_VOICE_INCOMING, users, 0);
    expect(ui.contentKind).toBe('voice');
    expect(ui.mediaLabel).toBe('Voice message');
  });

  it('converts video note', () => {
    const ui = toUIMessage(MSG_VIDEO_NOTE, users, 0);
    expect(ui.contentKind).toBe('videoNote');
    expect(ui.mediaLabel).toBe('Video message');
  });

  it('converts sticker with emoji', () => {
    const ui = toUIMessage(MSG_STICKER_INCOMING, users, 0);
    expect(ui.contentKind).toBe('sticker');
    expect(ui.mediaLabel).toBe('⭐');
  });

  it('converts animation (GIF)', () => {
    const ui = toUIMessage(MSG_ANIMATION, users, 0);
    expect(ui.contentKind).toBe('animation');
    expect(ui.text).toBe('');
    expect(ui.mediaLabel).toBe('GIF');
  });

  it('converts reactions from with_reactions message', () => {
    const ui = toUIMessage(MSG_WITH_REACTIONS, users, 0);
    expect(ui.reactions).toHaveLength(1);
    expect(ui.reactions[0]).toEqual({ emoji: '👍', count: 1, chosen: true });
  });

  it('converts link preview', () => {
    const ui = toUIMessage(MSG_TEXT_WITH_LINK_PREVIEW, users, 0);
    expect(ui.webPreview).toEqual({
      url: 'https://t.me/startupseurope',
      siteName: 'Telegram',
      title: 'Алекс Беляев @ Community Sprints',
      description:
        'Co-founder @ Community Sprints: сommunity-driven platform to grow career & business skills\n\nПишу о развитии компании в Европе и делюсь полезными материалами  про карьеру и бизнес\n\nStartupWiseGuys.com alumni \n\nDM @belalex',
      minithumbnail: null,
      showLargeMedia: false,
      showMediaAboveDescription: false,
    });
  });

  it('converts forwarded message from user', () => {
    const ui = toUIMessage(MSG_FORWARDED, users, 0);
    expect(ui.forwardFromName).toBe('Маруся');
    expect(ui.forwardDate).toBe(1772461989);
  });

  it('converts reply message', () => {
    const ui = toUIMessage(MSG_REPLY, users, 0);
    expect(ui.replyToMessageId).toBe(748995739648);
    expect(ui.replyPreview).toBeNull(); // not populated until enrichReplyPreviews
  });

  it('handles album messages', () => {
    const ui1 = toUIMessage(MSG_PHOTO_ALBUM, users, 0);
    const ui2 = toUIMessage(MSG_PHOTO_ALBUM_1, users, 0);
    expect(ui1.mediaAlbumId).toBe('14179696327798362');
    expect(ui2.mediaAlbumId).toBe('14179696327798362');
  });

  it('marks outgoing messages', () => {
    const ui = toUIMessage(MSG_TEXT_OUTGOING, users, 0);
    expect(ui.isOutgoing).toBe(true);
  });

  it('computes isRead for outgoing messages', () => {
    const read = toUIMessage(MSG_TEXT_OUTGOING, users, 751103377408);
    expect(read.isRead).toBe(true);

    const unread = toUIMessage(MSG_TEXT_OUTGOING, users, 100);
    expect(unread.isRead).toBe(false);
  });

  it('resolves sender name for unknown user', () => {
    const unknownSenderMsg = {
      ...MSG_TEXT_INCOMING,
      sender_id: { _: 'messageSenderUser' as const, user_id: 99999 },
    };
    const ui = toUIMessage(unknownSenderMsg, users, 0);
    expect(ui.senderName).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// toUIChat
// ---------------------------------------------------------------------------

describe('toUIChat', () => {
  it('converts private chat (Hy Rid)', () => {
    const ui = toUIChat(CHAT_HY_RID, { photoUrl: null, user: undefined, isOnline: false });
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
    const ui = toUIChat(CHAT_MARUSIA, {
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
    const ui = toUIChat(CHAT_SUPERGROUP, { photoUrl: null, user: undefined, isOnline: false });
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
    const ui = toUIChat(CHAT_CHANNEL, { photoUrl: null, user: undefined, isOnline: false });
    expect(ui.kind).toBe('channel');
    expect(ui.isBot).toBe(false);
    expect(ui.isOnline).toBe(false);
    expect(ui.user).toBeNull();
  });

  it('handles chat with no last message', () => {
    // Supergroup chat has no last_message set (we'll test with a constructed chat)
    const chatNoMsg = { ...CHAT_SUPERGROUP, last_message: undefined } as Td.chat;
    const ui = toUIChat(chatNoMsg, { photoUrl: null, user: undefined, isOnline: false });
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
// toUIUser
// ---------------------------------------------------------------------------

describe('toUIUser', () => {
  it('converts premium user with username (Andrey)', () => {
    const ui = toUIUser(USER_ME);
    expect(ui.id).toBe(91754006);
    expect(ui.firstName).toBe('Andrey');
    expect(ui.lastName).toBe('');
    expect(ui.fullName).toBe('Andrey');
    expect(ui.username).toBe('avemeva');
    expect(ui.isPremium).toBe(true);
    expect(ui.emojiStatusId).toBeNull();
  });

  it('converts non-premium user without username (Hy Rid)', () => {
    const ui = toUIUser(USER_HY_RID);
    expect(ui.id).toBe(6098406782);
    expect(ui.fullName).toBe('Hy Rid');
    expect(ui.username).toBeNull();
    expect(ui.isPremium).toBe(false);
    expect(ui.emojiStatusId).toBeNull();
  });

  it('converts user with emoji status (Маруся)', () => {
    const ui = toUIUser(USER_MARUSIA);
    expect(ui.fullName).toBe('Маруся');
    expect(ui.username).toBe('naluneteplo');
    expect(ui.isPremium).toBe(true);
    expect(ui.emojiStatusId).toBe('5316659463606796443');
  });

  it('converts user with emoji status (Валидол)', () => {
    const ui = toUIUser(USER_VALIDOL);
    expect(ui.fullName).toBe('Валидол');
    expect(ui.username).toBe('kxt9_8');
    expect(ui.emojiStatusId).toBe('5393542049674831462');
  });
});

// ---------------------------------------------------------------------------
// toUITextEntities
// ---------------------------------------------------------------------------

describe('toUITextEntities', () => {
  it('converts bold entity', () => {
    const entities: Td.textEntity[] = [
      { _: 'textEntity', offset: 0, length: 4, type: { _: 'textEntityTypeBold' } },
    ];
    const result = toUITextEntities(entities);
    expect(result).toEqual([{ offset: 0, length: 4, type: 'bold' }]);
  });

  it('converts url entity', () => {
    const entities: Td.textEntity[] = [
      { _: 'textEntity', offset: 0, length: 15, type: { _: 'textEntityTypeUrl' } },
    ];
    const result = toUITextEntities(entities);
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
    const result = toUITextEntities(entities);
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
    const result = toUITextEntities(entities);
    expect(result).toEqual([{ offset: 0, length: 5, type: 'customEmoji', customEmojiId: '12345' }]);
  });

  it('converts spoiler entity', () => {
    const entities: Td.textEntity[] = [
      { _: 'textEntity', offset: 5, length: 3, type: { _: 'textEntityTypeSpoiler' } },
    ];
    const result = toUITextEntities(entities);
    expect(result).toEqual([{ offset: 5, length: 3, type: 'spoiler' }]);
  });

  it('handles empty entities array', () => {
    expect(toUITextEntities([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toUIReactions
// ---------------------------------------------------------------------------

describe('toUIReactions', () => {
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
    const result = toUIReactions(info);
    expect(result).toEqual([
      { emoji: '🔥', count: 7, chosen: true },
      { emoji: '👎', count: 1, chosen: false },
    ]);
  });

  it('returns empty array for undefined info', () => {
    expect(toUIReactions(undefined)).toEqual([]);
  });

  it('returns empty array when no reactions', () => {
    const info: Td.messageInteractionInfo = {
      _: 'messageInteractionInfo',
      view_count: 5,
      forward_count: 0,
    };
    expect(toUIReactions(info)).toEqual([]);
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
    const result = toUIReactions(info);
    expect(result).toEqual([{ emoji: '', count: 2, chosen: false }]);
  });
});

// ---------------------------------------------------------------------------
// groupUIMessages
// ---------------------------------------------------------------------------

describe('groupUIMessages', () => {
  it('groups singles', () => {
    const m1 = toUIMessage(MSG_TEXT_INCOMING, users, 0);
    const m2 = toUIMessage(MSG_VIDEO, users, 0);
    const groups = groupUIMessages([m1, m2]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.type).toBe('single');
    expect(groups[1]?.type).toBe('single');
  });

  it('groups album messages together', () => {
    const a1 = toUIMessage(MSG_PHOTO_ALBUM, users, 0);
    const a2 = toUIMessage(MSG_PHOTO_ALBUM_1, users, 0);
    const groups = groupUIMessages([a1, a2]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe('album');
    if (groups[0]?.type === 'album') {
      expect(groups[0]?.messages).toHaveLength(2);
    }
  });

  it('treats single album-id message as single', () => {
    const a1 = toUIMessage(MSG_PHOTO_ALBUM, users, 0);
    const groups = groupUIMessages([a1]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe('single');
  });

  it('handles pending messages as singles', () => {
    const pending: UIPendingMessage = {
      localId: 'local-1',
      chatId: 100,
      text: 'Sending...',
      date: 1700000000,
      isPending: true,
      status: 'sending',
    };
    const m1 = toUIMessage(MSG_TEXT_INCOMING, users, 0);
    const groups = groupUIMessages([m1, pending]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.type).toBe('single');
    expect(groups[1]?.type).toBe('single');
  });

  it('does not merge album across pending message', () => {
    const a1 = toUIMessage(MSG_PHOTO_ALBUM, users, 0);
    const pending: UIPendingMessage = {
      localId: 'local-2',
      chatId: 100,
      text: 'Interrupting...',
      date: 1700000000,
      isPending: true,
      status: 'sending',
    };
    const a2 = toUIMessage(MSG_PHOTO_ALBUM_1, users, 0);
    const groups = groupUIMessages([a1, pending, a2]);
    expect(groups).toHaveLength(3);
    // a1 alone => single, pending => single, a2 alone => single
    expect(groups.every((g) => g.type === 'single')).toBe(true);
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

  it('returns empty string for undefined message', () => {
    expect(extractMessagePreview(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// enrichReplyPreviews
// ---------------------------------------------------------------------------

describe('enrichReplyPreviews', () => {
  it('leaves reply preview null when target not found (target is in a different context)', () => {
    const reply = toUIMessage(MSG_REPLY, users, 0);
    const enriched = enrichReplyPreviews([reply]);
    expect(enriched[0]?.replyPreview).toBeNull();
  });

  it('leaves non-reply messages unchanged', () => {
    const plain = toUIMessage(MSG_TEXT_INCOMING, users, 0);
    const enriched = enrichReplyPreviews([plain]);
    expect(enriched[0]?.replyPreview).toBeNull();
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

// ---------------------------------------------------------------------------
// toUIPendingMessage
// ---------------------------------------------------------------------------

describe('toUIPendingMessage', () => {
  it('converts pending message', () => {
    const pending: PendingMessage = {
      _pending: 'sending',
      localId: 'local-abc',
      chat_id: 100,
      text: 'Sending this...',
      date: 1700000500,
    };
    const ui = toUIPendingMessage(pending);
    expect(ui.localId).toBe('local-abc');
    expect(ui.chatId).toBe(100);
    expect(ui.text).toBe('Sending this...');
    expect(ui.date).toBe(1700000500);
    expect(ui.isPending).toBe(true);
    expect(ui.status).toBe('sending');
  });

  it('converts failed pending message', () => {
    const pending: PendingMessage = {
      _pending: 'failed',
      localId: 'local-fail',
      chat_id: 200,
      text: 'Failed message',
      date: 1700001000,
    };
    const ui = toUIPendingMessage(pending);
    expect(ui.status).toBe('failed');
  });
});
