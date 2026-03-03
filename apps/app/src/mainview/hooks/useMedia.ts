import { useCallback, useEffect } from 'react';
import { useChatStore } from '@/lib/store';

export type MediaState = {
  url: string | null;
  loading: boolean;
  retry: (() => void) | undefined;
};

export function useMedia(chatId: number, messageId: number): MediaState {
  const key = `${chatId}_${messageId}`;
  const entry = useChatStore((s) => s.mediaUrls[key]);
  const loadMedia = useChatStore((s) => s.loadMedia);
  const clearMediaUrl = useChatStore((s) => s.clearMediaUrl);

  useEffect(() => {
    if (entry === undefined) {
      loadMedia(chatId, messageId);
    }
  }, [entry, chatId, messageId, loadMedia]);

  const retry = useCallback(() => {
    clearMediaUrl(chatId, messageId);
  }, [chatId, messageId, clearMediaUrl]);

  // undefined = not requested yet (loading), null = failed/no media, string = ready
  if (entry === undefined) {
    return { url: null, loading: true, retry: undefined };
  }
  if (entry === null) {
    return { url: null, loading: false, retry };
  }
  return { url: entry, loading: false, retry: undefined };
}
