/**
 * Centralized timer lifecycle management.
 *
 * Typing indicators and online-status expiry use setTimeout.
 * This registry owns all timers so they can be fully cleared on reset.
 */

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Set a named timer. Automatically clears any existing timer with the same key. */
export function set(key: string, ms: number, callback: () => void): void {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  const id = setTimeout(() => {
    timers.delete(key);
    callback();
  }, ms);
  timers.set(key, id);
}

/** Clear a named timer if it exists. */
export function clear(key: string): void {
  const id = timers.get(key);
  if (id) {
    clearTimeout(id);
    timers.delete(key);
  }
}

/** Clear all timers. Called by _resetForTests. */
export function resetAll(): void {
  for (const id of timers.values()) clearTimeout(id);
  timers.clear();
}
