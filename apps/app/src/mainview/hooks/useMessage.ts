import type { InfoDisplayType } from '@/components/ui/chat/MessageTime';
import type { UIMessage, UIMessageItem } from '@/lib/types';
import { computeMediaSize, MAX_MEDIA_SIZE, MIN_MEDIA_SIZE } from '../lib/media-sizing';

export type MediaState = {
  url: string | null;
  loading: boolean;
  retry: (() => void) | undefined;
};

// --- Input types ---

export type MessageInput =
  | { kind: 'single'; message: UIMessageItem }
  | { kind: 'album'; messages: UIMessage[] };

// --- Context from parent ---

export type MessageContext = {
  showSender: boolean;
  senderPhotoUrl?: string;
};

// --- Resolved props (passed from ChatView / store boundary) ---

export type ResolvedProps = {
  mediaUrl?: string | null;
  mediaLoading?: boolean;
  replyThumbUrl?: string | null;
  forwardPhotoUrl?: string | null;
  linkPreviewThumbUrl?: string | null;
  onTranscribe?: (chatId: number, msgId: number) => void;
  albumMedia?: Array<{ url: string | null; loading: boolean }>;
  customEmojiUrls?: Record<string, { url: string; format: 'webp' | 'tgs' | 'webm' } | null>;
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
  displayWidth: number;
  displayHeight: number;
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
  displayWidth?: number;
  displayHeight?: number;
  minithumbnail?: string | null;
  forwardPhotoUrl?: string;
  replyThumbUrl?: string | null;
  linkPreviewThumbUrl?: string | null;
  onTranscribe?: (chatId: number, msgId: number) => void;
  customEmojiUrls?: Record<string, { url: string; format: 'webp' | 'tgs' | 'webm' } | null>;
};

export type AlbumRenderState = {
  layout: 'album';
  messages: UIMessage[];
  first: UIMessage;
  bubbleVariant: 'media' | 'framed';
  showAvatar: boolean;
  showSenderName: boolean;
  senderPhotoUrl?: string;
  forwardPhotoUrl?: string;
  albumMedia?: Array<{ url: string | null; loading: boolean }>;
  customEmojiUrls?: Record<string, { url: string; format: 'webp' | 'tgs' | 'webm' } | null>;
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
  forwardPhotoUrl?: string;
  customEmojiUrls?: Record<string, { url: string; format: 'webp' | 'tgs' | 'webm' } | null>;
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

export function computeMessageState(
  input: MessageInput,
  ctx: MessageContext,
  resolved: ResolvedProps,
): MessageRenderState {
  // Construct MediaState from resolved props
  const resolvedMedia: MediaState =
    resolved.mediaUrl !== undefined
      ? { url: resolved.mediaUrl, loading: resolved.mediaLoading ?? false, retry: undefined }
      : EMPTY_MEDIA;

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
      forwardPhotoUrl: resolved.forwardPhotoUrl ?? undefined,
      albumMedia: resolved.albumMedia,
      customEmojiUrls: resolved.customEmojiUrls,
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
    const STICKER_MAX_SIZE = 224;
    let stickerW: number;
    let stickerH: number;
    if (msg.mediaWidth > 0 && msg.mediaHeight > 0) {
      const sized = computeMediaSize(
        msg.mediaWidth,
        msg.mediaHeight,
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
      media: resolvedMedia,
      displayWidth: stickerW,
      displayHeight: stickerH,
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
      forwardPhotoUrl: resolved.forwardPhotoUrl ?? undefined,
      customEmojiUrls: resolved.customEmojiUrls,
    };
  }

  // Regular bubble
  const isPhoto = msg.contentKind === 'photo';
  const isVideo =
    msg.contentKind === 'video' ||
    msg.contentKind === 'videoNote' ||
    msg.contentKind === 'animation';
  const isMediaOnly = (isPhoto || isVideo) && !msg.text;

  // Compute dimensions for photos/videos in bubble layout (defensive — prevents layout shift)
  let bubbleDisplayWidth: number | undefined;
  let bubbleDisplayHeight: number | undefined;
  if ((isPhoto || isVideo) && msg.mediaWidth > 0 && msg.mediaHeight > 0) {
    const sized = computeMediaSize(msg.mediaWidth, msg.mediaHeight, MAX_MEDIA_SIZE, MIN_MEDIA_SIZE);
    bubbleDisplayWidth = sized.width;
    bubbleDisplayHeight = sized.height;
  }

  const needsMedia = hasMediaContent(msg);

  return {
    layout: 'bubble',
    msg,
    media: needsMedia ? resolvedMedia : null,
    displayType: getDisplayType(msg),
    isMediaOnly,
    showAvatar: ctx.showSender && !msg.isOutgoing,
    showSenderName: ctx.showSender && !msg.isOutgoing,
    senderPhotoUrl: ctx.senderPhotoUrl,
    displayWidth: bubbleDisplayWidth,
    displayHeight: bubbleDisplayHeight,
    minithumbnail: isPhoto || isVideo ? msg.minithumbnail : undefined,
    forwardPhotoUrl: resolved.forwardPhotoUrl ?? undefined,
    replyThumbUrl: resolved.replyThumbUrl,
    linkPreviewThumbUrl: resolved.linkPreviewThumbUrl,
    onTranscribe: resolved.onTranscribe,
    customEmojiUrls: resolved.customEmojiUrls,
  };
}
