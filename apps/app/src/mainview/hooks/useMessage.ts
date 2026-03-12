import type { InfoDisplayType } from '@/components/ui/chat/MessageTime';
import type { UIMessage, UIMessageItem } from '@/lib/types';
import { computeMediaSize, MAX_MEDIA_SIZE, MIN_MEDIA_SIZE } from '../lib/media-sizing';
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
  pinnedMessageId: number;
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
  bubbleVariant: 'media' | 'framed';
  showAvatar: boolean;
  showSenderName: boolean;
  senderPhotoUrl?: string;
};

export type MediaRenderState = {
  layout: 'media';
  msg: UIMessage;
  media: MediaState;
  bubbleVariant: 'media' | 'framed';
  displayWidth: number;
  displayHeight: number;
  minithumbnail: string | null;
  showAvatar: boolean;
  senderName?: string;
  senderPhotoUrl?: string;
  showSenderName: boolean;
  displayType: InfoDisplayType;
  isMediaOnly: boolean;
};

export type MessageRenderState =
  | ServiceRenderState
  | PendingRenderState
  | StickerRenderState
  | MediaRenderState
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
    const showSenderName = ctx.showSender && !first.isOutgoing;
    const needsBubble =
      !!first.text || !!first.replyToMessageId || !!first.forwardFromName || showSenderName;
    return {
      layout: 'album',
      messages: input.messages,
      first,
      bubbleVariant: needsBubble ? 'framed' : 'media',
      showAvatar,
      showSenderName,
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
      pinnedMessageId: msg.servicePinnedMessageId,
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

  // Media layout (photos, videos, animations — NOT videoNote which is circular)
  const ck = msg.contentKind;
  if (ck === 'photo' || ck === 'video' || ck === 'animation') {
    const showAvatar = ctx.showSender && !msg.isOutgoing;
    const showSenderName = ctx.showSender && !msg.isOutgoing;
    const needsBubble =
      !!msg.text || !!msg.replyToMessageId || !!msg.forwardFromName || showSenderName;
    const bubbleVariant = needsBubble ? 'framed' : 'media';

    let displayWidth: number;
    let displayHeight: number;
    if (msg.mediaWidth > 0 && msg.mediaHeight > 0) {
      const sized = computeMediaSize(
        msg.mediaWidth,
        msg.mediaHeight,
        MAX_MEDIA_SIZE,
        MIN_MEDIA_SIZE,
      );
      displayWidth = sized.width;
      displayHeight = sized.height;
    } else {
      displayWidth = MAX_MEDIA_SIZE;
      displayHeight = Math.round((MAX_MEDIA_SIZE * 9) / 16);
    }

    return {
      layout: 'media',
      msg,
      media: resolvedMedia,
      bubbleVariant,
      displayWidth,
      displayHeight,
      minithumbnail: msg.minithumbnail,
      showAvatar,
      senderName: msg.senderName,
      senderPhotoUrl: ctx.senderPhotoUrl,
      showSenderName,
      displayType: msg.text ? 'default' : 'image',
      isMediaOnly: !msg.text,
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
