import type * as Td from 'tdlib-types';
import type { CustomEmojiInfo } from '../telegram';
import type { PendingMessage } from './index';
import type {
  ChatKind,
  MessageContentKind,
  TextEntityKind,
  TGAlbumContent,
  TGAlbumItem,
  TGCaption,
  TGChat,
  TGChatLastMessage,
  TGContent,
  TGForward,
  TGKeyboardRow,
  TGMessage,
  TGMessageBase,
  TGPendingMessage,
  TGReaction,
  TGReplyPreview,
  TGReplyTo,
  TGSearchResult,
  TGSender,
  TGServiceAction,
  TGServiceMessage,
  TGTextEntity,
  TGTypingUser,
  TGUser,
  TGWebPreview,
} from './tg';

// --- Content kind ---

const CONTENT_KIND_MAP: Record<string, MessageContentKind> = {
  messageText: 'text',
  messagePhoto: 'photo',
  messageVideo: 'video',
  messageVoiceNote: 'voice',
  messageVideoNote: 'videoNote',
  messageSticker: 'sticker',
  messageDocument: 'document',
  messageAnimation: 'animation',
  messageAudio: 'audio',
  messagePoll: 'poll',
  messageContact: 'contact',
  messageLocation: 'location',
  messageVenue: 'venue',
  messageDice: 'dice',
  messageAnimatedEmoji: 'sticker',
};

function toContentKind(content: Td.MessageContent): MessageContentKind {
  return CONTENT_KIND_MAP[content._] ?? 'unsupported';
}

// --- Text extraction ---

export function extractText(content: Td.MessageContent): string {
  if (content._ === 'messageText') return content.text.text;
  if ('caption' in content && content.caption) return (content.caption as Td.formattedText).text;
  return '';
}

// --- Media label ---

export function extractMediaLabel(content: Td.MessageContent): string {
  switch (content._) {
    case 'messagePhoto':
      return 'Photo';
    case 'messageVideo':
      return 'Video';
    case 'messageVoiceNote':
      return 'Voice message';
    case 'messageVideoNote':
      return 'Video message';
    case 'messageSticker':
      return content.sticker.emoji ?? 'Sticker';
    case 'messageDocument':
      return content.document?.file_name || 'File';
    case 'messageAnimation':
      return 'GIF';
    case 'messageAudio':
      return 'Audio';
    case 'messagePoll':
      return 'Poll';
    case 'messageContact':
      return 'Contact';
    case 'messageLocation':
      return 'Location';
    case 'messageVenue':
      return 'Venue';
    case 'messageDice':
      return content.emoji;
    case 'messageAnimatedEmoji':
      return content.emoji;
    default:
      return '';
  }
}

// --- Voice note metadata ---

function extractVoiceSpeechStatus(
  content: Td.MessageContent,
): 'none' | 'pending' | 'done' | 'error' {
  if (content._ !== 'messageVoiceNote') return 'none';
  const r = content.voice_note.speech_recognition_result;
  if (!r) return 'none';
  switch (r._) {
    case 'speechRecognitionResultPending':
      return 'pending';
    case 'speechRecognitionResultText':
      return 'done';
    case 'speechRecognitionResultError':
      return 'error';
    default:
      return 'none';
  }
}

function extractVoiceSpeechText(content: Td.MessageContent): string {
  if (content._ !== 'messageVoiceNote') return '';
  const r = content.voice_note.speech_recognition_result;
  if (r?._ === 'speechRecognitionResultText') return r.text;
  return '';
}

// --- Sticker metadata ---

function extractStickerFormat(content: Td.MessageContent): 'webp' | 'tgs' | 'webm' | null {
  if (content._ === 'messageSticker') {
    switch (content.sticker.format._) {
      case 'stickerFormatWebp':
        return 'webp';
      case 'stickerFormatTgs':
        return 'tgs';
      case 'stickerFormatWebm':
        return 'webm';
      default:
        return null;
    }
  }
  if (content._ === 'messageAnimatedEmoji') {
    const sticker = content.animated_emoji.sticker;
    if (!sticker) return null;
    switch (sticker.format._) {
      case 'stickerFormatWebp':
        return 'webp';
      case 'stickerFormatTgs':
        return 'tgs';
      case 'stickerFormatWebm':
        return 'webm';
      default:
        return null;
    }
  }
  return null;
}

// --- Web preview ---

