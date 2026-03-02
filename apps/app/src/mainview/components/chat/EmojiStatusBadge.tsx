import { useEffect, useState } from 'react';
import { PureEmojiStatusIcon } from '@/components/ui/chat/EmojiStatusIcon';
import { getCustomEmojiUrl } from '@/lib/telegram';

export function EmojiStatusBadge({ documentId }: { documentId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomEmojiUrl(documentId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return <PureEmojiStatusIcon url={url} />;
}
