// @vitest-environment node

import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger, type LogEntry, safeStringify } from './logger';

// --- Vite dev server for /api/log endpoint ---

let server: ViteDevServer;
let baseUrl: string;
const captured: string[] = [];
let originalWrite: typeof process.stdout.write;

beforeAll(async () => {
  // Intercept stdout to capture formatted log lines
  originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: unknown, ..._args: unknown[]) => {
    const str = typeof chunk === 'string' ? chunk : (chunk as Buffer).toString();
    captured.push(str);
    return true;
  }) as typeof process.stdout.write;

  server = await createServer({
    configFile: path.resolve(__dirname, '../../vite.config.ts'),
    server: { port: 0 },
    optimizeDeps: { noDiscovery: true },
  });
  await server.listen();
  const info = server.httpServer?.address();
  if (info && typeof info === 'object') {
    baseUrl = `http://localhost:${info.port}`;
  }
}, 15_000);

afterAll(async () => {
  process.stdout.write = originalWrite;
  await server?.close();
});

function clearCaptured() {
  captured.length = 0;
}

function lastLine(): string {
  // Find the last non-empty captured chunk
  for (let i = captured.length - 1; i >= 0; i--) {
    const trimmed = captured[i].trim();
    if (trimmed) return trimmed;
  }
  return '';
}

async function postLog(body: string, method = 'POST'): Promise<Response> {
  return fetch(`${baseUrl}/api/log`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? body : undefined,
  });
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    time: new Date('2026-02-23T14:23:05.123').getTime(),
    source: 'web',
    level: 'INFO',
    tabId: 'a3k9',
    message: 'App mounted',
    ...overrides,
  };
}

// ─── E2E: Vite /api/log middleware ──────────────────────────

describe('/api/log endpoint', () => {
  it('1. prints formatted log line to stdout for valid POST', async () => {
    clearCaptured();
    const entry = makeEntry();
    const res = await postLog(JSON.stringify(entry));
    expect(res.status).toBe(204);
    expect(lastLine()).toBe('14:23:05.123 web      INFO  [a3k9] App mounted');
  });

  it('2. all log levels appear with correct padding', async () => {
    for (const level of ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const) {
      clearCaptured();
      const entry = makeEntry({ level, message: `msg-${level}` });
      await postLog(JSON.stringify(entry));
      expect(lastLine()).toContain(`${level.padEnd(5)}`);
      expect(lastLine()).toContain(`msg-${level}`);
    }
  });

  it('3. all sources appear with correct padding', async () => {
    for (const source of ['bun', 'web', 'telegram'] as const) {
      clearCaptured();
      const entry = makeEntry({ source, message: `from-${source}` });
      await postLog(JSON.stringify(entry));
      expect(lastLine()).toContain(source.padEnd(8));
      expect(lastLine()).toContain(`from-${source}`);
    }
  });

  it('4. tab ID shown in brackets for frontend logs', async () => {
    clearCaptured();
    const entry = makeEntry({ tabId: 'x7f2' });
    await postLog(JSON.stringify(entry));
    expect(lastLine()).toContain('[x7f2]');
  });

  it('5. no tab ID bracket for backend logs', async () => {
    clearCaptured();
    const entry = makeEntry({ tabId: undefined, source: 'bun' });
    await postLog(JSON.stringify(entry));
    const line = lastLine();
    expect(line).not.toContain('[');
    expect(line).toMatch(/bun\s+INFO\s+App mounted/);
  });

  it('6. rejects body > 8KB with 413', async () => {
    const huge = JSON.stringify(makeEntry({ message: 'x'.repeat(9000) }));
    const res = await postLog(huge);
    expect(res.status).toBe(413);
  });

  it('7. silently ignores invalid JSON (returns 204)', async () => {
    clearCaptured();
    const linesBefore = captured.length;
    const res = await postLog('not json {{{');
    expect(res.status).toBe(204);
    // No log line should have been written for the bad payload
    const newLines = captured.slice(linesBefore).filter((s) => s.trim());
    expect(newLines).toHaveLength(0);
  });

  it('8. silently ignores empty body (returns 204)', async () => {
    clearCaptured();
    const res = await postLog('');
    expect(res.status).toBe(204);
  });

  it('9. rejects non-POST methods with 405', async () => {
    const res = await fetch(`${baseUrl}/api/log`, { method: 'GET' });
    expect(res.status).toBe(405);
  });
});

// ─── E2E: safeStringify edge cases ─────────────────────────

describe('safeStringify', () => {
  it('10. handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = safeStringify([obj]);
    expect(result).toContain('[Circular]');
    expect(result).toContain('a: 1');
  });

  it('11. serializes BigInt values (Telegram IDs)', () => {
    const result = safeStringify([BigInt('1234567890123456789')]);
    expect(result).toBe('1234567890123456789n');
  });

  it('12. preserves Error stack traces', () => {
    const err = new Error('something broke');
    const result = safeStringify([err]);
    expect(result).toContain('something broke');
    expect(result).toContain('logger.e2e.test.ts'); // stack points here
  });

  it('13. truncates messages beyond 4KB', () => {
    const huge = 'x'.repeat(5000);
    const result = safeStringify([huge]);
    expect(result.length).toBeLessThanOrEqual(4096 + 3); // +3 for "..."
    expect(result).toMatch(/\.\.\.$/);
  });
});

// ─── E2E: createLogger transport behavior ───────────────────

describe('createLogger', () => {
  it('14. swallows transport errors without crashing', () => {
    const log = createLogger({
      source: 'web',
      transports: [
        () => {
          throw new Error('transport exploded');
        },
      ],
    });
    // Should not throw
    expect(() => log.info('test')).not.toThrow();
    expect(() => log.error('test')).not.toThrow();
  });

  it('15. delivers entry to all transports', () => {
    const received: string[] = [];
    const log = createLogger({
      source: 'bun',
      transports: [
        (entry) => received.push(`t1:${entry.message}`),
        (entry) => received.push(`t2:${entry.message}`),
      ],
    });
    log.info('hello');
    expect(received).toEqual(['t1:hello', 't2:hello']);
  });
});
