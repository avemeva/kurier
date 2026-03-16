import type { ChatInfoResult, CustomEmojiInfo } from '../telegram';
import type { PeerInfo, PendingMessage, Td, TelegramUpdateEvent, TGReplyPreview } from '../types';

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export type HeaderStatus =
  | { type: 'online' }
  | { type: 'typing'; text: string }
  | { type: 'last_seen'; text: string }
  | { type: 'label'; text: string }
  | null;

export type { PendingMessage };

// ---------------------------------------------------------------------------
// Store state — raw TDLib data + bookkeeping
// ---------------------------------------------------------------------------

export interface ChatState {
  // --- Core TDLib state ---
  chats: Td.chat[];
  archivedChats: Td.chat[];
  selectedChatId: number | null;
  messagesByChat: Record<number, Td.message[]>;
  pendingByChat: Record<number, PendingMessage[]>;
  users: Map<number, Td.user>;
  myUserId: number;

  // --- Cached derived data ---
  profilePhotos: Record<number, string>;
  mediaUrls: Record<string, string | null>;
  fileUrls: Record<string, string | null>;
  thumbUrls: Record<string, string | null>;
  replyPreviews: Record<string, TGReplyPreview | null>;
  pinnedPreviews: Record<string, string | null>;
  customEmojiUrls: Record<string, CustomEmojiInfo>;

  // --- Ephemeral UI state ---
  typingByChat: Record<number, Record<number, { action: Td.ChatAction; expiresAt: number }>>;
  userStatuses: Record<number, Td.UserStatus>;
  chatInfoCache: Record<number, ChatInfoResult>;
  chatOnlineCounts: Record<number, number>;

  // --- Auth & connection ---
  authState: Td.AuthorizationState | null;
  connectionState: Td.ConnectionState | null;

  // --- Loading / pagination ---
  loadingDialogs: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  loadingNewerMessages: boolean;
  hasOlder: Record<number, boolean>;
  hasNewer: Record<number, boolean>;
  isAtLatest: Record<number, boolean>;
  hasMoreChats: boolean;
  hasMoreArchivedChats: boolean;
  loadingMoreChats: boolean;
  loadingMoreArchivedChats: boolean;
  error: string;

  // --- Global search ---
  searchQuery: string;
  searchMode: 'none' | 'global' | 'chat';
  searchResults: Td.message[]; // Raw messages — selector derives TGSearchResult[]
  searchTotalCount: number | undefined;
  searchLoading: boolean;
  searchHasMore: boolean;
  searchNextCursor: string | undefined;

  // --- Contact search ---
  contactResults: PeerInfo[];
  contactsLoading: boolean;

  // --- In-chat search ---
  chatSearchQuery: string;
  chatSearchResults: Td.message[];
  chatSearchTotalCount: number;
  chatSearchCurrentIndex: number;
  chatSearchLoading: boolean;
  chatSearchHasMore: boolean;
  chatSearchNextOffsetId: number | undefined;

  // --- Scroll-to-message ---
  targetMessageId: number | null;

  // --- Actions ---
  loadDialogs: () => Promise<void>;
  loadMoreChats: (archived: boolean) => Promise<void>;
  openChat: (chat: Td.chat) => Promise<void>;
  openChatById: (chatId: number) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  loadNewerMessages: () => Promise<void>;
  loadMessagesAround: (messageId: number) => Promise<void>;
  loadLatestMessages: () => Promise<void>;
  send: (chatId: number, text: string) => void;
  react: (chatId: number, msgId: number, emoji: string, chosen: boolean) => void;
  handleUpdate: (event: TelegramUpdateEvent) => void;
  loadProfilePhoto: (chatId: number) => void;
  loadMedia: (chatId: number, messageId: number) => void;
  clearMediaUrl: (chatId: number, messageId: number) => void;
  loadFile: (fileId: number) => void;
  clearFileUrl: (fileId: number) => void;
  loadCustomEmojiUrl: (documentId: string) => void;
  recognizeSpeech: (chatId: number, messageId: number) => void;
  openDocument: (chatId: number, messageId: number) => void;
  loadReplyThumb: (chatId: number, messageId: number) => void;
  resolveReplyPreview: (chatId: number, messageId: number) => void;
  resolvePinnedPreview: (chatId: number, messageId: number) => void;
  clearError: () => void;

