import { useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import type { UIReplyPreview } from '@/lib/types';

/**
 * Load and return a thumbnail URL for a reply target message.
 * Returns null while loading or if no thumbnail available.
 */
export function useReplyThumb(chatId: number, messageId: number): string | null {
  const key = messageId > 0 ? `${chatId}_${messageId}` : '';
  const url = useChatStore((s) => (key ? s.thumbUrls[key] : undefined));
  const loadReplyThumb = useChatStore((s) => s.loadReplyThumb);

  useEffect(() => {
    if (messageId > 0 && chatId !== 0) {
      loadReplyThumb(chatId, messageId);
    }
  }, [chatId, messageId, loadReplyThumb]);

  return url ?? null;
}

/**
 * Resolve a reply preview for a message not in the current batch.
 * Returns the cached preview, or triggers a fetch from TDLib.
 */
export function useRemoteReplyPreview(chatId: number, messageId: number): UIReplyPreview | null {
  const key = messageId > 0 ? `${chatId}_${messageId}` : '';
  const preview = useChatStore((s) => (key ? s.replyPreviews[key] : undefined));
  const resolve = useChatStore((s) => s.resolveReplyPreview);

  useEffect(() => {
    if (messageId > 0 && chatId !== 0) {
      resolve(chatId, messageId);
    }
  }, [chatId, messageId, resolve]);

  return preview ?? null;
}
