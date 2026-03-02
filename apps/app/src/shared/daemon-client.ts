/**
 * DaemonClient — browser-side client for communicating with the tg daemon
 * via the Vite middleware proxy (/api/tg/command, /api/tg/events).
 *
 * Works in both Vite dev (fetch) and Electrobun (RPC).
 */

// HTTP envelope (app-specific, not Telegram)
export type DaemonResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  hasMore?: boolean;
  nextOffset?: number | string;
  exitCode?: number;
};

export type DaemonEventListener = (event: Record<string, unknown>) => void;

export class DaemonClient {
  private eventSource: EventSource | null = null;
  private eventListeners = new Set<DaemonEventListener>();

  /** Send a command to the daemon and wait for the response. */
  async request(
    command: string,
    args: string[] = [],
    flags: Record<string, string> = {},
  ): Promise<DaemonResponse> {
    const res = await fetch('/api/tg/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, args, flags }),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}: ${res.statusText}`,
        code: 'UNKNOWN',
      };
    }

    return res.json();
  }

  /** Start streaming real-time events from the daemon via SSE. */
  startStreaming(type = 'user'): void {
    if (this.eventSource) return;

    this.eventSource = new EventSource(`/api/tg/events?type=${encodeURIComponent(type)}`);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        for (const listener of this.eventListeners) {
          try {
            listener(data);
          } catch {
            // Listener errors don't break the stream
          }
        }
      } catch {
        // Malformed JSON — skip
      }
    };

    this.eventSource.onerror = () => {
      // SSE auto-reconnects. If we need custom handling, add it here.
    };
  }

  /** Stop the SSE event stream. */
  stopStreaming(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /** Register a listener for real-time events. Returns an unsubscribe function. */
  onEvent(listener: DaemonEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Check if streaming is active. */
  get isStreaming(): boolean {
    return this.eventSource !== null;
  }
}

/** Singleton instance for the UI to use. */
export const daemonClient = new DaemonClient();
