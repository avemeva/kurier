import { useEffect } from 'react';
import { PureEmojiStatusIcon } from '@/components/ui/chat/EmojiStatusIcon';
import { useChatStore } from '@/data';

/**
 * Lazy-loads a single custom emoji by documentId.
 * Intentionally reads `s.customEmojiUrls[documentId]` directly — this is a leaf
 * component analogous to <img> with lazy loading. Wrapping in a selector would
 * mean the selector returns all emoji statuses for all visible chats, which is
 * wasteful. The component IS the loader.
 */
export function EmojiStatusBadge({ documentId }: { documentId: string }) {
  const info = useChatStore((s) => s.customEmojiUrls[documentId] ?? null);
  const loadCustomEmojiUrl = useChatStore((s) => s.loadCustomEmojiUrl);

  useEffect(() => {
    loadCustomEmojiUrl(documentId);
  }, [documentId, loadCustomEmojiUrl]);

  return <PureEmojiStatusIcon url={info?.url ?? null} />;
}
