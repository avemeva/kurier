/**
 * Centralized deduplication for async resource requests.
 *
 * Every fetch-once resource (photos, thumbnails, media, reply previews, etc.)
 * registers here before firing. Consolidates the 8 scattered Sets from store v1
 * into a single resettable object.
 */

type Category =
  | 'photo'
  | 'media'
  | 'file'
  | 'thumb'
  | 'customEmoji'
  | 'replyPreview'
  | 'pinnedPreview'
  | 'user';

const sets: Record<Category, Set<string | number>> = {
  photo: new Set(),
  media: new Set(),
  file: new Set(),
  thumb: new Set(),
  customEmoji: new Set(),
  replyPreview: new Set(),
  pinnedPreview: new Set(),
  user: new Set(),
};

/** Returns true if this is a new request (not yet tracked). Adds it if so. */
export function track(category: Category, key: string | number): boolean {
  const set = sets[category];
  if (set.has(key)) return false;
  set.add(key);
  return true;
}

/** Remove a single tracked key (e.g. on cache invalidation). */
export function untrack(category: Category, key: string | number): void {
  sets[category].delete(key);
}

/** Clear all tracking state. Called by _resetForTests. */
export function resetAll(): void {
  for (const set of Object.values(sets)) set.clear();
}
