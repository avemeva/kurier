// Public API — single import point for the store

export {
  actionLabel,
  selectChatMessages,
  selectHeaderStatus,
  selectSearchResults,
  selectSelectedChat,
  selectSelectedDialog,
  selectUIArchivedChats,
  selectUIChats,
  selectUIUser,
  selectUnresolvedPinnedPreviews,
  selectUnresolvedReplies,
} from './selectors';
export { _resetForTests, useChatStore } from './store';
export type { ChatState, HeaderStatus, PendingMessage } from './types';
