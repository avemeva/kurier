/** Session storage — always backed by a single file on disk.
 *
 * Under Electrobun the webview talks to the Bun process via RPC.
 * Under plain Vite dev the same file is served by the Vite middleware
 * at /api/session (see sessionPlugin in vite.config.ts).
 */

interface SessionRPC {
  request: {
    'session:read': () => Promise<string>;
    'session:write': (params: { data: string }) => Promise<void>;
    'session:delete': () => Promise<void>;
  };
}

let rpc: SessionRPC | null = null;

export function setSessionRPC(r: SessionRPC) {
  rpc = r;
}

export async function readSession(): Promise<string> {
  const { telegramLog } = await import('./log');
  try {
    let data: string;
    if (rpc) {
      data = await rpc.request['session:read']();
    } else {
      const res = await fetch('/api/session');
      data = await res.text();
    }
    telegramLog.info(
      `readSession: ${data ? `${data.length} chars` : 'empty'} (via ${rpc ? 'rpc' : 'fetch'})`,
    );
    return data;
  } catch (err) {
    telegramLog.error('readSession: FAILED', err);
    throw err;
  }
}

export async function writeSession(data: string): Promise<void> {
  const { telegramLog } = await import('./log');
  telegramLog.info(`writeSession: ${data.length} chars (via ${rpc ? 'rpc' : 'fetch'})`);
  try {
    if (rpc) {
      await rpc.request['session:write']({ data });
      return;
    }
    await fetch('/api/session', { method: 'PUT', body: data });
  } catch (err) {
    telegramLog.error('writeSession: FAILED', err);
    throw err;
  }
}

export async function clearSession(): Promise<void> {
  const { telegramLog } = await import('./log');
  telegramLog.warn('clearSession: deleting session');
  try {
    if (rpc) {
      await rpc.request['session:delete']();
      return;
    }
    await fetch('/api/session', { method: 'DELETE' });
  } catch (err) {
    telegramLog.error('clearSession: FAILED', err);
    throw err;
  }
}
