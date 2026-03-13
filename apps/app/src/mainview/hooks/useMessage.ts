import type { InfoDisplayType } from '@/components/ui/chat/MessageTime';
import type { UIContent, UIMessage, UIMessageBase } from '@/data';
import { computeMediaSize, MAX_MEDIA_SIZE, MIN_MEDIA_SIZE } from '../lib/media-sizing';

export type MediaState = {
  url: string | null;
  loading: boolean;
  retry: (() => void) | undefined;
};

// --- Context from parent ---

export type MessageContext = {
  showSender: boolean;
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
  msg: UIMessageBase & { kind: 'message' };
  stickerUrl: string | undefined;
  stickerFormat: 'webp' | 'tgs' | 'webm';
  stickerEmoji: string;
  displayWidth: number;
  displayHeight: number;
  showAvatar: boolean;
};

export type BubbleRenderState = {
  layout: 'bubble';
  msg: UIMessageBase & { kind: 'message' };
  displayType: InfoDisplayType;
  showAvatar: boolean;
  showSenderName: boolean;
  onTranscribe?: (chatId: number, msgId: number) => void;
};

export type MediaRenderState = {
  layout: 'media';
  msg: UIMessageBase & { kind: 'message' };
  bubbleVariant: 'media' | 'framed';
  displayWidth: number;
  displayHeight: number;
  showAvatar: boolean;
  showSenderName: boolean;
  displayType: InfoDisplayType;
  isMediaOnly: boolean;
};

export type AlbumRenderState = {
  layout: 'album';
  msg: UIMessageBase & { kind: 'message' };
  bubbleVariant: 'media' | 'framed';
  showAvatar: boolean;
  showSenderName: boolean;
};

export type MessageRenderState =
  | ServiceRenderState
  | PendingRenderState
  | StickerRenderState
  | MediaRenderState
  | BubbleRenderState
  | AlbumRenderState;

// --- Display type logic ---

function getDisplayType(content: UIContent, hasText: boolean): InfoDisplayType {
  if (content.kind === 'sticker') return 'background';
  if (
    content.kind === 'photo' ||
    content.kind === 'video' ||
    content.kind === 'videoNote' ||
    content.kind === 'animation'
  ) {
    if (hasText) return 'default';
    return 'image';
  }
  return 'default';
}

function getContentText(content: UIContent): string {
  switch (content.kind) {
    case 'text':
      return content.text;
    case 'photo':
    case 'video':
    case 'animation':
    case 'album':
      return content.caption?.text ?? '';
    default:
      return '';
  }
}

// --- computeMessageState ---

export function computeMessageState(
  msg: UIMessage,
  ctx: MessageContext,
  onTranscribe?: (chatId: number, msgId: number) => void,
): MessageRenderState {
  // Pending
  if (msg.kind === 'pending') {
    return {
      layout: 'pending',
      localId: msg.localId,
      text: msg.text,
      date: msg.date,
      status: msg.status,
    };
  }

  // Service
  if (msg.kind === 'service') {
    return {
      layout: 'service',
      text: msg.text,
      pinnedMessageId: msg.pinnedMessageId,
    };
  }

  // Regular message (kind === 'message')
  const content = msg.content;
  const text = getContentText(content);

  // Sticker
  if (content.kind === 'sticker') {
    const STICKER_MAX_SIZE = 224;
    let stickerW: number;
    let stickerH: number;
    if (content.width > 0 && content.height > 0) {
      const sized = computeMediaSize(
        content.width,
        content.height,
        STICKER_MAX_SIZE,
        MIN_MEDIA_SIZE,
      );
      stickerW = sized.width;
      stickerH = sized.height;
    } else {
      stickerW = STICKER_MAX_SIZE;
      stickerH = STICKER_MAX_SIZE;
    }
    return {
      layout: 'sticker',
      msg,
      stickerUrl: content.url,
      stickerFormat: content.format,
      stickerEmoji: content.emoji,
      displayWidth: stickerW,
      displayHeight: stickerH,
      showAvatar: ctx.showSender && !msg.isOutgoing,
    };
  }

  // Album
  if (content.kind === 'album') {
    const showAvatar = ctx.showSender && !msg.isOutgoing;
    const showSenderName = ctx.showSender && !msg.isOutgoing;
    const needsBubble = !!text || !!msg.replyTo || !!msg.forward || showSenderName;
    return {
      layout: 'album',
      msg,
      bubbleVariant: needsBubble ? 'framed' : 'media',
      showAvatar,
      showSenderName,
    };
  }

  // Media layout (photos, videos, animations — NOT videoNote which goes to bubble)
  if (content.kind === 'photo' || content.kind === 'video' || content.kind === 'animation') {
    const showAvatar = ctx.showSender && !msg.isOutgoing;
    const showSenderName = ctx.showSender && !msg.isOutgoing;
    const needsBubble = !!text || !!msg.replyTo || !!msg.forward || showSenderName;
    const bubbleVariant = needsBubble ? 'framed' : 'media';

    let displayWidth: number;
    let displayHeight: number;
    if (content.media.width > 0 && content.media.height > 0) {
      const sized = computeMediaSize(
        content.media.width,
        content.media.height,
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
      bubbleVariant,
      displayWidth,
      displayHeight,
      showAvatar,
      showSenderName,
      displayType: text ? 'default' : 'image',
      isMediaOnly: !text,
    };
  }

  // Regular bubble (text, voice, videoNote, document, unsupported)
  return {
    layout: 'bubble',
    msg,
    displayType: getDisplayType(content, !!text),
    showAvatar: ctx.showSender && !msg.isOutgoing,
    showSenderName: ctx.showSender && !msg.isOutgoing,
    onTranscribe,
  };
}
