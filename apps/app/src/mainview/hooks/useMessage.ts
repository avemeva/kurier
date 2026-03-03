import type { InfoDisplayType } from '@/components/ui/chat/MessageTime';
import type { UIMessage, UIMessageItem } from '@/lib/types';
import { type MediaState, useMedia } from './useMedia';

// --- Input types ---

export type MessageInput =
  | { kind: 'single'; message: UIMessageItem }
  | { kind: 'album'; messages: UIMessage[] };

// --- Context from parent ---

export type MessageContext = {
  showSender: boolean;
  senderPhotoUrl?: string;
};

// --- Render state ---

export type ServiceRenderState = {
  layout: 'service';
  text: string;
};

export type PendingRenderState = {
  layout: 'pending';
  localId: string;
  text: string;
  date: number;
  status: 'sending' | 'failed';
};

export type StickerRenderState = {
  layout: 'sticker';
  msg: UIMessage;
  media: MediaState;
  showAvatar: boolean;
  senderPhotoUrl?: string;
};

export type BubbleRenderState = {
  layout: 'bubble';
  msg: UIMessage;
  media: MediaState | null;
  displayType: InfoDisplayType;
  isMediaOnly: boolean;
  showAvatar: boolean;
  showSenderName: boolean;
  senderPhotoUrl?: string;
};

export type AlbumRenderState = {
  layout: 'album';
  messages: UIMessage[];
  first: UIMessage;
  showAvatar: boolean;
  showSenderName: boolean;
  senderPhotoUrl?: string;
};

export type MessageRenderState =
  | ServiceRenderState
  | PendingRenderState
  | StickerRenderState
  | BubbleRenderState
  | AlbumRenderState;

// --- Display type logic ---

function getDisplayType(msg: UIMessage): InfoDisplayType {
  const ck = msg.contentKind;
  if (ck === 'sticker') return 'background';
  if (ck === 'photo' || ck === 'video' || ck === 'videoNote' || ck === 'animation') {
    if (msg.text) return 'default';
    return 'image';
  }
  return 'default';
}

function hasMediaContent(msg: UIMessage): boolean {
  const ck = msg.contentKind;
  return (
    ck === 'photo' ||
    ck === 'video' ||
    ck === 'videoNote' ||
    ck === 'animation' ||
    ck === 'sticker' ||
    ck === 'voice'
  );
}

// --- Hook ---

const EMPTY_MEDIA: MediaState = { url: null, loading: false, retry: undefined };

export function useMessage(input: MessageInput, ctx: MessageContext): MessageRenderState {
  // For albums, no per-message media needed at this level (AlbumGrid handles it)
  // For single messages, we may need media
  const singleMsg =
    input.kind === 'single' && !('isPending' in input.message)
      ? (input.message as UIMessage)
      : null;

  const needsMedia = singleMsg ? hasMediaContent(singleMsg) : false;
  const media = useMedia(
    needsMedia && singleMsg ? singleMsg.chatId : 0,
    needsMedia && singleMsg ? singleMsg.id : 0,
  );
  const resolvedMedia = needsMedia ? media : EMPTY_MEDIA;

  // --- Album ---
  if (input.kind === 'album') {
    const first = input.messages[0];
    const showAvatar = ctx.showSender && !first.isOutgoing;
    return {
      layout: 'album',
      messages: input.messages,
      first,
      showAvatar,
      showSenderName: ctx.showSender && !first.isOutgoing,
      senderPhotoUrl: ctx.senderPhotoUrl,
    };
  }

  // --- Single message ---
  const msg = input.message;

  // Pending
  if ('isPending' in msg) {
    return {
      layout: 'pending',
      localId: msg.localId,
      text: msg.text,
      date: msg.date,
      status: msg.status,
    };
  }

  // Service
  if (msg.serviceText) {
    return {
      layout: 'service',
      text: msg.serviceText,
    };
  }

  // Sticker
  if (msg.contentKind === 'sticker') {
    return {
      layout: 'sticker',
      msg,
      media: resolvedMedia,
      showAvatar: ctx.showSender && !msg.isOutgoing,
      senderPhotoUrl: ctx.senderPhotoUrl,
    };
  }

  // Regular bubble
  const isPhoto = msg.contentKind === 'photo';
  const isVideo =
    msg.contentKind === 'video' ||
    msg.contentKind === 'videoNote' ||
    msg.contentKind === 'animation';
  const isMediaOnly = (isPhoto || isVideo) && !msg.text;

  return {
    layout: 'bubble',
    msg,
    media: needsMedia ? resolvedMedia : null,
    displayType: getDisplayType(msg),
    isMediaOnly,
    showAvatar: ctx.showSender && !msg.isOutgoing,
    showSenderName: ctx.showSender && !msg.isOutgoing,
    senderPhotoUrl: ctx.senderPhotoUrl,
  };
}
