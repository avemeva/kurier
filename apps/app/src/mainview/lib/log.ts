import { createLogger, type LogLevel, safeStringify, type Transport } from '../../shared/logger';

const TAB_ID = Math.random().toString(36).slice(2, 6);

// Capture original console methods before any wrapping
const nativeConsole = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const CONSOLE_METHOD: Record<LogLevel, (...args: unknown[]) => void> = {
  DEBUG: nativeConsole.debug,
  INFO: nativeConsole.log,
  WARN: nativeConsole.warn,
  ERROR: nativeConsole.error,
};

const consoleTransport: Transport = (entry) => {
  CONSOLE_METHOD[entry.level](`[${entry.source}]`, entry.message);
};

const beaconTransport: Transport = (entry) => {
  try {
    const payload = JSON.stringify(entry);
    navigator.sendBeacon('/api/log', payload);
  } catch {
    // fire-and-forget
  }
};

function makeTransports(): Transport[] {
  const t: Transport[] = [consoleTransport];
  if (import.meta.env.DEV) t.push(beaconTransport);
  return t;
}

export const log = createLogger({
  source: 'web',
  tabId: TAB_ID,
  transports: makeTransports(),
});

export const telegramLog = createLogger({
  source: 'telegram',
  tabId: TAB_ID,
  transports: makeTransports(),
});

export { safeStringify, TAB_ID };