/** Extract minithumbnail from any link preview type that carries a photo or thumbnail. */
function extractLinkPreviewMinithumbnail(lp: Td.linkPreview): string | null {
  const t = lp.type;
  if (!t) return null;
  switch (t._) {
    case 'linkPreviewTypePhoto':
      return t.photo.minithumbnail?.data ?? null;
    case 'linkPreviewTypeVideo':
      return t.cover?.minithumbnail?.data ?? t.video.minithumbnail?.data ?? null;
    case 'linkPreviewTypeArticle':
    case 'linkPreviewTypeApp':
      return ('photo' in t && t.photo?.minithumbnail?.data) || null;
    case 'linkPreviewTypeEmbeddedVideoPlayer':
    case 'linkPreviewTypeEmbeddedAnimationPlayer':
    case 'linkPreviewTypeEmbeddedAudioPlayer':
      return ('thumbnail' in t && t.thumbnail?.minithumbnail?.data) || null;
    default:
      return null;
  }
}

// --- Reply preview from raw Td message ---

/** Build a TGReplyPreview from a raw TDLib message + user map. */
export function buildReplyPreview(
  target: Td.message,
  users: Map<number, Td.user>,
  quoteText: string,
): TGReplyPreview {
  return {
    senderName: resolveSenderName(target.sender_id, users),
    text: extractText(target.content),
    mediaLabel: extractMediaLabel(target.content),
    contentKind: toContentKind(target.content),
    hasWebPreview: target.content._ === 'messageText' && !!target.content.link_preview,
    quoteText,
  };
}

// --- Message preview (for chat list) ---

export function extractMessagePreview(msg: Td.message | undefined): string {
  if (!msg) return '';
  const text = extractText(msg.content);
  if (text) return text;
  return extractMediaLabel(msg.content);
}

// --- Sender ---

function resolveSenderName(sender: Td.MessageSender, users: Map<number, Td.user>): string {
  if (sender._ === 'messageSenderUser') {
    const user = users.get(sender.user_id);
    if (user) return [user.first_name, user.last_name].filter(Boolean).join(' ');
  }
  return 'Unknown';
}

// --- Forward ---

export function extractForwardName(
  info: Td.messageForwardInfo | undefined,
  users: Map<number, Td.user>,
  chats?: Td.chat[],
): string | null {
  if (!info) return null;
  const origin = info.origin;
  switch (origin._) {
    case 'messageOriginUser': {
      const user = users.get(origin.sender_user_id);
      return user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'Unknown';
    }
    case 'messageOriginHiddenUser':
      return origin.sender_name;
    case 'messageOriginChat': {
      const chat = chats?.find((c) => c.id === origin.sender_chat_id);
      return chat?.title ?? 'Group';
    }
    case 'messageOriginChannel': {
      const chat = chats?.find((c) => c.id === origin.chat_id);
      return chat?.title ?? (origin.author_signature || 'Channel');
    }
    default:
      return null;
  }
}

export function extractForwardPhotoId(info: Td.messageForwardInfo | undefined): number {
  if (!info) return 0;
  const origin = info.origin;
  switch (origin._) {
    case 'messageOriginUser':
      return origin.sender_user_id;
    case 'messageOriginChat':
      return origin.sender_chat_id;
    case 'messageOriginChannel':
      return origin.chat_id;
    default:
      return 0;
  }
}

// --- Service action ---

export function extractServiceAction(content: Td.MessageContent): TGServiceAction | null {
  switch (content._) {
    case 'messageChatAddMembers':
      return { type: 'join' };
    case 'messageChatDeleteMember':
      return { type: 'leave' };
    case 'messageChatChangeTitle':
      return { type: 'changeTitle', title: content.title };
    case 'messageChatChangePhoto':
      return { type: 'changePhoto' };
    case 'messageChatDeletePhoto':
      return { type: 'deletePhoto' };
    case 'messageBasicGroupChatCreate':
      return { type: 'createGroup', title: content.title };
    case 'messageSupergroupChatCreate':
      return { type: 'createGroup', title: content.title };
    case 'messagePinMessage':
      return { type: 'pin', messageId: content.message_id, previewText: null, contentKind: null };
    case 'messageScreenshotTaken':
      return { type: 'screenshot' };
    case 'messageCustomServiceAction':
      return { type: 'custom', text: content.text };
    case 'messageChatJoinByLink':
      return { type: 'joinByLink' };
    case 'messageChatJoinByRequest':
      return { type: 'joinByRequest' };
    default:
      return null;
  }
}

// --- Inline keyboard ---

export function extractInlineKeyboard(msg: Td.message): TGKeyboardRow[] | null {
  if (msg.reply_markup?._ !== 'replyMarkupInlineKeyboard') return null;
  return msg.reply_markup.rows.map((row) =>
    row.map((btn) => {
      const result: { text: string; url?: string } = { text: btn.text };
      if (btn.type._ === 'inlineKeyboardButtonTypeUrl') {
        result.url = btn.type.url;
      }
      return result;
    }),
  );
}

