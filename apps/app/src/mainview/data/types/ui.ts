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

export type UITextEntity = {
  offset: number;
  length: number;
  type: TextEntityKind;
  url?: string;
  customEmojiId?: string;
};

export type UIReaction = {
  emoji: string;
  count: number;
  chosen: boolean;
};

export type UIKeyboardButton = { text: string; url?: string };
export type UIKeyboardRow = UIKeyboardButton[];

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

export type UIChat = {
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
  user: UIUser | null;
  avatarUrl: string | undefined;
  lastMessageThumbUrl: string | null;
  typingText: string | null;
};

export type UISearchResult = {
  chatId: number;
  messageId: number;
  chatTitle: string;
  text: string;
  date: number;
  photoUrl: string | null;
};

export type UIUser = {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  username: string | null;
  isPremium: boolean;
  emojiStatusId: string | null;
};

export type UIReplyPreview = {
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

export type UIMedia = {
  url: string | undefined;
  width: number;
  height: number;
  minithumbnail: string | null;
};

export type UICaption = {
  text: string;
  entities: UITextEntity[];
  customEmojiUrls: Record<string, CustomEmojiInfo | null>;
};

export type UIForward = {
  fromName: string;
  photoId: number;
  photoUrl: string | undefined;
  date: number;
};

export type UIReplyTo = {
  messageId: number;
  senderName: string | undefined;
  text: string | undefined;
  mediaLabel: string | undefined;
  thumbUrl: string | undefined;
  quoteText: string;
};

export type UIWebPreview = {
  url: string;
  siteName: string;
  title: string;
  description: string;
  minithumbnail: string | null;
  thumbUrl: string | undefined;
  showLargeMedia: boolean;
  showMediaAboveDescription: boolean;
};

export type UISender = {
  userId: number;
  name: string;
  photoUrl: string | undefined;
};

// ─── Content union ───

export type UITextContent = {
  kind: 'text';
  text: string;
  entities: UITextEntity[];
  customEmojiUrls: Record<string, CustomEmojiInfo | null>;
  webPreview: UIWebPreview | null;
};

export type UIPhotoContent = {
  kind: 'photo';
  media: UIMedia;
  caption: UICaption | null;
};

export type UIVideoContent = {
  kind: 'video';
  media: UIMedia;
  isGif: boolean;
  caption: UICaption | null;
};

export type UIAnimationContent = {
  kind: 'animation';
  media: UIMedia;
  caption: UICaption | null;
};

export type UIVoiceContent = {
  kind: 'voice';
  url: string | undefined;
  waveform: string | null;
  duration: number;
  fileSize: number;
  speechStatus: 'none' | 'pending' | 'done' | 'error';
  speechText: string;
};

export type UIVideoNoteContent = {
  kind: 'videoNote';
  media: UIMedia;
};

export type UIStickerContent = {
  kind: 'sticker';
  url: string | undefined;
  format: 'webp' | 'tgs' | 'webm';
  emoji: string;
  width: number;
  height: number;
};

export type UIAlbumItem = {
  messageId: number;
  contentKind: 'photo' | 'video' | 'animation';
  url: string | undefined;
  width: number;
  height: number;
  minithumbnail: string | null;
};

export type UIAlbumContent = {
  kind: 'album';
  items: UIAlbumItem[];
  caption: UICaption | null;
};

export type UIDocumentContent = {
  kind: 'document';
  label: string;
};

export type UIUnsupportedContent = {
  kind: 'unsupported';
  label: string;
};

export type UIContent =
  | UITextContent
  | UIPhotoContent
  | UIVideoContent
  | UIAnimationContent
  | UIVoiceContent
  | UIVideoNoteContent
  | UIStickerContent
  | UIAlbumContent
  | UIDocumentContent
  | UIUnsupportedContent;

// ─── Message types ───

export type UIMessageBase = {
  id: number;
  chatId: number;
  date: number;
  isOutgoing: boolean;
  isRead: boolean;
  editDate: number;
  sender: UISender;
  reactions: UIReaction[];
  viewCount: number;
  forward: UIForward | null;
  replyTo: UIReplyTo | null;
  inlineKeyboard: UIKeyboardRow[] | null;
  content: UIContent;
};

export type UIServiceMessage = {
  kind: 'service';
  id: number;
  chatId: number;
  date: number;
  sender: UISender;
  text: string;
  pinnedMessageId: number;
};

export type UIPendingMessage = {
  kind: 'pending';
  localId: string;
  chatId: number;
  text: string;
  date: number;
  status: 'sending' | 'failed';
};

export type UIMessage = (UIMessageBase & { kind: 'message' }) | UIServiceMessage | UIPendingMessage;
