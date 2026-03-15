// Rendering logic for messages — pure functions, no store dependency.
// Computes EVERYTHING the renderer needs: layout, typed content, extracted text,
// display dimensions. Layouts receive fully resolved state — no casts needed.

import type {
  TGAlbumItem,
  TGAnimationContent,
  TGCaption,
  TGMedia,
  TGMessage,
  TGMessageBase,
  TGPhotoContent,
  TGServiceAction,
  TGTextEntity,
  TGVideoContent,
  TGVideoNoteContent,
  TGVoiceContent,
  TGWebPreview,
} from '@/data';
import type { CustomEmojiInfo } from '@/data/telegram';
import { computeMediaSize, MAX_MEDIA_SIZE, MIN_MEDIA_SIZE } from '@/lib/media-sizing';

// ─── Shared types ────────────────────────────────────────

export type InfoDisplayType = 'default' | 'image' | 'background';

export type MessageContext = {
  showSender: boolean;
};

// ─── Extracted text fields (shared shape) ────────────────

type ExtractedText = {
  text: string;
  entities: TGTextEntity[];
  customEmojiUrls: Record<string, CustomEmojiInfo | null>;
};

// ─── Render states ───────────────────────────────────────

export type ServiceRenderState = {
  layout: 'service';
  senderName: string;
  action: TGServiceAction;
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
  msg: TGMessageBase & { kind: 'message' };
  url: string | undefined;
  format: 'webp' | 'tgs' | 'webm';
  emoji: string;
  showAvatar: boolean;
};

export type MediaRenderState = {
  layout: 'media';
  msg: TGMessageBase & { kind: 'message' };
  bubbleVariant: 'media' | 'framed';
  showAvatar: boolean;
  showSenderName: boolean;
  isMediaOnly: boolean;
  // Pre-narrowed content
  contentKind: 'photo' | 'video' | 'animation' | 'videoNote';
  media: TGMedia;
  displayWidth: number;
  displayHeight: number;
  // Caption (null for videoNote)
  caption: ExtractedText | null;
  // Video note specific
  videoNote: {
    duration: number;
    speechStatus: TGVideoNoteContent['speechStatus'];
    speechText: string;
  } | null;
};

export type AlbumRenderState = {
  layout: 'album';
  msg: TGMessageBase & { kind: 'message' };
  bubbleVariant: 'media' | 'framed';
  showAvatar: boolean;
  showSenderName: boolean;
  items: TGAlbumItem[];
  caption: ExtractedText | null;
};

export type BubbleRenderState = {
  layout: 'bubble';
  msg: TGMessageBase & { kind: 'message' };
  displayType: InfoDisplayType;
  showAvatar: boolean;
  showSenderName: boolean;
  onTranscribe?: (chatId: number, msgId: number) => void;
  // Pre-narrowed content — exactly one of these is non-null
  textContent: (ExtractedText & { webPreview: TGWebPreview | null }) | null;
  voiceContent: TGVoiceContent | null;
  documentLabel: string;
};

export type MessageRenderState =
  | ServiceRenderState
  | PendingRenderState
  | StickerRenderState
  | MediaRenderState
  | BubbleRenderState
  | AlbumRenderState;

// ─── Helpers ─────────────────────────────────────────────

function extractCaption(caption: TGCaption | null): ExtractedText | null {
  if (!caption || !caption.text) return null;
  return {
    text: caption.text,
    entities: caption.entities,
    customEmojiUrls: caption.customEmojiUrls,
  };
}

function computeDisplaySize(media: TGMedia): { width: number; height: number } {
  if (media.width > 0 && media.height > 0) {
    return computeMediaSize(media.width, media.height, MAX_MEDIA_SIZE, MIN_MEDIA_SIZE);
  }
  return { width: MAX_MEDIA_SIZE, height: Math.round((MAX_MEDIA_SIZE * 9) / 16) };
}

// ─── computeMessageState ─────────────────────────────────

export function computeMessageState(
  msg: TGMessage,
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
      senderName: msg.sender.name,
      action: msg.action,
    };
  }

  const content = msg.content;
  const showAvatar = ctx.showSender && !msg.isOutgoing;
  const showSenderName = ctx.showSender && !msg.isOutgoing;

  // Sticker
  if (content.kind === 'sticker') {
    return {
      layout: 'sticker',
      msg,
      url: content.url,
      format: content.format,
      emoji: content.emoji,
      showAvatar,
    };
  }

  // Album
  if (content.kind === 'album') {
    const caption = extractCaption(content.caption);
    const needsBubble = !!caption || !!msg.replyTo || !!msg.forward || showSenderName;
    return {
      layout: 'album',
      msg,
      bubbleVariant: needsBubble ? 'framed' : 'media',
      showAvatar,
      showSenderName,
      items: content.items,
      caption,
    };
  }

  // Media (photo, video, animation, videoNote)
  if (
    content.kind === 'photo' ||
    content.kind === 'video' ||
    content.kind === 'animation' ||
    content.kind === 'videoNote'
  ) {
    const isVideoNote = content.kind === 'videoNote';
    const caption = isVideoNote
      ? null
      : extractCaption((content as TGPhotoContent | TGVideoContent | TGAnimationContent).caption);
    const needsBubble = !!caption || !!msg.replyTo || !!msg.forward || showSenderName;
    const { width: displayWidth, height: displayHeight } = computeDisplaySize(content.media);

    return {
      layout: 'media',
      msg,
      bubbleVariant: needsBubble ? 'framed' : 'media',
      showAvatar,
      showSenderName,
      isMediaOnly: !caption,
      contentKind: content.kind,
      media: content.media,
      displayWidth,
      displayHeight,
      caption,
      videoNote: isVideoNote
        ? {
            duration: content.duration,
            speechStatus: content.speechStatus,
            speechText: content.speechText,
          }
        : null,
    };
  }

  // Bubble (text, voice, document, unsupported)
  const textContent =
    content.kind === 'text'
      ? {
          text: content.text,
          entities: content.entities,
          customEmojiUrls: content.customEmojiUrls,
          webPreview: content.webPreview,
        }
      : null;

  const voiceContent = content.kind === 'voice' ? content : null;

  const documentLabel =
    content.kind === 'document'
      ? content.label
      : content.kind === 'unsupported'
        ? content.label
        : '';

  return {
    layout: 'bubble',
    msg,
    displayType: 'default' as InfoDisplayType,
    showAvatar,
    showSenderName,
    onTranscribe,
    textContent,
    voiceContent,
    documentLabel,
  };
}