// --- Entity kind ---

const ENTITY_KIND_MAP: Record<string, TextEntityKind> = {
  textEntityTypeBold: 'bold',
  textEntityTypeItalic: 'italic',
  textEntityTypeCode: 'code',
  textEntityTypePre: 'pre',
  textEntityTypePreCode: 'preCode',
  textEntityTypeUrl: 'url',
  textEntityTypeEmailAddress: 'email',
  textEntityTypeTextUrl: 'textUrl',
  textEntityTypeStrikethrough: 'strikethrough',
  textEntityTypeUnderline: 'underline',
  textEntityTypeMention: 'mention',
  textEntityTypeHashtag: 'hashtag',
  textEntityTypeBotCommand: 'botCommand',
  textEntityTypeSpoiler: 'spoiler',
  textEntityTypeCustomEmoji: 'customEmoji',
};

// --- Public converters ---

export function toTGTextEntities(entities: Td.textEntity[]): TGTextEntity[] {
  return entities.map((e) => {
    const result: TGTextEntity = {
      offset: e.offset,
      length: e.length,
      type: ENTITY_KIND_MAP[e.type._] ?? 'unknown',
    };
    if (e.type._ === 'textEntityTypeTextUrl') {
      result.url = e.type.url;
    }
    if (e.type._ === 'textEntityTypeCustomEmoji') {
      result.customEmojiId = String(e.type.custom_emoji_id);
    }
    return result;
  });
}

/** Telegram sends some emoji without the variation selector (e.g. U+2764 instead of U+2764 U+FE0F).
 *  Browsers render bare BMP codepoints in text presentation (thin/outlined).
 *  Appending U+FE0F forces full-color emoji presentation.
 *  Only BMP codepoints (emoji.length === 1) need this — surrogate pair emoji (🔥, 👍, etc.)
 *  already have emoji presentation by default. */
function normalizeEmoji(emoji: string): string {
  if (emoji.length !== 1) return emoji;
  return `${emoji}\uFE0F`;
}

export function toTGReactions(info: Td.messageInteractionInfo | undefined): TGReaction[] {
  const reactions = info?.reactions?.reactions;
  if (!reactions) return [];
  return reactions.map((r) => ({
    emoji: r.type._ === 'reactionTypeEmoji' ? normalizeEmoji(r.type.emoji) : '',
    count: r.total_count,
    chosen: r.is_chosen,
  }));
}

export function toChatKind(type: Td.ChatType): ChatKind {
  switch (type._) {
    case 'chatTypePrivate':
      return 'private';
    case 'chatTypeBasicGroup':
      return 'basicGroup';
    case 'chatTypeSupergroup':
      return type.is_channel ? 'channel' : 'supergroup';
    default:
      return 'private';
  }
}

export type TGChatContext = {
  photoUrl: string | null;
  user: Td.user | undefined;
  isOnline: boolean;
  myUserId?: number;
  users?: Map<number, Td.user>;
  avatarUrl?: string | undefined;
  lastMessageThumbUrl?: string | null;
  typing?: TGTypingUser[] | null;
};

export function toTGChat(chat: Td.chat, ctx: TGChatContext): TGChat {
  const draftInput = chat.draft_message?.input_message_text;
  const draftText = draftInput?._ === 'inputMessageText' ? draftInput.text.text || null : null;
  const kind = toChatKind(chat.type);
  const isPrivate = kind === 'private';
  const isGroup = kind === 'basicGroup' || kind === 'supergroup';
  const lastMsg = chat.last_message;
  const isDeletedUser =
    isPrivate && (ctx.user?.type?._ === 'userTypeDeleted' || (!chat.title && !ctx.user));
  const title = chat.title || (isDeletedUser ? 'Deleted Account' : '');

  const lastMessage: TGChatLastMessage | null = lastMsg
    ? {
        id: lastMsg.id,
        date: lastMsg.date,
        contentKind: toContentKind(lastMsg.content),
        text: extractText(lastMsg.content) || null,
        isOutgoing: lastMsg.is_outgoing,
        isForwarded: !!lastMsg.forward_info,
        status: !lastMsg.is_outgoing
          ? 'none'
          : lastMsg.id <= chat.last_read_outbox_message_id
            ? 'read'
            : 'sent',
        senderName:
          isGroup &&
          !lastMsg.is_outgoing &&
          ctx.users &&
          lastMsg.sender_id._ === 'messageSenderUser'
            ? (ctx.users.get(lastMsg.sender_id.user_id)?.first_name ?? null)
            : null,
        isOwnMessage: lastMsg.is_outgoing,
        thumbUrl: ctx.lastMessageThumbUrl ?? null,
      }
    : null;

  return {
    id: chat.id,
    title,
    kind,
    userId: chat.type._ === 'chatTypePrivate' ? chat.type.user_id : 0,
    unreadCount: chat.unread_count,
    isPinned: chat.positions.some((p) => p.is_pinned),
    lastMessage,
    photoUrl: ctx.photoUrl,
    isMuted: chat.notification_settings.mute_for > 0,
    unreadMentionCount: chat.unread_mention_count,
    unreadReactionCount: chat.unread_reaction_count,
    draftText,
    isBot: isPrivate && ctx.user?.type?._ === 'userTypeBot',
    isOnline: isPrivate && ctx.isOnline,
    isSavedMessages:
      isPrivate &&
      !!ctx.myUserId &&
      chat.type._ === 'chatTypePrivate' &&
      chat.type.user_id === ctx.myUserId,
    user: ctx.user ? toTGUser(ctx.user) : null,
    avatarUrl: ctx.avatarUrl,
    typing: ctx.typing ?? null,
  };
}

