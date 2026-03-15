export type * as Td from 'tdlib-types';

import type * as Td from 'tdlib-types';

export type { TGChatContext } from './convert';
export {
  buildReplyPreview,
  enrichReplyPreviews,
  extractForwardName,
  extractForwardPhotoId,
  extractInlineKeyboard,
  extractMediaLabel,
  extractMessagePreview,
  extractServiceAction,
  extractText,
  groupAndConvert,
  hydrateMessage,
  toChatKind,
  toTGChat,
  toTGContent,
  toTGForward,
  toTGMessage,
  toTGReactions,
  toTGReplyTo,
  toTGSearchResult,
  toTGSender,
  toTGTextEntities,
  toTGUser,
} from './convert';
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
} from './tg';

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
  | { type: 'auth_state'; authorization_state: Td.AuthorizationState }
  | {
      type: 'chat_read_inbox';
      chat_id: number;
      last_read_inbox_message_id: number;
      unread_count: number;
    }
  | { type: 'new_chat'; chat: Td.chat }
  | {
      type: 'chat_last_message';
      chat_id: number;
      last_message?: Td.message;
      positions: Td.chatPosition[];
    }
  | { type: 'chat_position'; chat_id: number; position: Td.chatPosition }
  | {
      type: 'message_send_failed';
      chat_id: number;
      old_message_id: number;
      message: Td.message;
      error: Td.error;
    }
  | { type: 'chat_title'; chat_id: number; title: string }
  | { type: 'chat_photo'; chat_id: number; photo?: Td.chatPhotoInfo }
  | {
      type: 'chat_notification_settings';
      chat_id: number;
      notification_settings: Td.chatNotificationSettings;
    }
  | {
      type: 'chat_draft_message';
      chat_id: number;
      draft_message?: Td.draftMessage;
      positions: Td.chatPosition[];
    }
  | { type: 'connection_state'; state: Td.ConnectionState }
  | { type: 'chat_is_marked_as_unread'; chat_id: number; is_marked_as_unread: boolean }
  | { type: 'chat_unread_mention_count'; chat_id: number; unread_mention_count: number }
  | { type: 'chat_unread_reaction_count'; chat_id: number; unread_reaction_count: number }
  | { type: 'message_is_pinned'; chat_id: number; message_id: number; is_pinned: boolean }
  | { type: 'chat_online_member_count'; chat_id: number; online_member_count: number };

// Search result extends message with chat context
export type SearchResultMessage = Td.message & {
  chat_title?: string;
};
