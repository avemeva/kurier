/**
 * Daemon lifecycle management — check, spawn, wait.
 *
 * The CLI auto-starts the daemon if it's not running, then communicates
 * with it over HTTP via TelegramClient.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { warn } from './output';

const APP_DIR = path.join(homedir(), 'Library', 'Application Support', 'dev.telegramai.app');
const PID_FILE = path.join(APP_DIR, 'tg_daemon.pid');
const PORT_FILE = path.join(APP_DIR, 'tg_daemon.port');
export const LOG_FILE = path.join(APP_DIR, 'tg_daemon.log');
const DEFAULT_PORT = 7312;

/** Read the daemon PID from the PID file and verify the process is alive. */
export function getDaemonPid(): number | null {
  try {
    const raw = readFileSync(PID_FILE, 'utf-8').trim();
    const pid = Number(raw);
    if (Number.isNaN(pid) || pid <= 0) return null;
    process.kill(pid, 0); // signal 0 = existence check
    return pid;
  } catch {
    return null;
  }
}

/** Check if the daemon process is running. */
export function isDaemonRunning(): boolean {
  return getDaemonPid() !== null;
}

/** Read the daemon port from the port file, falling back to the default. */
export function getDaemonPort(): number {
  try {
    const raw = readFileSync(PORT_FILE, 'utf-8').trim();
    const port = Number(raw);
    if (port > 0 && port < 65536) return port;
  } catch {
    // Port file doesn't exist or is unreadable
  }
  return DEFAULT_PORT;
}

/** Spawn the daemon as a detached background process. */
export function spawnDaemon(): void {
  const daemonScript = path.resolve(import.meta.dir, '../../daemon/src/index.ts');
  const child = Bun.spawn(['bun', daemonScript], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  child.unref();
}

/**
 * Wait for the daemon's health endpoint to respond.
 * Polls every 200ms for up to `timeoutMs` milliseconds.
 */
async function waitForDaemon(port: number, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Ensure the daemon is running. Spawns it if needed and waits for health.
 * Returns the base URL for TelegramClient.
 */
export async function ensureDaemon(): Promise<{ port: number; url: string }> {
  if (!isDaemonRunning()) {
    spawnDaemon();
  }

  const port = getDaemonPort();
  const url = `http://localhost:${port}`;

  const ready = await waitForDaemon(port);
  if (!ready) {
    // The port file might not exist yet — re-read after spawn
    const retryPort = getDaemonPort();
    if (retryPort !== port) {
      const retryUrl = `http://localhost:${retryPort}`;
      const retryReady = await waitForDaemon(retryPort);
      if (retryReady) return { port: retryPort, url: retryUrl };
    }
    warn('Daemon did not respond to health check within 5 seconds');
  }

  return { port, url };
}