export function toTGSearchResult(
  msg: Td.message & { chat_title?: string },
  photoUrl: string | null,
): TGSearchResult {
  return {
    chatId: msg.chat_id,
    messageId: msg.id,
    chatTitle: msg.chat_title ?? '',
    text: extractSearchResultText(msg),
    date: msg.date,
    photoUrl,
  };
}

function extractSearchResultText(msg: Td.message): string {
  if (msg.content._ === 'messageText') return msg.content.text.text;
  return getMediaTypeLabel(msg.content._);
}

function getMediaTypeLabel(contentType: string): string {
  const labels: Record<string, string> = {
    messagePhoto: 'Photo',
    messageVideo: 'Video',
    messageVoiceNote: 'Voice message',
    messageVideoNote: 'Video message',
    messageDocument: 'Document',
    messageAnimation: 'GIF',
    messageAudio: 'Audio',
    messageSticker: 'Sticker',
    messagePoll: 'Poll',
    messageContact: 'Contact',
    messageLocation: 'Location',
    messageVenue: 'Venue',
    messageDice: 'Dice',
  };
  return labels[contentType] ?? 'Message';
}

export function toTGUser(user: Td.user): TGUser {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: [user.first_name, user.last_name].filter(Boolean).join(' '),
    username: user.usernames?.active_usernames?.[0] ?? null,
    isPremium: user.is_premium,
    emojiStatusId:
      user.emoji_status?.type._ === 'emojiStatusTypeCustomEmoji'
        ? String(user.emoji_status.type.custom_emoji_id)
        : null,
  };
}

// ===========================================================================
// Compositional converters (new)
// ===========================================================================

// --- toTGContent ---

function extractCaptionNew(content: Td.MessageContent): TGCaption | null {
  if (!('caption' in content) || !content.caption) return null;
  const ft = content.caption as Td.formattedText;
  if (!ft.text) return null;
  return {
    text: ft.text,
    entities: toTGTextEntities(ft.entities),
    customEmojiUrls: {},
  };
}

function extractWebPreviewNew(content: Td.MessageContent): TGWebPreview | null {
  if (content._ !== 'messageText' || !content.link_preview) return null;
  const lp = content.link_preview;
  const minithumbnail = extractLinkPreviewMinithumbnail(lp);
  return {
    url: lp.url,
    siteName: lp.site_name,
    title: lp.title,
    description: lp.description?.text ?? '',
    minithumbnail,
    thumbUrl: undefined,
    showLargeMedia: lp.show_large_media,
    showMediaAboveDescription: lp.show_media_above_description,
  };
}

