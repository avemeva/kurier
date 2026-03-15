// Public API — single import point for the data package.
// Components import from `@/data` — never from internal paths.

// === Types (TDLib re-export) ===
export type * as Td from 'tdlib-types';
export type {
  ChatState,
  HeaderStatus,
} from './store';
// === Store (selectors, hooks, actions, types) ===
export {
  _resetForTests,
  selectArchivedChats,
  selectChatMessages,
  selectChats,
  selectContactPhotos,
  selectHeaderStatus,
  selectSearchResults,
  selectSelectedChat,
  useChatMessageLoader,
  useChatStore,
  useSidebarPhotoLoader,
} from './store';
export type {
  ChatKind,
  MessageContentKind,
  PeerInfo,
  TextEntityKind,
  TGAlbumContent,
  TGAlbumItem,
  TGAnimationContent,
  TGCaption,
  TGChat,
  TGContent,
  TGDocumentContent,
  TGForward,
  TGKeyboardButton,
  TGKeyboardRow,
  TGMedia,
  TGMessage,
  TGMessageBase,
  TGPendingMessage,
  TGPhotoContent,
  TGReaction,
  TGReplyPreview,
  TGReplyTo,
  TGSearchResult,
  TGSender,
  TGServiceAction,
  TGServiceMessage,
  TGStickerContent,
  TGTextContent,
  TGTextEntity,
  TGUnsupportedContent,
  TGUser,
  TGVideoContent,
  TGVideoNoteContent,
  TGVoiceContent,
  TGWebPreview,
} from './types';
