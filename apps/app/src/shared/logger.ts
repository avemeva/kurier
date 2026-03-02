export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type Source = 'bun' | 'web' | 'telegram';

export interface LogEntry {
  time: number;
  source: Source;
  level: LogLevel;
  tabId?: string;
  message: string;
}

const MAX_STRING_LEN = 4096;

export function safeStringify(args: unknown[]): string {
  const parts: string[] = [];
  for (const arg of args) {
    parts.push(stringifyOne(arg));
  }
  const result = parts.join(' ');
  if (result.length > MAX_STRING_LEN) return `${result.slice(0, MAX_STRING_LEN)}...`;
  return result;
}

function stringifyOne(val: unknown, seen?: WeakSet<object>): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'bigint') return `${val.toString()}n`;
  if (val instanceof Error) return val.stack ?? val.message;
  if (typeof val !== 'object') return String(val);

  if (!seen) seen = new WeakSet();
  if (seen.has(val)) return '[Circular]';
  seen.add(val);

  try {
    if (Array.isArray(val)) {
      const items = val.map((v) => stringifyOne(v, seen));
      return `[${items.join(', ')}]`;
    }
    const entries = Object.entries(val as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${stringifyOne(v, seen)}`,
    );
    return `{ ${entries.join(', ')} }`;
  } catch {
    return '[Object]';
  }
}

export function formatLogLine(entry: LogEntry): string {
  const d = new Date(entry.time);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  const time = `${hh}:${mm}:${ss}.${ms}`;

  const source = entry.source.padEnd(8);
  const level = entry.level.padEnd(5);
  const tab = entry.tabId ? `[${entry.tabId}] ` : '';

  return `${time} ${source} ${level} ${tab}${entry.message}`;
}

export type Transport = (entry: LogEntry, formatted: string) => void;

export interface LoggerOptions {
  source: Source;
  tabId?: string;
  transports: Transport[];
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(opts: LoggerOptions): Logger {
  function emit(level: LogLevel, args: unknown[]) {
    try {
      const entry: LogEntry = {
        time: Date.now(),
        source: opts.source,
        level,
        tabId: opts.tabId,
        message: safeStringify(args),
      };
      const formatted = formatLogLine(entry);
      for (const transport of opts.transports) {
        try {
          transport(entry, formatted);
        } catch {
          // swallow transport errors
        }
      }
    } catch {
      // swallow logger errors
    }
  }

  return {
    debug: (...args: unknown[]) => emit('DEBUG', args),
    info: (...args: unknown[]) => emit('INFO', args),
    warn: (...args: unknown[]) => emit('WARN', args),
    error: (...args: unknown[]) => emit('ERROR', args),
  };
}
