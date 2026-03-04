/**
 * CLI entry point — Telegram CLI optimized for AI agents.
 *
 * Usage: tg <command> [args] [--flags]
 *
 * stdout: JSON only — { ok, data } or { ok, error, code }
 * stderr: help text, warnings
 * Entity arguments accept: numeric ID, @username, phone, "me"/"self"
 *
 * The daemon is a persistent background process. The CLI auto-starts it
 * if needed, then communicates over HTTP. `tg --daemon` runs daemon mode.
 */

import { existsSync, readFileSync } from 'node:fs';
import { TelegramClient, TelegramError } from '@tg/protocol';
import { type Command, commands, getCommand } from './commands';
import { ensureDaemon, getDaemonPid, LOG_FILE, runDaemonMode, spawnDaemon } from './daemon';
import { CliError, fail, mapErrorCode, success, warn } from './output';
import { parseArgs } from './parse';

// --- Daemon mode: `tg --daemon` (must be checked before arg parsing) ---

if (process.argv.includes('--daemon')) {
  await runDaemonMode();
}

const MAX_FLOOD_WAIT_SEC = 30;

// --- Help (all to stderr — never pollutes JSON stdout) ---

const COMMAND_GROUPS: [string, string[]][] = [
  ['Identity', ['me', 'resolve', 'contacts']],
  ['Chats', ['find', 'dialogs', 'unread', 'chat', 'members']],
  ['Messages', ['message', 'messages', 'search', 'send', 'edit']],
  ['Actions', ['read', 'delete', 'forward', 'pin', 'unpin', 'react', 'click']],
  ['Real-time', ['listen']],
  ['Media', ['download', 'transcribe']],
  ['Advanced', ['eval']],
  ['Auth', ['auth']],
];

function printHelp(): void {
  const cmdMap = new Map(commands.map((c) => [c.name, c]));
  const lines = [
    'tg — Telegram CLI for AI agents',
    '',
    'Usage: tg <command> [args] [--flags]',
    '',
    'stdout: JSON { ok, data } | { ok, error, code }',
    'stderr: warnings',
    'Entities: numeric ID | @username | +phone | t.me/link | "me"',
    '',
    'Global flags:',
    '  --timeout N   Timeout in seconds',
    '',
  ];

  for (const [group, names] of COMMAND_GROUPS) {
    lines.push(`${group}:`);
    const maxLen = Math.max(...names.map((n) => n.length));
    for (const name of names) {
      const cmd = cmdMap.get(name);
      if (cmd) lines.push(`  ${name.padEnd(maxLen + 2)}${cmd.description}`);
    }
    lines.push('');
  }

  lines.push(
    'Daemon:',
    '  daemon start  Start the background daemon',
    '  daemon stop   Stop the background daemon',
    '  daemon status Check if daemon is running',
    '  daemon log    Show last 20 lines of daemon log',
    '',
    "Run 'tg <command> --help' for command-specific usage.",
  );
  process.stdout.write(`${lines.join('\n')}\n`);
}

