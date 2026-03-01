/**
 * Cross-platform paths for the Telegram AI application.
 *
 * Platform conventions:
 *   macOS:   ~/Library/Application Support/dev.telegramai.app
 *   Linux:   $XDG_DATA_HOME/tg  (defaults to ~/.local/share/tg)
 *   Windows: %LOCALAPPDATA%/tg  (defaults to ~/AppData/Local/tg)
 */

import { homedir } from 'node:os';
import path from 'node:path';

const platform = process.platform;

// ---------------------------------------------------------------------------
// Application data directory (TDLib database, media cache, daemon PID/port)
// ---------------------------------------------------------------------------

export function getAppDir(): string {
  switch (platform) {
    case 'darwin':
      return path.join(homedir(), 'Library', 'Application Support', 'dev.telegramai.app');
    case 'win32':
      return path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local'), 'tg');
    default:
      return path.join(process.env.XDG_DATA_HOME ?? path.join(homedir(), '.local', 'share'), 'tg');
  }
}

// ---------------------------------------------------------------------------
// Config directory (API credentials)
// ---------------------------------------------------------------------------

export function getConfigDir(): string {
  switch (platform) {
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(homedir(), 'AppData', 'Roaming'), 'tg');
    default:
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config'), 'tg');
  }
}

// ---------------------------------------------------------------------------
// TDLib native library
// ---------------------------------------------------------------------------

/** Platform-specific library filename. */
export function getTdjsonFilename(): string {
  switch (platform) {
    case 'darwin':
      return 'libtdjson.dylib';
    case 'win32':
      return 'tdjson.dll';
    default:
      return 'libtdjson.so';
  }
}

/** Directory where the installed TDLib library lives. */
export function getLibDir(): string {
  switch (platform) {
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local'),
        'tg',
        'lib',
      );
    default:
      return path.join(homedir(), '.local', 'lib', 'tg');
  }
}

/** Full path to the installed TDLib native library. */
export function getInstalledTdjsonPath(): string {
  return path.join(getLibDir(), getTdjsonFilename());
}

// ---------------------------------------------------------------------------
// Derived paths (convenience)
// ---------------------------------------------------------------------------

export const APP_DIR = getAppDir();
export const CONFIG_DIR = getConfigDir();
export const DB_DIR = path.join(APP_DIR, 'tdlib_db');
export const FILES_DIR = path.join(APP_DIR, 'media_cache');
export const PID_FILE = path.join(APP_DIR, 'tg_daemon.pid');
export const PORT_FILE = path.join(APP_DIR, 'tg_daemon.port');
export const LOG_FILE = path.join(APP_DIR, 'tg_daemon.log');
export const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials');
