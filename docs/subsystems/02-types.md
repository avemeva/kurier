# 02 — @tg/types

## Purpose
Shared type definitions used by every other package and app. Zero runtime code — types only (with the exception of runtime enum-like constants for ErrorCode).

## Package
- **Name:** `@tg/types`
- **Location:** `packages/types/`
- **Exports:** TypeScript types + ErrorCode constants
- **Dependencies:** `tdlib-types` (peer)

## Structure
```
packages/types/
├── src/
│   ├── index.ts              # Re-exports everything
│   ├── tdlib.ts              # Re-export + patch tdlib-types for UI/CLI use
│   ├── protocol.ts           # Daemon HTTP protocol types
│   ├── updates.ts            # SSE update event types
│   └── errors.ts             # ErrorCode enum + error utilities
├── package.json
└── tsconfig.json
```

## Type Definitions

### tdlib.ts — Patched TDLib Types
Re-export `Td` namespace from `tdlib-types` and add UI/CLI-friendly extensions:

```ts
import type { Td } from "tdlib-types";
export type { Td };

// UI-friendly chat info (flattened from Td.chat)
export interface ChatInfo {
  id: number;
  type: Td.ChatType;
  title: string;
  photoUrl: string | null;
  lastMessage: MessageInfo | null;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  draftText: string | null;
  lastReadInboxMessageId: number;
  lastReadOutboxMessageId: number;
}

// UI-friendly message info (flattened from Td.message)
export interface MessageInfo {
  id: number;
  chatId: number;
  senderId: number;
  senderName: string;
  isOutgoing: boolean;
  date: number;
  editDate: number;
  content: Td.MessageContent;
  replyToMessageId: number;
  forwardInfo: Td.messageForwardInfo | null;
  interactionInfo: Td.messageInteractionInfo | null;
  isPinned: boolean;
}

// UI-friendly user info
export interface UserInfo {
  id: number;
  firstName: string;
  lastName: string;
  username: string | null;
  phoneNumber: string;
  status: Td.UserStatus;
  photoUrl: string | null;
  isPremium: boolean;
  emojiStatus: Td.emojiStatus | null;
  isContact: boolean;
}

// Pending message (optimistic send)
export interface PendingMessage {
  _pending: "sending" | "failed";
  localId: string;
  chatId: number;
  text: string;
  date: number;
  replyToMessageId?: number;
}

// Search result with cross-chat context
export interface SearchResultMessage extends MessageInfo {
  chatTitle?: string;
}

// Peer info for contact search results
export interface PeerInfo {
  id: number;
  type: "user" | "chat" | "channel";
  title: string;
  username: string | null;
  photoUrl: string | null;
}
```

### protocol.ts — Daemon HTTP Protocol
```ts
// Request sent to POST /api/tg/command
export interface DaemonRequest {
  command: string;
  args?: string[];
  flags?: Record<string, string>;
  role?: "cli" | "ui" | "web";
}

// Response from daemon
export interface DaemonResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: ErrorCode;
  hasMore?: boolean;
  nextOffset?: number | string;
}

// Command metadata (for CLI help, validation)
export interface CommandDef {
  name: string;
  description: string;
  usage: string;
  minArgs?: number;
  flags?: Record<string, string>;
  streaming?: boolean;
}
```

### updates.ts — SSE Update Events
```ts
export type TelegramUpdateEvent =
  | { type: "new_message"; chatId: number; message: Td.message }
  | { type: "edit_message"; chatId: number; message: Td.message }
  | { type: "delete_messages"; chatId: number; messageIds: number[]; isPermanent: boolean }
  | { type: "message_reactions"; chatId: number; messageId: number; interactionInfo: Td.messageInteractionInfo }
  | { type: "read_outbox"; chatId: number; lastReadOutboxMessageId: number }
  | { type: "user_typing"; chatId: number; senderId: Td.MessageSender; action: Td.ChatAction }
  | { type: "user_status"; userId: number; status: Td.UserStatus }
  | { type: "message_send_succeeded"; chatId: number; oldMessageId: number; message: Td.message }
  | { type: "reconnected" }
  | { type: "auth_state"; authorizationState: Td.AuthorizationState };
```

### errors.ts — Error Codes
```ts
export const ErrorCode = {
  UNKNOWN: "UNKNOWN",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  RATE_LIMITED: "RATE_LIMITED",
  FLOOD_WAIT: "FLOOD_WAIT",
  INVALID_ARGS: "INVALID_ARGS",
  TIMEOUT: "TIMEOUT",
  NO_SESSION: "NO_SESSION",
  PEER_FLOOD: "PEER_FLOOD",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export function isFloodWait(error: unknown): error is { code: "FLOOD_WAIT"; retryAfter: number } { ... }
export function formatError(code: ErrorCode, message: string): string { ... }
```

## Testability
- Type-level tests via `tsc --noEmit`
- Unit tests for error utilities (`isFloodWait`, `formatError`)
- No runtime dependencies except constants — can be imported anywhere