export function toTGContent(content: Td.MessageContent): TGContent {
  switch (content._) {
    case 'messageText': {
      return {
        kind: 'text',
        text: content.text.text,
        entities: toTGTextEntities(content.text.entities),
        customEmojiUrls: {},
        webPreview: extractWebPreviewNew(content),
      };
    }
    case 'messagePhoto': {
      const sizes = content.photo.sizes;
      const largest = sizes.length > 0 ? (sizes[sizes.length - 1] as Td.photoSize) : null;
      return {
        kind: 'photo',
        media: {
          url: undefined,
          width: largest?.width ?? 0,
          height: largest?.height ?? 0,
          minithumbnail: content.photo.minithumbnail?.data ?? null,
        },
        caption: extractCaptionNew(content),
      };
    }
    case 'messageVideo': {
      return {
        kind: 'video',
        media: {
          url: undefined,
          width: content.video.width,
          height: content.video.height,
          minithumbnail: content.video.minithumbnail?.data ?? null,
        },
        isGif: false,
        caption: extractCaptionNew(content),
      };
    }
    case 'messageAnimation': {
      return {
        kind: 'animation',
        media: {
          url: undefined,
          width: content.animation.width,
          height: content.animation.height,
          minithumbnail: content.animation.minithumbnail?.data ?? null,
        },
        caption: extractCaptionNew(content),
      };
    }
    case 'messageVoiceNote': {
      return {
        kind: 'voice',
        url: undefined,
        waveform: content.voice_note.waveform ?? null,
        duration: content.voice_note.duration,
        fileSize: content.voice_note.voice.size || content.voice_note.voice.expected_size,
        speechStatus: extractVoiceSpeechStatus(content),
        speechText: extractVoiceSpeechText(content),
      };
    }
    case 'messageVideoNote': {
      return {
        kind: 'videoNote',
        media: {
          url: undefined,
          width: content.video_note.length,
          height: content.video_note.length,
          minithumbnail: null,
        },
        duration: content.video_note.duration ?? 0,
        speechStatus: 'none',
        speechText: '',
      };
    }
    case 'messageSticker': {
      const fmt = extractStickerFormat(content);
      return {
        kind: 'sticker',
        url: undefined,
        format: fmt ?? 'webp',
        emoji: content.sticker.emoji ?? '',
        width: content.sticker.width,
        height: content.sticker.height,
      };
    }
    case 'messageAnimatedEmoji': {
      const fmt = extractStickerFormat(content);
      return {
        kind: 'sticker',
        url: undefined,
        format: fmt ?? 'webp',
        emoji: content.emoji,
        width: content.animated_emoji.sticker_width,
        height: content.animated_emoji.sticker_height,
      };
    }
    case 'messageDocument': {
      return {
        kind: 'document',
        fileName: content.document.file_name ?? '',
        fileSize: content.document.document.size || content.document.document.expected_size,
        mimeType: content.document.mime_type ?? '',
        url: undefined,
        caption: extractCaptionNew(content),
      };
    }
    default: {
      return {
        kind: 'unsupported',
        label: extractMediaLabel(content) || content._,
      };
    }
  }
}

// --- toTGForward ---

export function toTGForward(
  info: Td.messageForwardInfo | undefined,
  users: Map<number, Td.user>,
  chats?: Td.chat[],
): TGForward | null {
  if (!info) return null;
  const fromName = extractForwardName(info, users, chats);
  if (!fromName) return null;
  return {
    fromName,
    photoId: extractForwardPhotoId(info),
    photoUrl: undefined,
    date: info.date,
  };
}

// --- toTGReplyTo ---

export function toTGReplyTo(msg: Td.message): TGReplyTo | null {
  if (msg.reply_to?._ !== 'messageReplyToMessage') return null;
  return {
    messageId: msg.reply_to.message_id,
    senderName: undefined,
    text: undefined,
    mediaLabel: undefined,
    thumbUrl: undefined,
    quoteText: msg.reply_to.quote ? msg.reply_to.quote.text.text : '',
  };
}

// --- toTGSender ---

export function toTGSender(
  senderId: Td.MessageSender,
  users: Map<number, Td.user>,
  chats?: Td.chat[],
): TGSender {
  if (senderId._ === 'messageSenderUser') {
    const user = users.get(senderId.user_id);
    return {
      userId: senderId.user_id,
      name: user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'Unknown',
      photoUrl: undefined,
    };
  }
  // messageSenderChat
  const chat = chats?.find((c) => c.id === senderId.chat_id);
  return {
    userId: 0,
    name: chat?.title ?? 'Unknown',
    photoUrl: undefined,
  };
}

// --- toTGMessage ---

export function toTGMessage(
  msg: Td.message,
  users: Map<number, Td.user>,
  lastReadOutboxId: number,
  chats?: Td.chat[],
): (TGMessageBase & { kind: 'message' }) | TGServiceMessage {
  const sender = toTGSender(msg.sender_id, users, chats);
  const action = extractServiceAction(msg.content);

  if (action !== null) {
    return {
      kind: 'service',
      id: msg.id,
      chatId: msg.chat_id,
      date: msg.date,
      sender,
      action,
    };
  }

  return {
    kind: 'message',
    id: msg.id,
    chatId: msg.chat_id,
    date: msg.date,
    isOutgoing: msg.is_outgoing,
    isRead: msg.is_outgoing && msg.id > 0 && msg.id <= lastReadOutboxId,
    editDate: msg.edit_date,
    sender,
    reactions: toTGReactions(msg.interaction_info),
    viewCount: msg.interaction_info?.view_count ?? 0,
    forward: toTGForward(msg.forward_info, users, chats),
    replyTo: toTGReplyTo(msg),
    inlineKeyboard: extractInlineKeyboard(msg),
    content: toTGContent(msg.content),
  };
}

