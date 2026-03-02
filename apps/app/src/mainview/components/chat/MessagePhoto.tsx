import { useCallback, useEffect, useState } from 'react';
import { PurePhotoView } from '@/components/ui/chat/PhotoView';
import { clearMediaCache, downloadMedia } from '@/lib/telegram';

export function MessagePhoto({
  chatId,
  messageId,
  cover,
}: {
  chatId: number;
  messageId: number;
  cover?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on retry attempt
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    downloadMedia(chatId, messageId).then((u) => {
      if (!cancelled) {
        setUrl(u);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const handleRetry = useCallback(() => {
    clearMediaCache(messageId);
    setAttempt((n) => n + 1);
  }, [messageId]);

  return (
    <PurePhotoView
      url={url}
      loading={loading}
      cover={cover}
      onRetry={!loading && !url ? handleRetry : undefined}
    />
  );
}
