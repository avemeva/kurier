import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { BrowserView, BrowserWindow, Updater, Utils } from 'electrobun/bun';
import { createLogger } from '../shared/logger';
import type { AppRPCSchema } from '../shared/rpc-schema';

const log = createLogger({
  source: 'bun',
  transports: [
    (entry, formatted) => {
      const out = entry.level === 'ERROR' ? process.stderr : process.stdout;
      out.write(`${formatted}\n`);
    },
  ],
});

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});

const APP_DIR = join(homedir(), 'Library', 'Application Support', 'dev.telegramai.app');
const DAEMON_SOCKET = join(APP_DIR, 'tg_daemon.sock');
const DAEMON_PID = join(APP_DIR, 'tg_daemon.pid');

const PORTLESS_NAME = 'tg';
const PORTLESS_ROUTES = join(homedir(), '.portless', 'routes.json');

// --- Crash supervisor for daemon ---

let daemonProcess: ReturnType<typeof Bun.spawn> | null = null;
let restartCount = 0;
let lastRestartTime = 0;
const MAX_RESTART_RATE = 5; // max restarts within window
const RESTART_WINDOW_MS = 30_000; // 30 second window

function getDaemonPid(): number | null {
  try {
    const pid = Number(readFileSync(DAEMON_PID, 'utf-8').trim());
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function spawnDaemon(): void {
  const daemonScript = resolve(__dirname, '../../scripts/tg/daemon.ts');
  log.info(`Spawning daemon: ${daemonScript}`);
  daemonProcess = Bun.spawn(['bun', daemonScript], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  daemonProcess.unref();
}

async function waitForDaemon(timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(DAEMON_SOCKET)) {
      const alive = await new Promise<boolean>((resolve) => {
        const sock = net.createConnection(DAEMON_SOCKET);
        sock.on('connect', () => {
          sock.write('{"command":"ping","args":[],"flags":{}}\n');
        });
        sock.on('data', () => {
          sock.destroy();
          resolve(true);
        });
        sock.on('error', () => resolve(false));
        sock.setTimeout(1000, () => {
          sock.destroy();
          resolve(false);
        });
      });
      if (alive) return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function ensureDaemon(): Promise<void> {
  if (getDaemonPid()) return;

  const now = Date.now();
  if (now - lastRestartTime < RESTART_WINDOW_MS) {
    restartCount++;
    if (restartCount > MAX_RESTART_RATE) {
      log.error(
        `Daemon restart rate exceeded (${restartCount} in ${RESTART_WINDOW_MS / 1000}s), backing off`,
      );
      return;
    }
  } else {
    restartCount = 1;
    lastRestartTime = now;
  }

  spawnDaemon();
  const ready = await waitForDaemon();
  if (ready) {
    log.info('Daemon started successfully');
  } else {
    log.error('Failed to start daemon');
  }
}

// Monitor daemon health — check every 10 seconds
setInterval(async () => {
  if (!getDaemonPid()) {
    log.warn('Daemon not running, attempting restart...');
    await ensureDaemon();
  }
}, 10_000);

// --- Daemon proxy: send commands via Unix socket ---

function daemonRequest(
  command: string,
  args: string[] = [],
  flags: Record<string, string> = {},
): Promise<{ ok: boolean; data?: unknown; error?: string; code?: string }> {
  return new Promise((resolve) => {
    const socket = net.createConnection(DAEMON_SOCKET);
    let buffer = '';

    socket.on('connect', () => {
      socket.write(
        `${JSON.stringify({
          command,
          args,
          flags,
          role: 'ui',
        })}\n`,
      );
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
    });

    socket.on('end', () => {
      try {
        const response = JSON.parse(buffer.trim());
        resolve(response);
      } catch {
        resolve({ ok: false, error: 'Invalid daemon response', code: 'UNKNOWN' });
      }
    });

    socket.on('error', () => {
      resolve({ ok: false, error: 'Daemon unavailable', code: 'UNKNOWN' });
    });

    socket.setTimeout(60_000, () => {
      socket.destroy();
      resolve({ ok: false, error: 'Daemon timeout', code: 'TIMEOUT' });
    });
  });
}

// Resolve dev server URL: portless route → direct Vite → bundled files
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel !== 'dev') return 'views://mainview/index.html';

  // Try to find the Vite port from portless routes
  try {
    const routes = JSON.parse(readFileSync(PORTLESS_ROUTES, 'utf-8'));
    const route = routes.find(
      (r: { hostname: string }) => r.hostname === `${PORTLESS_NAME}.localhost`,
    );
    if (route) {
      const url = `http://127.0.0.1:${route.port}`;
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        log.info(`HMR enabled: Using portless route "${PORTLESS_NAME}" at ${url}`);
        return url;
      }
    }
  } catch {
    // No portless routes
  }

  // Fall back to direct Vite dev server
  try {
    const url = 'http://localhost:5173';
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) {
      log.info(`HMR enabled: Using Vite dev server at ${url}`);
      return url;
    }
  } catch {
    // No Vite server
  }

  log.warn("Dev server not running. Run 'bun run dev:hmr' for HMR support.");
  return 'views://mainview/index.html';
}

mkdirSync(APP_DIR, { recursive: true });

// Ensure daemon is running before creating window
await ensureDaemon();

const rpc = BrowserView.defineRPC<AppRPCSchema>({
  maxRequestTime: 60_000,
  handlers: {
    requests: {
      'tg:command': async ({ command, args, flags }) => {
        await ensureDaemon();
        return daemonRequest(command, args ?? [], flags ?? {});
      },
    },
  },
});

// Create the main application window
const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
  title: 'Telegram AI',
  url,
  rpc,
  frame: {
    width: 900,
    height: 700,
    x: 200,
    y: 200,
  },
});

// Quit the app when the main window is closed
mainWindow.on('close', () => {
  Utils.quit();
});

log.info('Telegram AI started!');
