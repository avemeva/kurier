// UI-facing types. Components never import Td — they consume these.

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

export type UIWebPreview = {
  url: string;
  siteName: string;
  title: string;
  description: string;
};

export type UIKeyboardButton = { text: string; url?: string };
export type UIKeyboardRow = UIKeyboardButton[];

export type UIReplyPreview = {
  senderName: string;
  text: string;
  mediaLabel: string;
  contentKind: MessageContentKind;
  hasWebPreview: boolean;
  quoteText: string;
};

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

export type UIMessage = {
  id: number;
  chatId: number;
  date: number;
  isOutgoing: boolean;
  contentKind: MessageContentKind;
  text: string;
  entities: UITextEntity[];
  mediaLabel: string;
  mediaAlbumId: string;
  senderUserId: number;
  senderName: string;
  replyToMessageId: number;
  editDate: number;
  viewCount: number;
  reactions: UIReaction[];
  webPreview: UIWebPreview | null;
  isRead: boolean;
  forwardFromName: string | null;
  forwardFromPhotoId: number;
  forwardDate: number;
  serviceText: string | null;
  inlineKeyboard: UIKeyboardRow[] | null;
  replyPreview: UIReplyPreview | null;
  replyQuoteText: string;
  voiceWaveform: string | null;
  voiceDuration: number;
  voiceFileSize: number;
  voiceSpeechStatus: 'none' | 'pending' | 'done' | 'error';
  voiceSpeechText: string;
  mediaWidth: number;
  mediaHeight: number;
  minithumbnail: string | null;
};

export type UIPendingMessage = {
  localId: string;
  chatId: number;
  text: string;
  date: number;
  isPending: true;
  status: 'sending' | 'failed';
};

export type UIMessageItem = UIMessage | UIPendingMessage;

export type UIMessageGroup =
  | { type: 'single'; message: UIMessageItem }
  | { type: 'album'; messages: UIMessage[] };

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
  lastMessageId: number;
  lastMessageDate: number;
  lastMessageStatus: 'none' | 'sent' | 'read';
  photoUrl: string | null;
  isMuted: boolean;
  unreadMentionCount: number;
  draftText: string | null;
  isBot: boolean;
  isOnline: boolean;
  isSavedMessages: boolean;
  user: UIUser | null;
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
