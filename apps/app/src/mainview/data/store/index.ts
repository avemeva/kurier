// Public API — single import point for the store package.
// Components import selectors, hooks, UI types, and action refs from here.
// Internal details (converters, raw Td types, ChatState internals) are not exported.

export type {
  AlbumRenderState,
  BubbleRenderState,
  MediaRenderState,
  MediaState,
  MessageContext,
  MessageRenderState,
  PendingRenderState,
  ServiceRenderState,
  StickerRenderState,
} from '../../hooks/useMessage';
// === Render helpers (pure functions, no store dependency) ===
export { computeMessageState } from '../../hooks/useMessage';

// === Loading hooks ===
export { useChatMessageLoader } from '../hooks/useMessageMediaLoader';
export { useSidebarPhotoLoader } from '../hooks/useSidebarPhotoLoader';
// === Selectors ===
export {
  selectChatMessages,
  selectContactPhotos,
  selectHeaderStatus,
  selectSearchResults,
  selectSelectedChat,
  selectUIArchivedChats,
  selectUIChats,
} from './selectors';
// === Store hook ===
export { _resetForTests, useChatStore } from './store';

// === Types (for advanced consumers like hooks that need store shape) ===
export type { ChatState, HeaderStatus } from './types';
