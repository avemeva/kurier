import type * as Td from 'tdlib-types';
import type { PendingMessage } from './index';
import type {
  ChatKind,
  MessageContentKind,
  TextEntityKind,
  UIChat,
  UIKeyboardRow,
  UIMessage,
  UIMessageGroup,
  UIMessageItem,
  UIPendingMessage,
  UIReaction,
  UIReplyPreview,
  UISearchResult,
  UITextEntity,
  UIUser,
  UIWebPreview,
} from './ui';

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
};

function toContentKind(content: Td.MessageContent): MessageContentKind {
  return CONTENT_KIND_MAP[content._] ?? 'unsupported';
}

// --- Text extraction ---

function extractText(content: Td.MessageContent): string {
  if (content._ === 'messageText') return content.text.text;
  if ('caption' in content && content.caption) return (content.caption as Td.formattedText).text;
  return '';
}

function extractEntities(content: Td.MessageContent): Td.textEntity[] {
  if (content._ === 'messageText') return content.text.entities;
  if ('caption' in content && content.caption)
    return (content.caption as Td.formattedText).entities;
  return [];
}

// --- Media label ---

function extractMediaLabel(content: Td.MessageContent): string {
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
      return 'File';
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
    default:
      return '';
  }
}

// --- Voice note metadata ---

function extractVoiceWaveform(content: Td.MessageContent): string | null {
  if (content._ === 'messageVoiceNote') return content.voice_note.waveform ?? null;
  return null;
}

function extractVoiceDuration(content: Td.MessageContent): number {
  if (content._ === 'messageVoiceNote') return content.voice_note.duration;
  return 0;
}

function extractVoiceFileSize(content: Td.MessageContent): number {
  if (content._ === 'messageVoiceNote')
    return content.voice_note.voice.size || content.voice_note.voice.expected_size;
  return 0;
}

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

// --- Media dimensions & minithumbnail ---

function extractMediaWidth(content: Td.MessageContent): number {
  if (content._ === 'messagePhoto') {
    const sizes = content.photo.sizes;
    return sizes.length > 0 ? (sizes[sizes.length - 1] as Td.photoSize).width : 0;
  }
  if (content._ === 'messageVideo') return content.video.width;
  if (content._ === 'messageAnimation') return content.animation.width;
  return 0;
}

function extractMediaHeight(content: Td.MessageContent): number {
  if (content._ === 'messagePhoto') {
    const sizes = content.photo.sizes;
    return sizes.length > 0 ? (sizes[sizes.length - 1] as Td.photoSize).height : 0;
  }
  if (content._ === 'messageVideo') return content.video.height;
  if (content._ === 'messageAnimation') return content.animation.height;
  return 0;
}

function extractMinithumbnail(content: Td.MessageContent): string | null {
  if (content._ === 'messagePhoto') return content.photo.minithumbnail?.data ?? null;
  if (content._ === 'messageVideo') return content.video.minithumbnail?.data ?? null;
  return null;
}

// --- Web preview ---

function extractWebPreview(content: Td.MessageContent): UIWebPreview | null {
  if (content._ !== 'messageText' || !content.link_preview) return null;
  const lp = content.link_preview;
  return {
    url: lp.url,
    siteName: lp.site_name,
    title: lp.title,
    description: lp.description?.text ?? '',
  };
}

// --- Reply preview from raw Td message ---

