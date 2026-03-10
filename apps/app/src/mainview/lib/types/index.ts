export type * as Td from 'tdlib-types';

import type * as Td from 'tdlib-types';

export type { UIChatContext } from './convert';
export {
  enrichReplyPreviews,
  extractForwardName,
  extractInlineKeyboard,
  extractMessagePreview,
  extractServiceText,
  groupUIMessages,
  toChatKind,
  toUIChat,
  toUIMessage,
  toUIPendingMessage,
  toUIReactions,
  toUISearchResult,
  toUITextEntities,
  toUIUser,
} from './convert';
export type {
  ChatKind,
  MessageContentKind,
  UIChat,
  UIKeyboardButton,
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

// HTTP envelope (app-specific, not Telegram)
export type DaemonResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  hasMore?: boolean;
  nextOffset?: number | string;
  exitCode?: number;
};

export type ErrorCode =
  | 'UNKNOWN'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMITED'
  | 'FLOOD_WAIT'
  | 'INVALID_ARGS'
  | 'TIMEOUT'
  | 'NO_SESSION'
  | 'PEER_FLOOD';

// App-only types
export type PendingMessage = {
  _pending: 'sending' | 'failed';
  localId: string;
  chat_id: number;
  text: string;
  date: number;
  reply_to_message_id?: number;
};

// SSE update events from daemon
export type TelegramUpdateEvent =
  | { type: 'new_message'; chat_id: number; message: Td.message }
  | { type: 'edit_message'; chat_id: number; message: Td.message }
  | {
      type: 'delete_messages';
      chat_id: number;
      message_ids: number[];
      is_permanent: boolean;
    }
  | {
      type: 'message_reactions';
      chat_id: number;
      message_id: number;
      interaction_info: Td.messageInteractionInfo;
    }
  | {
      type: 'read_outbox';
      chat_id: number;
      last_read_outbox_message_id: number;
    }
  | {
      type: 'user_typing';
      chat_id: number;
      sender_id: Td.MessageSender;
      action: Td.ChatAction;
    }
  | { type: 'user_status'; user_id: number; status: Td.UserStatus }
  | {
      type: 'message_send_succeeded';
      chat_id: number;
      old_message_id: number;
      message: Td.message;
    }
  | { type: 'user'; user: Td.user }
  | { type: 'reconnected' }
  | { type: 'auth_state'; authorization_state: Td.AuthorizationState };

// Search result extends message with chat context
export type SearchResultMessage = Td.message & {
  chat_title?: string;
};
