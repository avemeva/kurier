/**
 * Type declarations for electrobun.
 *
 * Electrobun ships raw .ts source files instead of compiled .d.ts declarations.
 * TypeScript follows imports into those files and type-checks them with our
 * tsconfig, which fails on deprecated Node.js APIs in their code (rmdirSync).
 *
 * This file is used via tsconfig `paths` to redirect type resolution for
 * electrobun/bun, electrobun/view, and electrobun. The Bun.build() API used
 * by electrobun's CLI does NOT follow tsconfig paths, so the real modules are
 * bundled at build time while TypeScript sees these declarations.
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

// -- electrobun/view --

export declare class Electroview {
  constructor(options: { rpc: RPCWithTransport });
  static defineRPC<Schema extends ElectrobunRPCSchema>(config: {
    handlers: {
      requests?: Record<string, (...args: unknown[]) => unknown>;
      messages?: Record<string, (...args: unknown[]) => void>;
    };
  }): RPCWithTransport;
}

// -- electrobun config --

export interface ElectrobunConfig {
  app: {
    name: string;
    identifier: string;
    version: string;
    description?: string;
  };
  build?: {
    bun?: { entrypoint?: string; [key: string]: unknown };
    copy?: Record<string, string>;
    mac?: { bundleCEF?: boolean };
    win?: { bundleCEF?: boolean };
    linux?: { bundleCEF?: boolean };
  };
}

// -- Window globals injected by Electrobun runtime --

declare global {
  interface Window {
    __electrobunWebviewId?: number;
    __electrobunWindowId?: number;
    __electrobun?: unknown;
  }
}