// --- Service action text (for reply previews only) ---

function serviceActionText(senderName: string, action: TGServiceAction): string {
  switch (action.type) {
    case 'pin':
      return action.previewText
        ? `${senderName} pinned "${action.previewText}"`
        : `${senderName} pinned a message`;
    case 'join':
      return `${senderName} joined the group`;
    case 'leave':
      return `${senderName} left the group`;
    case 'changeTitle':
      return `${senderName} changed group name to "${action.title}"`;
    case 'changePhoto':
      return `${senderName} changed group photo`;
    case 'deletePhoto':
      return `${senderName} removed group photo`;
    case 'createGroup':
      return `${senderName} created group "${action.title}"`;
    case 'screenshot':
      return `${senderName} took a screenshot`;
    case 'joinByLink':
      return `${senderName} joined via invite link`;
    case 'joinByRequest':
      return `${senderName} was accepted to the group`;
    case 'custom':
      return action.text;
  }
}

// --- enrichReplyPreviews ---

export function enrichReplyPreviews(messages: TGMessage[]): TGMessage[] {
  const byId = new Map<number, TGMessage>();
  for (const m of messages) {
    if (m.kind === 'message' || m.kind === 'service') byId.set(m.id, m);
  }
  return messages.map((m) => {
    if (m.kind !== 'message' || !m.replyTo || m.replyTo.senderName !== undefined) return m;
    const target = byId.get(m.replyTo.messageId);
    if (!target || target.kind === 'pending') return m;
    if (target.kind === 'service') {
      return {
        ...m,
        replyTo: {
          ...m.replyTo,
          senderName: target.sender.name,
          text: serviceActionText(target.sender.name, target.action),
          mediaLabel: '',
        },
      };
    }
    // target.kind === 'message'
    const contentText =
      target.content.kind === 'text'
        ? target.content.text
        : target.content.kind === 'photo' ||
            target.content.kind === 'video' ||
            target.content.kind === 'animation' ||
            target.content.kind === 'document'
          ? (target.content.caption?.text ?? '')
          : '';
    const mediaLabel =
      target.content.kind === 'text' ? '' : extractMediaLabelFromContentKind(target.content.kind);
    return {
      ...m,
      replyTo: {
        ...m.replyTo,
        senderName: target.sender.name,
        text: contentText,
        mediaLabel,
      },
    };
  });
}

function extractMediaLabelFromContentKind(kind: string): string {
  switch (kind) {
    case 'photo':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'voice':
      return 'Voice message';
    case 'videoNote':
      return 'Video message';
    case 'sticker':
      return 'Sticker';
    case 'document':
      return 'File';
    case 'animation':
      return 'GIF';
    case 'album':
      return 'Album';
    default:
      return '';
  }
}

// --- groupAndConvert ---

function toAlbumItem(msg: Td.message, content: TGContent): TGAlbumItem | null {
  if (content.kind !== 'photo' && content.kind !== 'video' && content.kind !== 'animation')
    return null;
  return {
    messageId: msg.id,
    contentKind: content.kind,
    url: undefined,
    width: content.media.width,
    height: content.media.height,
    minithumbnail: content.media.minithumbnail,
  };
}

