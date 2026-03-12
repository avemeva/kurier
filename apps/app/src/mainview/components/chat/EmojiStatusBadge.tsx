import { useEffect } from 'react';
import { PureEmojiStatusIcon } from '@/components/ui/chat/EmojiStatusIcon';
import { useChatStore } from '@/lib/store';

export function EmojiStatusBadge({ documentId }: { documentId: string }) {
  const info = useChatStore((s) => s.customEmojiUrls[documentId] ?? null);
  const loadCustomEmojiUrl = useChatStore((s) => s.loadCustomEmojiUrl);

  useEffect(() => {
    loadCustomEmojiUrl(documentId);
  }, [documentId, loadCustomEmojiUrl]);

  return <PureEmojiStatusIcon url={info?.url ?? null} />;
}
