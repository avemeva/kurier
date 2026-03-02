import type { ElectrobunRPCSchema, RPCSchema } from 'electrobun/bun';

export interface AppRPCSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      'tg:command': {
        params: { command: string; args?: string[]; flags?: Record<string, string> };
        response: { ok: boolean; data?: unknown; error?: string; code?: string };
      };
    };
    messages: {
      'tg:event': { data: Record<string, unknown> };
    };
  };
  webview: RPCSchema<void>;
}
