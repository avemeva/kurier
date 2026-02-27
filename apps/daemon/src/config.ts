/**
 * Application configuration — paths, ports, environment.
 *
 * All path constants resolve to ~/Library/Application Support/dev.telegramai.app.
 * TDLib API credentials are loaded from environment variables or .env files.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** Root application data directory. */
export const APP_DIR = path.join(homedir(), 'Library', 'Application Support', 'dev.telegramai.app');

/** TDLib database directory (session, metadata). */
export const DB_DIR = path.join(APP_DIR, 'tdlib_db');

/** TDLib downloaded files directory (media, profile photos). */
export const FILES_DIR = path.join(APP_DIR, 'media_cache');

/** Daemon PID file path. */
export const PID_FILE = path.join(APP_DIR, 'tg_daemon.pid');

/** Daemon port file path (written after server starts). */
export const PORT_FILE = path.join(APP_DIR, 'tg_daemon.port');

/** Daemon log file path. */
export const LOG_FILE = path.join(APP_DIR, 'tg_daemon.log');

/** Default HTTP server port. */
export const DEFAULT_PORT = 7312;

/** Idle timeout in milliseconds (10 minutes). */
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Command execution timeout in milliseconds (30 seconds). */
export const COMMAND_TIMEOUT_MS = 30_000;

/** TDLib API credentials. */
export interface TdlibCredentials {
  apiId: number;
  apiHash: string;
}

/**
 * Load TDLib API credentials from environment or .env files.
 *
 * Search order:
 *   1. Environment variables: TG_API_ID / TG_API_HASH
 *   2. Environment variables: VITE_TG_API_ID / VITE_TG_API_HASH
 *   3. .env files in known project locations
 */
export function loadCredentials(): TdlibCredentials {
  // Try environment variables first
  const envId = process.env.TG_API_ID ?? process.env.VITE_TG_API_ID;
  const envHash = process.env.TG_API_HASH ?? process.env.VITE_TG_API_HASH;
  if (envId && envHash) {
    const apiId = Number(envId);
    if (apiId && envHash) return { apiId, apiHash: envHash };
  }

  // Fall back to .env files
  const candidates = [
    path.resolve(import.meta.dir, '../../../.env'),
    path.resolve(import.meta.dir, '../../.env'),
    path.resolve(import.meta.dir, '../.env'),
  ];

  for (const envPath of candidates) {
    try {
      const text = readFileSync(envPath, 'utf-8');
      const vars: Record<string, string> = {};
      for (const line of text.split('\n')) {
        const m = line.match(/^(\w+)=(.*)$/);
        if (m?.[1] && m[2] !== undefined) vars[m[1]] = m[2];
      }
      const apiId = Number(vars.VITE_TG_API_ID ?? vars.TG_API_ID);
      const apiHash = vars.VITE_TG_API_HASH ?? vars.TG_API_HASH ?? '';
      if (apiId && apiHash) return { apiId, apiHash };
    } catch {
      // File doesn't exist or can't be read — try next
    }
  }

  throw new Error(
    'Could not find TDLib API credentials. Set TG_API_ID and TG_API_HASH environment variables.',
  );
}
