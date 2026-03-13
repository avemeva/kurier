// UI-facing types. Components never import Td — they consume these.

import type { CustomEmojiInfo } from '../telegram';

export interface PeerInfo {
  id: number;
  name: string;
  username: string | null;
  isUser: boolean;
  isGroup: boolean;
  isChannel: boolean;
}

export type TextEntityKind =
  | 'bold'
  | 'italic'
  | 'code'
  | 'pre'
  | 'preCode'
  | 'url'
  | 'email'
  | 'textUrl'
  | 'strikethrough'
  | 'underline'
  | 'mention'
  | 'hashtag'
  | 'botCommand'
  | 'spoiler'
  | 'customEmoji'
  | 'unknown';

export type TGTextEntity = {
  offset: number;
  length: number;
  type: TextEntityKind;
  url?: string;
  customEmojiId?: string;
};

export type TGReaction = {
  emoji: string;
  count: number;
  chosen: boolean;
};

export type TGKeyboardButton = { text: string; url?: string };
export type TGKeyboardRow = TGKeyboardButton[];

export type MessageContentKind =
  | 'text'
  | 'photo'
  | 'video'
  | 'voice'
  | 'videoNote'
  | 'sticker'
  | 'document'
  | 'animation'
  | 'audio'
  | 'poll'
  | 'contact'
  | 'location'
  | 'venue'
  | 'dice'
  | 'unsupported';

export type ChatKind = 'private' | 'basicGroup' | 'supergroup' | 'channel';

export type TGChat = {
  id: number;
  title: string;
  kind: ChatKind;
  userId: number;
  unreadCount: number;
  isPinned: boolean;
  lastMessagePreview: string;
  lastMessageSenderName: string | null;
  lastMessageContentKind: MessageContentKind | null;
  lastMessageIsForwarded: boolean;
  lastMessageId: number;
  lastMessageDate: number;
  lastMessageStatus: 'none' | 'sent' | 'read';
  photoUrl: string | null;
  isMuted: boolean;
  unreadMentionCount: number;
  unreadReactionCount: number;
  draftText: string | null;
  isBot: boolean;
  isOnline: boolean;
  isSavedMessages: boolean;
  user: TGUser | null;
  avatarUrl: string | undefined;
  lastMessageThumbUrl: string | null;
  typingText: string | null;
};

export type TGSearchResult = {
  chatId: number;
  messageId: number;
  chatTitle: string;
  text: string;
  date: number;
  photoUrl: string | null;
};

export type TGUser = {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  username: string | null;
  isPremium: boolean;
  emojiStatusId: string | null;
};

export type TGReplyPreview = {
  senderName: string;
  text: string;
  mediaLabel: string;
  contentKind: MessageContentKind;
  hasWebPreview: boolean;
  quoteText: string;
};

// ---------------------------------------------------------------------------
// Compositional UI types (primary)
// ---------------------------------------------------------------------------

// ─── Shared shapes ───

export type TGMedia = {
  url: string | undefined;
  width: number;
  height: number;
  minithumbnail: string | null;
};

export type TGCaption = {
  text: string;
  entities: TGTextEntity[];
  customEmojiUrls: Record<string, CustomEmojiInfo | null>;
};

export type TGForward = {
  fromName: string;
  photoId: number;
  photoUrl: string | undefined;
  date: number;
};

export type TGReplyTo = {
  messageId: number;
  senderName: string | undefined;
  text: string | undefined;
  mediaLabel: string | undefined;
  thumbUrl: string | undefined;
  quoteText: string;
};

export type TGWebPreview = {
  url: string;
  siteName: string;
  title: string;
  description: string;
  minithumbnail: string | null;
  thumbUrl: string | undefined;
  showLargeMedia: boolean;
  showMediaAboveDescription: boolean;
};

export type TGSender = {
  userId: number;
  name: string;
  photoUrl: string | undefined;
};

// ─── Content union ───

export type TGTextContent = {
  kind: 'text';
  text: string;
  entities: TGTextEntity[];
  customEmojiUrls: Record<string, CustomEmojiInfo | null>;
  webPreview: TGWebPreview | null;
};

export type TGPhotoContent = {
  kind: 'photo';
  media: TGMedia;
  caption: TGCaption | null;
};

export type TGVideoContent = {
  kind: 'video';
  media: TGMedia;
  isGif: boolean;
  caption: TGCaption | null;
};

export type TGAnimationContent = {
  kind: 'animation';
  media: TGMedia;
  caption: TGCaption | null;
};

export type TGVoiceContent = {
  kind: 'voice';
  url: string | undefined;
  waveform: string | null;
  duration: number;
  fileSize: number;
  speechStatus: 'none' | 'pending' | 'done' | 'error';
  speechText: string;
};

export type TGVideoNoteContent = {
  kind: 'videoNote';
  media: TGMedia;
};

export type TGStickerContent = {
  kind: 'sticker';
  url: string | undefined;
  format: 'webp' | 'tgs' | 'webm';
  emoji: string;
  width: number;
  height: number;
};

export type TGAlbumItem = {
  messageId: number;
  contentKind: 'photo' | 'video' | 'animation';
  url: string | undefined;
  width: number;
  height: number;
  minithumbnail: string | null;
};

export type TGAlbumContent = {
  kind: 'album';
  items: TGAlbumItem[];
  caption: TGCaption | null;
};

export type TGDocumentContent = {
  kind: 'document';
  label: string;
};

export type TGUnsupportedContent = {
  kind: 'unsupported';
  label: string;
};

export type TGContent =
  | TGTextContent
  | TGPhotoContent
  | TGVideoContent
  | TGAnimationContent
  | TGVoiceContent
  | TGVideoNoteContent
  | TGStickerContent
  | TGAlbumContent
  | TGDocumentContent
  | TGUnsupportedContent;

// ─── Message types ───

export type TGMessageBase = {
  id: number;
  chatId: number;
  date: number;
  isOutgoing: boolean;
  isRead: boolean;
  editDate: number;
  sender: TGSender;
  reactions: TGReaction[];
  viewCount: number;
  forward: TGForward | null;
  replyTo: TGReplyTo | null;
  inlineKeyboard: TGKeyboardRow[] | null;
  content: TGContent;
};

export type TGServiceMessage = {
  kind: 'service';
  id: number;
  chatId: number;
  date: number;
  sender: TGSender;
  text: string;
  pinnedMessageId: number;
};

export type TGPendingMessage = {
  kind: 'pending';
  localId: string;
  chatId: number;
  text: string;
  date: number;
  status: 'sending' | 'failed';
};

export type TGMessage = (TGMessageBase & { kind: 'message' }) | TGServiceMessage | TGPendingMessage;