  // --- Search actions ---
  openGlobalSearch: () => void;
  closeGlobalSearch: () => void;
  setSearchQuery: (query: string) => void;
  executeGlobalSearch: (query: string) => Promise<void>;
  executeContactSearch: (query: string) => Promise<void>;
  loadMoreGlobalResults: () => Promise<void>;

  // --- In-chat search actions ---
  openChatSearch: () => void;
  closeChatSearch: () => void;
  setChatSearchQuery: (query: string) => void;
  executeChatSearch: (query: string) => Promise<void>;
  loadMoreChatResults: () => Promise<void>;
  chatSearchNext: () => void;
  chatSearchPrev: () => void;

  // --- Navigation ---
  goToNextUnreadMention: () => Promise<void>;
  goToNextUnreadReaction: () => Promise<void>;
  clearTargetMessage: () => void;
}

// ---------------------------------------------------------------------------
// Initial state factory (for store creation + reset)
// ---------------------------------------------------------------------------

export const INITIAL_STATE: Omit<
  ChatState,
  | 'loadDialogs'
  | 'loadMoreChats'
  | 'openChat'
  | 'openChatById'
  | 'loadOlderMessages'
  | 'loadNewerMessages'
  | 'loadMessagesAround'
  | 'loadLatestMessages'
  | 'send'
  | 'react'
  | 'handleUpdate'
  | 'loadProfilePhoto'
  | 'loadMedia'
  | 'clearMediaUrl'
  | 'loadFile'
  | 'clearFileUrl'
  | 'loadCustomEmojiUrl'
  | 'recognizeSpeech'
  | 'openDocument'
  | 'loadReplyThumb'
  | 'resolveReplyPreview'
  | 'resolvePinnedPreview'
  | 'clearError'
  | 'openGlobalSearch'
  | 'closeGlobalSearch'
  | 'setSearchQuery'
  | 'executeGlobalSearch'
  | 'executeContactSearch'
  | 'loadMoreGlobalResults'
  | 'openChatSearch'
  | 'closeChatSearch'
  | 'setChatSearchQuery'
  | 'executeChatSearch'
  | 'loadMoreChatResults'
  | 'chatSearchNext'
  | 'chatSearchPrev'
  | 'goToNextUnreadMention'
  | 'goToNextUnreadReaction'
  | 'clearTargetMessage'
> = {
  chats: [],
  archivedChats: [],
  selectedChatId: null,
  messagesByChat: {},
  pendingByChat: {},
  users: new Map(),
  myUserId: 0,
  profilePhotos: {},
  mediaUrls: {},
  fileUrls: {},
  thumbUrls: {},
  replyPreviews: {},
  pinnedPreviews: {},
  customEmojiUrls: {},
  typingByChat: {},
  userStatuses: {},
  chatInfoCache: {},
  chatOnlineCounts: {},
  authState: null,
  connectionState: null,
  loadingDialogs: true,
  loadingMessages: false,
  loadingOlderMessages: false,
  loadingNewerMessages: false,
  hasOlder: {},
  hasNewer: {},
  isAtLatest: {},
  hasMoreChats: true,
  hasMoreArchivedChats: true,
  loadingMoreChats: false,
  loadingMoreArchivedChats: false,
  error: '',
  searchQuery: '',
  searchMode: 'none',
  searchResults: [],
  searchTotalCount: undefined,
  searchLoading: false,
  searchHasMore: false,
  searchNextCursor: undefined,
  contactResults: [],
  contactsLoading: false,
  chatSearchQuery: '',
  chatSearchResults: [],
  chatSearchTotalCount: 0,
  chatSearchCurrentIndex: 0,
  chatSearchLoading: false,
  chatSearchHasMore: false,
  chatSearchNextOffsetId: undefined,
  targetMessageId: null,
};