export function groupAndConvert(
  rawMsgs: Td.message[],
  pending: PendingMessage[],
  users: Map<number, Td.user>,
  lastReadOutboxId: number,
  chats?: Td.chat[],
): TGMessage[] {
  const result: TGMessage[] = [];
  let i = 0;

  while (i < rawMsgs.length) {
    const msg = rawMsgs[i] as Td.message;
    const albumId = String(msg.media_album_id ?? '0');

    if (albumId !== '0') {
      // Collect consecutive messages with the same albumId
      const group: Td.message[] = [msg];
      while (i + 1 < rawMsgs.length) {
        const next = rawMsgs[i + 1] as Td.message;
        if (String(next.media_album_id ?? '0') !== albumId) break;
        group.push(next);
        i++;
      }

      if (group.length > 1) {
        // Build album
        const firstMsg = group[0] as Td.message;
        const sender = toTGSender(firstMsg.sender_id, users);
        const items: TGAlbumItem[] = [];
        let caption: TGCaption | null = null;

        for (const gMsg of group) {
          const content = toTGContent(gMsg.content);
          const item = toAlbumItem(gMsg, content);
          if (item) items.push(item);
          // Caption comes from whichever message has text
          if (
            !caption &&
            (content.kind === 'photo' || content.kind === 'video' || content.kind === 'animation')
          ) {
            caption = content.caption;
          }
        }

        const albumContent: TGAlbumContent = {
          kind: 'album',
          items,
          caption,
        };

        result.push({
          kind: 'message',
          id: firstMsg.id,
          chatId: firstMsg.chat_id,
          date: firstMsg.date,
          isOutgoing: firstMsg.is_outgoing,
          isRead: firstMsg.is_outgoing && firstMsg.id > 0 && firstMsg.id <= lastReadOutboxId,
          editDate: firstMsg.edit_date,
          sender,
          reactions: toTGReactions(firstMsg.interaction_info),
          viewCount: firstMsg.interaction_info?.view_count ?? 0,
          forward: toTGForward(firstMsg.forward_info, users, chats),
          replyTo: toTGReplyTo(firstMsg),
          inlineKeyboard: extractInlineKeyboard(firstMsg),
          content: albumContent,
        });
      } else {
        // Single message with albumId — not grouped
        result.push(toTGMessage(msg, users, lastReadOutboxId, chats));
      }
    } else {
      result.push(toTGMessage(msg, users, lastReadOutboxId, chats));
    }
    i++;
  }

  // Enrich in-batch reply previews
  const enriched = enrichReplyPreviews(result);

  // Append pending messages
  for (const p of pending) {
    const pendingMsg: TGPendingMessage = {
      kind: 'pending',
      localId: p.localId,
      chatId: p.chat_id,
      text: p.text,
      date: p.date,
      status: p._pending,
    };
    enriched.push(pendingMsg);
  }

  return enriched;
}

// ===========================================================================
// Hydration (Step 3)
// ===========================================================================

export function hydrateMessage(
  msg: TGMessage,
  mediaUrls: Record<string, string | null>,
  thumbUrls: Record<string, string | null>,
  profilePhotos: Record<number, string>,
  customEmojiUrlsMap: Record<string, CustomEmojiInfo>,
  replyPreviews: Record<string, TGReplyPreview | null>,
  pinnedPreviews: Record<string, string | null>,
): TGMessage {
  if (msg.kind === 'pending') return msg;

  if (msg.kind === 'service') {
    const senderPhotoUrl = profilePhotos[msg.sender.userId];
    let action = msg.action;

    if (action.type === 'pin') {
      const key = `${msg.chatId}_${action.messageId}`;
      const preview = pinnedPreviews[key];
      if (preview !== undefined && preview !== null) {
        action = { ...action, previewText: preview };
      }
    }

    if (senderPhotoUrl === undefined && action === msg.action) return msg;
    return {
      ...msg,
      sender:
        senderPhotoUrl !== undefined ? { ...msg.sender, photoUrl: senderPhotoUrl } : msg.sender,
      action,
    };
  }

  // kind === 'message'
  let changed = false;
  const chatId = msg.chatId;
  const msgId = msg.id;
  const mediaKey = `${chatId}_${msgId}`;

  // Sender photo
  let sender = msg.sender;
  const senderPhoto = profilePhotos[sender.userId];
  if (senderPhoto !== undefined && senderPhoto !== sender.photoUrl) {
    sender = { ...sender, photoUrl: senderPhoto };
    changed = true;
  }

  // Forward photo
  let forward = msg.forward;
  if (forward) {
    const fwdPhoto = profilePhotos[forward.photoId];
    if (fwdPhoto !== undefined && fwdPhoto !== forward.photoUrl) {
      forward = { ...forward, photoUrl: fwdPhoto };
      changed = true;
    }
  }

  // ReplyTo
  let replyTo = msg.replyTo;
  if (replyTo) {
    const replyKey = `${chatId}_${replyTo.messageId}`;
    const newThumb = thumbUrls[replyKey];
    const preview = replyPreviews[replyKey];

    let replyChanged = false;
    const updatedReplyTo = { ...replyTo };

    if (newThumb !== undefined && newThumb !== replyTo.thumbUrl) {
      updatedReplyTo.thumbUrl = newThumb ?? undefined;
      replyChanged = true;
    }
    if (preview && replyTo.senderName === undefined) {
      updatedReplyTo.senderName = preview.senderName;
      updatedReplyTo.text = preview.text;
      updatedReplyTo.mediaLabel = preview.mediaLabel;
      replyChanged = true;
    }
    if (replyChanged) {
      replyTo = updatedReplyTo;
      changed = true;
    }
  }

  // Content hydration
  let content = msg.content;
  content = hydrateContent(content, mediaKey, chatId, mediaUrls, thumbUrls, customEmojiUrlsMap);
  if (content !== msg.content) changed = true;

  if (!changed) return msg;
  return { ...msg, sender, forward, replyTo, content };
}

