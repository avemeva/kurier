import { useCallback, useEffect, useState } from 'react';
import { PureVoiceView } from '@/components/ui/chat/VoiceView';
import { clearMediaCache, downloadMedia } from '@/lib/telegram';

export function MessageVoice({ chatId, messageId }: { chatId: number; messageId: number }) {
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
    <PureVoiceView
      url={url}
      loading={loading}
      onRetry={!loading && !url ? handleRetry : undefined}
    />
  );
}
