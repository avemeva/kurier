// Public API — single import point for the store package.
// Components import selectors, hooks, UI types, and action refs from here.
// Internal details (converters, raw Td types, ChatState internals) are not exported.

// === Loading hooks ===
export { useChatMessageLoader } from '../hooks/use-message-media-loader';
export { useSidebarPhotoLoader } from '../hooks/use-sidebar-photo-loader';
// === Selectors ===
export {
  selectArchivedChats,
  selectChatMessages,
  selectChats,
  selectContactPhotos,
  selectHeaderStatus,
  selectSearchResults,
  selectSelectedChat,
} from './selectors';
// === Store hook ===
export { _resetForTests, useChatStore } from './store';

// === Types (for advanced consumers like hooks that need store shape) ===
export type { ChatState, HeaderStatus } from './types';