function hydrateContent(
  content: TGContent,
  mediaKey: string,
  chatId: number,
  mediaUrls: Record<string, string | null>,
  thumbUrls: Record<string, string | null>,
  customEmojiUrlsMap: Record<string, CustomEmojiInfo>,
): TGContent {
  switch (content.kind) {
    case 'photo':
    case 'video':
    case 'animation':
    case 'videoNote': {
      const url = mediaUrls[mediaKey];
      if (url !== undefined && url !== content.media.url) {
        const hydratedMedia = { ...content.media, url: url ?? undefined };
        let hydratedContent = { ...content, media: hydratedMedia };
        if ('caption' in hydratedContent && hydratedContent.caption) {
          hydratedContent = {
            ...hydratedContent,
            caption: hydrateCaption(hydratedContent.caption, customEmojiUrlsMap),
          };
        }
        return hydratedContent;
      }
      if ('caption' in content && content.caption) {
        const hCap = hydrateCaption(content.caption, customEmojiUrlsMap);
        if (hCap !== content.caption) return { ...content, caption: hCap };
      }
      return content;
    }
    case 'sticker': {
      const url = mediaUrls[mediaKey];
      if (url !== undefined && url !== content.url) {
        return { ...content, url: url ?? undefined };
      }
      return content;
    }
    case 'voice': {
      const url = mediaUrls[mediaKey];
      if (url !== undefined && url !== content.url) {
        return { ...content, url: url ?? undefined };
      }
      return content;
    }
    case 'album': {
      let itemsChanged = false;
      const newItems = content.items.map((item) => {
        const key = `${chatId}_${item.messageId}`;
        const url = mediaUrls[key];
        if (url !== undefined && url !== item.url) {
          itemsChanged = true;
          return { ...item, url: url ?? undefined };
        }
        return item;
      });
      let caption = content.caption;
      if (caption) {
        const hCap = hydrateCaption(caption, customEmojiUrlsMap);
        if (hCap !== caption) {
          caption = hCap;
          itemsChanged = true;
        }
      }
      if (itemsChanged) return { ...content, items: newItems, caption };
      return content;
    }
    case 'text': {
      let changed = false;
      let webPreview = content.webPreview;
      if (webPreview) {
        const thumbKey = mediaKey;
        const thumbUrl = thumbUrls[thumbKey];
        if (thumbUrl !== undefined && thumbUrl !== webPreview.thumbUrl) {
          webPreview = { ...webPreview, thumbUrl: thumbUrl ?? undefined };
          changed = true;
        }
      }
      const mergedEmojis = mergeCustomEmojis(
        content.customEmojiUrls,
        customEmojiUrlsMap,
        content.entities,
      );
      if (mergedEmojis !== content.customEmojiUrls) changed = true;
      if (!changed) return content;
      return { ...content, webPreview, customEmojiUrls: mergedEmojis };
    }
    case 'document': {
      let changed = false;
      let newContent = content;
      const url = mediaUrls[mediaKey];
      if (url !== undefined && url !== content.url) {
        newContent = { ...newContent, url: url ?? undefined };
        changed = true;
      }
      if (content.caption) {
        const hCap = hydrateCaption(content.caption, customEmojiUrlsMap);
        if (hCap !== content.caption) {
          newContent = { ...newContent, caption: hCap };
          changed = true;
        }
      }
      return changed ? newContent : content;
    }
    case 'unsupported':
      return content;
  }
}

function hydrateCaption(
  caption: TGCaption,
  customEmojiUrlsMap: Record<string, CustomEmojiInfo>,
): TGCaption {
  const merged = mergeCustomEmojis(caption.customEmojiUrls, customEmojiUrlsMap, caption.entities);
  if (merged === caption.customEmojiUrls) return caption;
  return { ...caption, customEmojiUrls: merged };
}

function mergeCustomEmojis(
  existing: Record<string, CustomEmojiInfo | null>,
  store: Record<string, CustomEmojiInfo>,
  entities: { customEmojiId?: string }[],
): Record<string, CustomEmojiInfo | null> {
  let changed = false;
  const result = { ...existing };
  for (const e of entities) {
    if (!e.customEmojiId) continue;
    const storeVal = store[e.customEmojiId];
    if (storeVal !== undefined && existing[e.customEmojiId] === undefined) {
      result[e.customEmojiId] = storeVal;
      changed = true;
    }
  }
  return changed ? result : existing;
}
