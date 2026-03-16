import { useEffect } from 'react';
import { useChatStore } from '../store/store';
import type { ChatState } from '../store/types';
import type { TGMessage } from '../types';

// ---------------------------------------------------------------------------
// loadMessageMedia — triggers side-effect fetches for a single message
// ---------------------------------------------------------------------------

export function loadMessageMedia(msg: TGMessage, store: ChatState): void {
  if (msg.kind === 'pending') return;

  if (msg.kind === 'service') {
    // Sender photo
    if (msg.sender.photoUrl === undefined && msg.sender.userId > 0) {
      store.loadProfilePhoto(msg.sender.userId);
    }
    // Pinned preview
    if (msg.action.type === 'pin') {
      const key = `${msg.chatId}_${msg.action.messageId}`;
      if (store.pinnedPreviews[key] === undefined) {
        store.resolvePinnedPreview(msg.chatId, msg.action.messageId);
      }
    }
    return;
  }

  // kind === 'message'
  const chatId = msg.chatId;
  const msgId = msg.id;

  // Sender photo (for group chats)
  if (msg.sender.photoUrl === undefined && msg.sender.userId > 0) {
    store.loadProfilePhoto(msg.sender.userId);
  }

  // Forward photo
  if (msg.forward && msg.forward.photoUrl === undefined && msg.forward.photoId > 0) {
    store.loadProfilePhoto(msg.forward.photoId);
  }

  // Reply thumb + preview
  if (msg.replyTo) {
    if (msg.replyTo.thumbUrl === undefined) {
      store.loadReplyThumb(chatId, msg.replyTo.messageId);
    }
    if (msg.replyTo.senderName === undefined) {
      store.resolveReplyPreview(chatId, msg.replyTo.messageId);
    }
  }

  // Content media
  const content = msg.content;
  switch (content.kind) {
    case 'photo':
    case 'video':
    case 'animation':
    case 'videoNote':
      if (content.media.url === undefined) {
        store.loadMedia(chatId, msgId);
      }
      break;
    case 'sticker':
      if (content.url === undefined) {
        store.loadMedia(chatId, msgId);
      }
      break;
    case 'voice':
      if (content.url === undefined) {
        store.loadMedia(chatId, msgId);
      }
      break;
    case 'document':
      if (content.url === undefined) {
        store.loadMedia(chatId, msgId);
      }
      break;
    case 'album':
      for (const item of content.items) {
        if (item.url === undefined) {
          store.loadMedia(chatId, item.messageId);
        }
      }
      break;
    case 'text':
      if (content.webPreview && content.webPreview.thumbUrl === undefined) {
        store.loadReplyThumb(chatId, msgId);
      }
      break;
  }

  // Custom emoji
  const entitiesToCheck =
    content.kind === 'text'
      ? content.entities
      : 'caption' in content && content.caption
        ? content.caption.entities
        : [];
  for (const entity of entitiesToCheck) {
    if (entity.type === 'customEmoji' && entity.customEmojiId) {
      const emojiUrls =
        content.kind === 'text'
          ? content.customEmojiUrls
          : 'caption' in content && content.caption
            ? content.caption.customEmojiUrls
            : {};
      if (emojiUrls[entity.customEmojiId] === undefined) {
        store.loadCustomEmojiUrl(entity.customEmojiId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// useChatMessageLoader — triggers media loads for visible messages
// ---------------------------------------------------------------------------

export function useChatMessageLoader(messages: TGMessage[], visibleIds: Set<number>): void {
  useEffect(() => {
    const store = useChatStore.getState();
    for (const msg of messages) {
      if (msg.kind === 'pending') continue;
      if (visibleIds.has(msg.id)) {
        loadMessageMedia(msg, store);
      }
    }
  }, [messages, visibleIds]);
}
