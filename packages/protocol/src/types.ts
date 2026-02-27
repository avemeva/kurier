import type { error } from 'tdlib-types';

/** Daemon response envelope. */
export type DaemonResponse<T> = { ok: true; data: T } | { ok: false; error: error };

/** Auth state returned by GET /api/tg/auth/state. */
export interface AuthState {
  state: string;
  ready: boolean;
  code_info?: {
    _: string;
    phone_number: string;
    type: unknown;
    next_type?: unknown;
    timeout: number;
  };
  password_hint?: string;
  has_recovery_email?: boolean;
  recovery_email_pattern?: string;
}

/** Error thrown by TelegramClient when a TDLib call fails. */
export class TelegramError extends Error {
  readonly code: number;

  constructor(err: error) {
    super(err.message);
    this.name = 'TelegramError';
    this.code = err.code;
  }
}