function printCommandHelp(cmd: Command): void {
  const lines = [`${cmd.name} — ${cmd.description}`, '', cmd.usage];
  if (cmd.flags) {
    lines.push('', 'Flags:');
    const maxLen = Math.max(...Object.keys(cmd.flags).map((k) => k.length));
    for (const [flag, desc] of Object.entries(cmd.flags)) {
      lines.push(`  ${flag.padEnd(maxLen + 2)}${desc}`);
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

// --- Daemon subcommands ---

async function handleDaemonSubcommand(sub: string): Promise<never> {
  if (sub === 'start') {
    const existingPid = getDaemonPid();
    if (existingPid) {
      success({ already_running: true, pid: existingPid });
    } else {
      spawnDaemon();
      const { url } = await ensureDaemon();
      const pid = getDaemonPid();
      if (url && pid) {
        success({ started: true, pid });
      } else {
        fail('Failed to start daemon', 'UNKNOWN');
      }
    }
  } else if (sub === 'stop') {
    const pid = getDaemonPid();
    if (pid) {
      process.kill(pid, 'SIGTERM');
      success({ stopped: true, pid });
    } else {
      fail('Daemon not running', 'NOT_FOUND');
    }
  } else if (sub === 'status') {
    const pid = getDaemonPid();
    if (pid) {
      success({ running: true, pid });
    } else {
      success({ running: false });
    }
  } else if (sub === 'log') {
    if (existsSync(LOG_FILE)) {
      const log = readFileSync(LOG_FILE, 'utf-8');
      const lines = log.trim().split('\n');
      if ('--json' in flags) {
        success({ lines: lines.slice(-20) });
      } else {
        process.stdout.write(`${lines.slice(-20).join('\n')}\n`);
      }
    } else {
      fail('No daemon log file', 'NOT_FOUND');
    }
  } else {
    fail('Usage: tg daemon <start|stop|status|log>', 'INVALID_ARGS');
  }
  process.exit(0);
}

// --- Main ---

const [cmdName, ...rest] = process.argv.slice(2);
const { positional, flags } = parseArgs(rest ?? []);

// Global flags applied in command handlers (--simple, --timeout, etc.)

// Help (no connect needed)
if (!cmdName || cmdName === 'help' || cmdName === '--help') {
  printHelp();
  process.exit(0);
}

// Version (no connect needed)
if (cmdName === 'version' || cmdName === '--version') {
  const pkg = await Bun.file(new URL('../../package.json', import.meta.url)).json();
  console.error(`tg ${pkg.version}`);
  process.exit(0);
}

// Daemon subcommands (no connect needed)
if (cmdName === 'daemon') {
  try {
    await handleDaemonSubcommand(positional[0] ?? '');
  } catch (e) {
    if (e instanceof CliError) {
      process.exitCode = 1;
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        fail(msg, 'UNKNOWN');
      } catch {
        process.exitCode = 1;
      }
    }
    process.exit();
  }
}

// --- Run command (wrapped to catch CliError at every stage) ---

async function run(): Promise<void> {
  // Resolve command
  const cmd = getCommand(cmdName as string);
  if (!cmd)
    fail(`Unknown command: "${cmdName}". Run 'tg --help' for available commands.`, 'INVALID_ARGS');

  if ('--help' in flags) {
    printCommandHelp(cmd);
    process.exit(0);
  }

  // Handle --stdin: read text from stdin and append as positional arg
  if ('--stdin' in flags) {
    if (process.stdin.isTTY) {
      fail(
        "--stdin requires piped input (e.g., echo 'text' | tg send me --stdin --html)",
        'INVALID_ARGS',
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString('utf-8').replace(/\n$/, '');
    if (!text) fail('No input received from stdin', 'INVALID_ARGS');
    positional.push(text);
    delete flags['--stdin'];
  }

  // Handle --file: read text from file and append as positional arg
  if (flags['--file']) {
    const filePath = flags['--file'];
    if (!existsSync(filePath)) fail(`File not found: ${filePath}`, 'INVALID_ARGS');
    const text = readFileSync(filePath, 'utf-8');
    if (!text) fail(`File is empty: ${filePath}`, 'INVALID_ARGS');
    positional.push(text);
    delete flags['--file'];
  }

  // Validate required args BEFORE connecting (saves time on typos)
  if (cmd.minArgs && positional.length < cmd.minArgs) {
    fail(
      `"${cmd.name}" requires at least ${cmd.minArgs} argument${cmd.minArgs > 1 ? 's' : ''}. Run 'tg ${cmd.name} --help' for usage.`,
      'INVALID_ARGS',
    );
  }

  // Reject unknown flags
  const GLOBAL_FLAGS = new Set(['--timeout', '--help', '--file', '--stdin']);
  const knownFlags = new Set([...GLOBAL_FLAGS, ...Object.keys(cmd.flags ?? {})]);
  const unknownFlags = Object.keys(flags).filter((f) => !knownFlags.has(f));
  if (unknownFlags.length > 0) {
    fail(
      `Unknown flag${unknownFlags.length > 1 ? 's' : ''}: ${unknownFlags.join(', ')}. Run 'tg ${cmd.name} --help' for usage.`,
      'INVALID_ARGS',
    );
  }

  // --- Ensure daemon is running and create client ---

  const { url } = await ensureDaemon();
  const client = new TelegramClient(url);

  // --- Execute command ---

  async function execute(): Promise<void> {
    const timeoutSec = flags['--timeout'] ? Number(flags['--timeout']) : 3;

    // Streaming commands handle their own lifecycle (never-resolving promise + signal handlers)
    if (cmd?.streaming) {
      await cmd.run(client, positional, flags);
      return;
    }

    if (timeoutSec > 0) {
      client.signal = AbortSignal.timeout(timeoutSec * 1000);
    }

    await cmd?.run(client, positional, flags);
  }

  try {
    await execute();
  } catch (e: unknown) {
    // CliError means fail() already wrote JSON to stdout — don't write again
    if (e instanceof CliError) throw e;
    if (e instanceof TelegramError && e.code === 429) {
      // TelegramError with code 429 = flood wait
      const match = e.message.match(/retry after (\d+)/);
      const waitSecs = match ? Number(match[1]) : 5;
      if (waitSecs <= MAX_FLOOD_WAIT_SEC) {
        warn(`Rate limited. Waiting ${waitSecs}s before retry...`);
        await new Promise((r) => setTimeout(r, waitSecs * 1000));
        await execute();
      } else {
        fail(`Rate limited. Retry after ${waitSecs}s`, 'FLOOD_WAIT');
      }
    } else {
      const err = e instanceof Error ? e : new Error(String(e));
      fail(err.message, mapErrorCode(err.message));
    }
  } finally {
    client.close();
  }
}

try {
  await run();
} catch (e) {
  // CliError means fail() already wrote JSON to stdout — just set exit code
  if (e instanceof CliError) {
    process.exitCode = 1;
  } else {
    // Unexpected error — write JSON and set exit code
    try {
      fail(e instanceof Error ? e.message : String(e), 'UNKNOWN');
    } catch {
      /* CliError */
    }
    process.exitCode = 1;
  }
}