/** Build a UIReplyPreview from a raw TDLib message + user map. */
export function buildReplyPreview(
  target: Td.message,
  users: Map<number, Td.user>,
  quoteText: string,
): UIReplyPreview {
  return {
    senderName: resolveSenderName(target.sender_id, users),
    text: extractText(target.content),
    mediaLabel: extractMediaLabel(target.content),
    contentKind: toContentKind(target.content),
    hasWebPreview: extractWebPreview(target.content) !== null,
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

function extractLastMessageSenderName(
  msg: Td.message | undefined,
  chatKind: ChatKind,
  ctx: UIChatContext,
): string | null {
  if (!msg) return null;
  // Only show sender in groups (not private chats or channels)
  if (chatKind !== 'basicGroup' && chatKind !== 'supergroup') return null;
  if (msg.is_outgoing) return 'You';
  if (!ctx.users || msg.sender_id._ !== 'messageSenderUser') return null;
  const user = ctx.users.get(msg.sender_id.user_id);
  return user?.first_name ?? null;
}

// --- Sender ---

function extractSenderUserId(sender: Td.MessageSender): number {
  return sender._ === 'messageSenderUser' ? sender.user_id : 0;
}

function resolveSenderName(sender: Td.MessageSender, users: Map<number, Td.user>): string {
  if (sender._ === 'messageSenderUser') {
    const user = users.get(sender.user_id);
    if (user) return [user.first_name, user.last_name].filter(Boolean).join(' ');
  }
  return 'Unknown';
}

// --- Reply ---

function extractReplyToMessageId(msg: Td.message): number {
  if (msg.reply_to?._ === 'messageReplyToMessage') return msg.reply_to.message_id;
  return 0;
}

// --- Forward ---

export function extractForwardName(
  info: Td.messageForwardInfo | undefined,
  users: Map<number, Td.user>,
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
    case 'messageOriginChat':
      return null; // Chat name resolved by caller if needed
    case 'messageOriginChannel':
      return null; // Channel name resolved by caller if needed
    default:
      return null;
  }
}

// --- Service text ---

export function extractServiceText(content: Td.MessageContent): string | null {
  switch (content._) {
    case 'messageChatAddMembers':
      return 'joined the group';
    case 'messageChatDeleteMember':
      return 'left the group';
    case 'messageChatChangeTitle':
      return `changed group name to "${content.title}"`;
    case 'messageChatChangePhoto':
      return 'changed group photo';
    case 'messageChatDeletePhoto':
      return 'removed group photo';
    case 'messageBasicGroupChatCreate':
      return `created group "${content.title}"`;
    case 'messageSupergroupChatCreate':
      return `created group "${content.title}"`;
    case 'messagePinMessage':
      return 'pinned a message';
    case 'messageScreenshotTaken':
      return 'took a screenshot';
    case 'messageCustomServiceAction':
      return content.text;
    case 'messageChatJoinByLink':
      return 'joined via invite link';
    case 'messageChatJoinByRequest':
      return 'was accepted to the group';
    default:
      return null;
  }
}

// --- Inline keyboard ---

export function extractInlineKeyboard(msg: Td.message): UIKeyboardRow[] | null {
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

export function toUITextEntities(entities: Td.textEntity[]): UITextEntity[] {
  return entities.map((e) => {
    const result: UITextEntity = {
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

export function toUIReactions(info: Td.messageInteractionInfo | undefined): UIReaction[] {
  const reactions = info?.reactions?.reactions;
  if (!reactions) return [];
  return reactions.map((r) => ({
    emoji: r.type._ === 'reactionTypeEmoji' ? r.type.emoji : '',
    count: r.total_count,
    chosen: r.is_chosen,
  }));
}

export function toUIMessage(
  msg: Td.message,
  users: Map<number, Td.user>,
  lastReadOutboxId: number,
): UIMessage {
  return {
    id: msg.id,
    chatId: msg.chat_id,
    date: msg.date,
    isOutgoing: msg.is_outgoing,
    contentKind: toContentKind(msg.content),
    text: extractText(msg.content),
    entities: toUITextEntities(extractEntities(msg.content)),
    mediaLabel: extractMediaLabel(msg.content),
    mediaAlbumId: String(msg.media_album_id ?? '0'),
    senderUserId: extractSenderUserId(msg.sender_id),
    senderName: resolveSenderName(msg.sender_id, users),
    replyToMessageId: extractReplyToMessageId(msg),
    editDate: msg.edit_date,
    viewCount: msg.interaction_info?.view_count ?? 0,
    reactions: toUIReactions(msg.interaction_info),
    webPreview: extractWebPreview(msg.content),
    isRead: msg.is_outgoing && msg.id > 0 && msg.id <= lastReadOutboxId,
    forwardFromName: extractForwardName(msg.forward_info, users),
    forwardDate: msg.forward_info?.date ?? 0,
    serviceText: extractServiceText(msg.content),
    inlineKeyboard: extractInlineKeyboard(msg),
    replyPreview: null, // Populated by enrichReplyPreviews after batch conversion
    replyQuoteText:
      msg.reply_to?._ === 'messageReplyToMessage' && msg.reply_to.quote
        ? msg.reply_to.quote.text.text
        : '',
    voiceWaveform: extractVoiceWaveform(msg.content),
    voiceDuration: extractVoiceDuration(msg.content),
    voiceFileSize: extractVoiceFileSize(msg.content),
    voiceSpeechStatus: extractVoiceSpeechStatus(msg.content),
    voiceSpeechText: extractVoiceSpeechText(msg.content),
    mediaWidth: extractMediaWidth(msg.content),
    mediaHeight: extractMediaHeight(msg.content),
    minithumbnail: extractMinithumbnail(msg.content),
  };
}

/**
 * Second-pass enrichment: resolves reply previews from a converted message list.
 * Call after toUIMessage batch conversion so reply targets are available.
 */
export function enrichReplyPreviews(messages: UIMessage[]): UIMessage[] {
  const byId = new Map<number, UIMessage>();
  for (const m of messages) byId.set(m.id, m);
  return messages.map((m) => {
    if (m.replyToMessageId === 0) return m;
    const target = byId.get(m.replyToMessageId);
    if (!target) return m;
    return {
      ...m,
      replyPreview: {
        senderName: target.senderName,
        text: target.text,
        mediaLabel: target.mediaLabel,
        contentKind: target.contentKind,
        hasWebPreview: target.webPreview !== null,
        quoteText: m.replyQuoteText,
      },
    };
  });
}

export function toUIPendingMessage(pending: PendingMessage): UIPendingMessage {
  return {
    localId: pending.localId,
    chatId: pending.chat_id,
    text: pending.text,
    date: pending.date,
    isPending: true,
    status: pending._pending,
  };
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

export type UIChatContext = {
  photoUrl: string | null;
  user: Td.user | undefined;
  isOnline: boolean;
  myUserId?: number;
  users?: Map<number, Td.user>;
};

export function toUIChat(chat: Td.chat, ctx: UIChatContext): UIChat {
  const draftInput = chat.draft_message?.input_message_text;
  const draftText = draftInput?._ === 'inputMessageText' ? draftInput.text.text || null : null;
  const kind = toChatKind(chat.type);
  const isPrivate = kind === 'private';
  const lastMsg = chat.last_message;
  const isDeletedUser =
    isPrivate && (ctx.user?.type?._ === 'userTypeDeleted' || (!chat.title && !ctx.user));
  const title = chat.title || (isDeletedUser ? 'Deleted Account' : '');
  return {
    id: chat.id,
    title,
    kind,
    userId: chat.type._ === 'chatTypePrivate' ? chat.type.user_id : 0,
    unreadCount: chat.unread_count,
    isPinned: chat.positions.some((p) => p.is_pinned),
    lastMessagePreview: extractMessagePreview(lastMsg),
    lastMessageSenderName: extractLastMessageSenderName(lastMsg, kind, ctx),
    lastMessageContentKind: lastMsg ? toContentKind(lastMsg.content) : null,
    lastMessageId: lastMsg?.id ?? 0,
    lastMessageDate: lastMsg?.date ?? 0,
    lastMessageStatus: !lastMsg?.is_outgoing
      ? 'none'
      : lastMsg.id <= chat.last_read_outbox_message_id
        ? 'read'
        : 'sent',
    photoUrl: ctx.photoUrl,
    isMuted: chat.notification_settings.mute_for > 0,
    unreadMentionCount: chat.unread_mention_count,
    draftText,
    isBot: isPrivate && ctx.user?.type?._ === 'userTypeBot',
    isOnline: isPrivate && ctx.isOnline,
    isSavedMessages:
      isPrivate &&
      !!ctx.myUserId &&
      chat.type._ === 'chatTypePrivate' &&
      chat.type.user_id === ctx.myUserId,
    user: ctx.user ? toUIUser(ctx.user) : null,
  };
}

export function toUISearchResult(
  msg: Td.message & { chat_title?: string },
  photoUrl: string | null,
): UISearchResult {
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

export function toUIUser(user: Td.user): UIUser {
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

export function groupUIMessages(items: UIMessageItem[]): UIMessageGroup[] {
  const result: UIMessageGroup[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i] as UIMessageItem;
    if ('isPending' in item) {
      result.push({ type: 'single', message: item });
      i++;
      continue;
    }
    const msg: UIMessage = item;
    if (msg.mediaAlbumId !== '0') {
      const group: UIMessage[] = [msg];
      while (i + 1 < items.length) {
        const next = items[i + 1] as UIMessageItem;
        if ('isPending' in next) break;
        if ((next as UIMessage).mediaAlbumId !== msg.mediaAlbumId) break;
        i++;
        group.push(next as UIMessage);
      }
      if (group.length > 1) {
        result.push({ type: 'album', messages: group });
      } else {
        result.push({ type: 'single', message: group[0] as UIMessage });
      }
    } else {
      result.push({ type: 'single', message: msg });
    }
    i++;
  }
  return result;
}
