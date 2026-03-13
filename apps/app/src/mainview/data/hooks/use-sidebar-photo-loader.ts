import { useEffect } from 'react';
import { useChatStore } from '../store/store';
import type { TGChat } from '../types';

/**
 * Triggers profile photo loading for sidebar chats that don't have avatars yet.
 * Uses imperative `getState()` to avoid re-render cycles:
 *   photo loads -> profilePhotos changes -> selectChats recomputes -> useEffect fires
 * The `loadProfilePhoto` action deduplicates internally, so repeated calls are safe.
 */
export function useSidebarPhotoLoader(chats: TGChat[]): void {
  useEffect(() => {
    const { loadProfilePhoto } = useChatStore.getState();
    for (const chat of chats) {
      if (chat.avatarUrl === undefined) {
        loadProfilePhoto(chat.id);
      }
    }
  }, [chats]);
}
