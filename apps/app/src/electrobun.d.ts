/**
 * Type declarations for electrobun.
 *
 * Electrobun ships raw .ts source files instead of compiled .d.ts declarations.
 * TypeScript follows imports into those files and type-checks them with our
 * tsconfig, which fails on deprecated Node.js APIs in their code (rmdirSync).
 * We use tsconfig `paths` to redirect resolution here instead.
 */

// -- electrobun/bun --

export type RPCRequestsSchema = Record<string, { params: unknown; response: unknown }>;
export type RPCMessagesSchema = Record<string, unknown>;

export type RPCSchema<
  I extends { requests?: RPCRequestsSchema; messages?: RPCMessagesSchema } | void = void,
> = {
  requests: I extends { requests: infer R } ? R : RPCRequestsSchema;
  messages: I extends { messages: infer M } ? M : RPCMessagesSchema;
};

export interface ElectrobunRPCSchema {
  bun: RPCSchema;
  webview: RPCSchema;
}

export interface RPCWithTransport {
  setTransport(transport: unknown): void;
}

export declare class BrowserView {
  static defineRPC<Schema extends ElectrobunRPCSchema>(config: {
    maxRequestTime?: number;
    handlers: {
      requests?: {
        [K in keyof Schema['bun']['requests']]?: (
          params: Schema['bun']['requests'][K] extends { params: infer P } ? P : never,
        ) => Schema['bun']['requests'][K] extends { response: infer R }
          ? R | Promise<R>
          : void | Promise<void>;
      };
      messages?: {
        [K in keyof Schema['bun']['messages']]?: (
          payload: Schema['bun']['messages'][K],
        ) => void;
      };
    };
  }): RPCWithTransport;
}

export declare class BrowserWindow {
  constructor(options?: {
    title?: string;
    url?: string | null;
    html?: string | null;
    rpc?: RPCWithTransport;
    frame?: { x?: number; y?: number; width?: number; height?: number };
  });
  on(event: string, handler: (...args: unknown[]) => void): void;
}

export declare const Updater: {
  localInfo: {
    version(): Promise<string>;
    hash(): Promise<string>;
    channel(): Promise<string>;
    baseUrl(): Promise<string>;
  };
  checkForUpdate(): Promise<unknown>;
  downloadUpdate(): Promise<void>;
  applyUpdate(): Promise<void>;
};

export declare const Utils: {
  quit(): void;
  openExternal(url: string): boolean;
  openPath(path: string): boolean;
  paths: Record<string, string>;
};
