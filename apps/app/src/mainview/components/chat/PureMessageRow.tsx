import { memo } from 'react';
import { PureBotKeyboard } from '@/components/ui/chat/BotKeyboard';
import type { GroupPosition } from '@/components/ui/chat/Bubble';
import { PureBubble } from '@/components/ui/chat/Bubble';
import { PureForwardHeader } from '@/components/ui/chat/ForwardHeader';
import { PureLinkPreviewCard } from '@/components/ui/chat/LinkPreviewCard';
import { PureMessageTime } from '@/components/ui/chat/MessageTime';
import { PurePhotoView } from '@/components/ui/chat/PhotoView';
import { PureReactionBar, PureReactionPicker } from '@/components/ui/chat/ReactionBar';
import { PureReplyHeader } from '@/components/ui/chat/ReplyHeader';
import { PureServiceMessage } from '@/components/ui/chat/ServiceMessage';
import { PureStickerView } from '@/components/ui/chat/StickerView';
import { PureVideoView } from '@/components/ui/chat/VideoView';
import { PureVoiceView } from '@/components/ui/chat/VoiceView';
import type {
  AlbumRenderState,
  BubbleRenderState,
  MediaRenderState,
  MessageContext,
  MessageInput,
  PendingRenderState,
  StickerRenderState,
} from '@/hooks/useMessage';
import { computeMessageState } from '@/hooks/useMessage';
import { MAX_MEDIA_SIZE } from '@/lib/media-sizing';
import type { UIReaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PureAlbumGrid } from './PureAlbumGrid';
import { PureFormattedText } from './PureFormattedText';

export type { GroupPosition } from '@/components/ui/chat/Bubble';

// --- Helpers ---

function toReactionInfos(reactions: UIReaction[]) {
  return reactions.map((r) => ({ emoticon: r.emoji, count: r.count, chosen: r.chosen }));
}

// --- Props ---

export type MessageProps = {
  input: MessageInput;
  showSender: boolean;
  senderPhotoUrl?: string;
  groupPosition?: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
  onReplyClick?: (messageId: number) => void;
  // Resolved media data — passed from ChatView
  mediaUrl?: string | null;
  mediaLoading?: boolean;
  replyThumbUrl?: string | null;
  forwardPhotoUrl?: string | null;
  linkPreviewThumbUrl?: string | null;
  onTranscribe?: (chatId: number, msgId: number) => void;
  albumMedia?: Array<{ url: string | null; loading: boolean }>;
  customEmojiUrls?: Record<string, { url: string; format: 'webp' | 'tgs' | 'webm' } | null>;
};

// --- Main component ---

function PureMessageRowInner({
  input,
  showSender,
  senderPhotoUrl,
  groupPosition = 'single',
  onReact,
  onReplyClick,
  mediaUrl,
  mediaLoading,
  replyThumbUrl,
  forwardPhotoUrl,
  linkPreviewThumbUrl,
  onTranscribe,
  albumMedia,
  customEmojiUrls,
}: MessageProps) {
  const ctx: MessageContext = { showSender, senderPhotoUrl };
  const state = computeMessageState(input, ctx, {
    mediaUrl,
    mediaLoading,
    replyThumbUrl,
    forwardPhotoUrl,
    linkPreviewThumbUrl,
    onTranscribe,
    albumMedia,
    customEmojiUrls,
  });

  switch (state.layout) {
    case 'service':
      return (
        <PureServiceMessage
          text={state.text}
          onClick={state.pinnedMessageId ? () => onReplyClick?.(state.pinnedMessageId) : undefined}
        />
      );
    case 'pending':
      return <PurePendingLayout state={state} groupPosition={groupPosition} />;
    case 'sticker':
      return <PureStickerLayout state={state} onReact={onReact} />;
    case 'media':
      return <PureMediaLayout state={state} groupPosition={groupPosition} onReact={onReact} />;
    case 'bubble':
      return (
        <PureBubbleLayout
          state={state}
          groupPosition={groupPosition}
          onReact={onReact}
          onReplyClick={onReplyClick}
        />
      );
    case 'album':
      return <PureAlbumLayout state={state} groupPosition={groupPosition} onReact={onReact} />;
  }
}

function arePropsEqual(prev: MessageProps, next: MessageProps): boolean {
  if (prev.input !== next.input) return false;
  if (prev.showSender !== next.showSender) return false;
  if (prev.senderPhotoUrl !== next.senderPhotoUrl) return false;
  if (prev.groupPosition !== next.groupPosition) return false;
  if (prev.onReact !== next.onReact) return false;
  if (prev.onReplyClick !== next.onReplyClick) return false;
  if (prev.mediaUrl !== next.mediaUrl) return false;
  if (prev.mediaLoading !== next.mediaLoading) return false;
  if (prev.replyThumbUrl !== next.replyThumbUrl) return false;
  if (prev.forwardPhotoUrl !== next.forwardPhotoUrl) return false;
  if (prev.linkPreviewThumbUrl !== next.linkPreviewThumbUrl) return false;
  if (prev.onTranscribe !== next.onTranscribe) return false;
  if (prev.customEmojiUrls !== next.customEmojiUrls) return false;

  // Element-wise compare albumMedia (new array each render)
  const prevAlbum = prev.albumMedia;
  const nextAlbum = next.albumMedia;
  if (prevAlbum !== nextAlbum) {
    if (!prevAlbum || !nextAlbum) return false;
    if (prevAlbum.length !== nextAlbum.length) return false;
    for (let i = 0; i < prevAlbum.length; i++) {
      if (prevAlbum[i].url !== nextAlbum[i].url) return false;
      if (prevAlbum[i].loading !== nextAlbum[i].loading) return false;
    }
  }

  return true;
}

export const PureMessageRow = memo(PureMessageRowInner, arePropsEqual);

// --- Pending layout ---

function PurePendingLayout({
  state,
  groupPosition,
}: {
  state: PendingRenderState;
  groupPosition: GroupPosition;
}) {
  return (
    <div
      className={cn(
        'flex justify-end',
        state.status === 'sending' && 'opacity-60',
        state.status === 'failed' && 'opacity-40',
      )}
    >
      <PureBubble isOutgoing={true} groupPosition={groupPosition} showAvatar={false}>
        <p className="whitespace-pre-wrap break-words tg-text-chat text-text-primary">
          {state.text}
          <span className="float-right h-[1.125rem] w-12" aria-hidden="true" />
        </p>
        <span className="absolute bottom-1 right-2">
          <PureMessageTime
            date={state.date}
            out={true}
            read={false}
            sending
            displayType="default"
          />
        </span>
      </PureBubble>
    </div>
  );
}

// --- Sticker layout ---

function PureStickerLayout({
  state,
  onReact,
}: {
  state: StickerRenderState;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
}) {
  const { msg, media } = state;
  const hasReactions = msg.reactions.length > 0;

  return (
    <PureBubble
      variant="media"
      isOutgoing={msg.isOutgoing}
      groupPosition="single"
      showAvatar={state.showAvatar}
      senderName={msg.senderName}
      senderPhotoUrl={state.senderPhotoUrl}
      hasReactions={hasReactions}
    >
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      <PureStickerView
        url={media.url}
        format={msg.stickerFormat}
        emoji={msg.stickerEmoji}
        loading={media.loading}
        onRetry={media.retry}
      />
      {hasReactions && (
        <PureReactionBar
          reactions={toReactionInfos(msg.reactions)}
          onReact={(e, c) => onReact(msg.id, e, c)}
        />
      )}
      <span className="mt-0.5 flex justify-end">
        <PureMessageTime
          date={msg.date}
          out={msg.isOutgoing}
          read={msg.isRead}
          edited={msg.editDate > 0}
          views={msg.viewCount || undefined}
          displayType="background"
        />
      </span>
    </PureBubble>
  );
}

// --- Media layout ---

function PureMediaLayout({
  state,
  groupPosition,
  onReact,
}: {
  state: MediaRenderState;
  groupPosition: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
}) {
  const { msg, media, bubbleVariant, displayWidth, displayHeight, minithumbnail } = state;
  const hasReactions = msg.reactions.length > 0;
  const isVideo = msg.contentKind === 'video' || msg.contentKind === 'animation';

  return (
    <PureBubble
      variant={bubbleVariant}
      isOutgoing={msg.isOutgoing}
      groupPosition={groupPosition}
      showAvatar={state.showAvatar}
      senderName={state.senderName}
      senderPhotoUrl={state.senderPhotoUrl}
      hasReactions={hasReactions}
    >
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      {bubbleVariant === 'framed' && state.showSenderName && (
        <div className="px-3 pt-1.5">
          <p className="mb-0.5 text-xs font-medium text-accent-brand">{msg.senderName}</p>
        </div>
      )}
      {bubbleVariant === 'framed' && msg.forwardFromName && (
        <div className="px-3">
          <PureForwardHeader fromName={msg.forwardFromName} photoUrl={state.forwardPhotoUrl} />
        </div>
      )}
      {bubbleVariant === 'framed' &&
        (msg.replyPreview ? (
          <div className="px-3">
            <PureReplyHeader
              senderName={msg.replyPreview.senderName}
              text={msg.replyPreview.text}
              mediaType={msg.replyPreview.mediaLabel}
              isOutgoing={msg.isOutgoing}
            />
          </div>
        ) : (
          msg.replyToMessageId > 0 && (
            <div className="px-3">
              <PureReplyHeader
                senderName=""
                text={`Reply to message #${msg.replyToMessageId}`}
                mediaType=""
                isOutgoing={msg.isOutgoing}
              />
            </div>
          )
        ))}
      {isVideo ? (
        <PureVideoView
          url={media.url}
          loading={media.loading}
          isCircle={false}
          isGif={msg.contentKind === 'animation'}
          width={displayWidth}
          height={displayHeight}
          minithumbnail={minithumbnail}
          onRetry={media.retry}
        />
      ) : (
        <PurePhotoView
          url={media.url}
          loading={media.loading}
          width={displayWidth}
          height={displayHeight}
          minithumbnail={minithumbnail}
          onRetry={media.retry}
        />
      )}
      {msg.text && (
        <div className="px-3 py-1.5">
          <p className="whitespace-pre-wrap break-words tg-text-chat text-text-primary">
            <PureFormattedText
              text={msg.text}
              entities={msg.entities}
              customEmojiUrls={state.customEmojiUrls}
            />
            <span
              className={cn('float-right h-[1.125rem]', msg.editDate > 0 ? 'w-[5.5rem]' : 'w-12')}
              aria-hidden="true"
            />
          </p>
        </div>
      )}
      {hasReactions && (
        <PureReactionBar
          reactions={toReactionInfos(msg.reactions)}
          onReact={(e, c) => onReact(msg.id, e, c)}
        />
      )}
      {state.isMediaOnly ? (
        <span className="absolute bottom-2 right-2">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType="image"
          />
        </span>
      ) : (
        <span className="absolute bottom-1 right-2">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType={state.displayType}
          />
        </span>
      )}
    </PureBubble>
  );
}

// --- Bubble layout ---

function PureBubbleLayout({
  state,
  groupPosition,
  onReact,
  onReplyClick,
}: {
  state: BubbleRenderState;
  groupPosition: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
  onReplyClick?: (messageId: number) => void;
}) {
  const { msg, media, displayType, isMediaOnly } = state;
  const ck = msg.contentKind;
  const isPhoto = ck === 'photo';
  const isVideo = ck === 'video' || ck === 'videoNote' || ck === 'animation';
  const isVoice = ck === 'voice';
  const hasMedia = isPhoto || isVideo || isVoice;
  const hasReactions = msg.reactions.length > 0;

  return (
    <PureBubble
      isOutgoing={msg.isOutgoing}
      groupPosition={groupPosition}
      showAvatar={state.showAvatar}
      senderName={msg.senderName}
      senderPhotoUrl={state.senderPhotoUrl}
      hasReactions={hasReactions}
    >
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      {state.showSenderName && (
        <p className="mb-0.5 text-xs font-medium text-accent-brand">{msg.senderName}</p>
      )}
      {msg.forwardFromName && (
        <PureForwardHeader fromName={msg.forwardFromName} photoUrl={state.forwardPhotoUrl} />
      )}
      {msg.replyPreview ? (
        <PureReplyHeader
          senderName={msg.replyPreview.senderName}
          text={msg.replyPreview.quoteText || msg.replyPreview.text}
          mediaType={msg.replyPreview.mediaLabel}
          mediaUrl={state.replyThumbUrl ?? undefined}
          isOutgoing={msg.isOutgoing}
          onClick={() => onReplyClick?.(msg.replyToMessageId)}
        />
      ) : (
        msg.replyToMessageId > 0 && (
          <PureReplyHeader
            senderName=""
            text="Loading..."
            mediaType=""
            isOutgoing={msg.isOutgoing}
            onClick={() => onReplyClick?.(msg.replyToMessageId)}
          />
        )
      )}
      {isPhoto && media && (
        <PurePhotoView
          url={media.url}
          loading={media.loading}
          onRetry={media.retry}
          width={state.displayWidth}
          height={state.displayHeight}
          minithumbnail={state.minithumbnail}
        />
      )}
      {isVideo && media && (
        <PureVideoView
          url={media.url}
          loading={media.loading}
          isCircle={ck === 'videoNote'}
          isGif={ck === 'animation'}
          onRetry={media.retry}
          width={state.displayWidth}
          height={state.displayHeight}
          minithumbnail={state.minithumbnail}
        />
      )}
      {isVoice && media && (
        <PureVoiceView
          url={media.url}
          loading={media.loading}
          onRetry={media.retry}
          waveform={msg.voiceWaveform}
          duration={msg.voiceDuration}
          fileSize={msg.voiceFileSize}
          speechStatus={msg.voiceSpeechStatus}
          speechText={msg.voiceSpeechText}
          onTranscribe={() => state.onTranscribe?.(msg.chatId, msg.id)}
        />
      )}
      {!isPhoto && !isVideo && !isVoice && msg.mediaLabel && (
        <p className="text-xs italic text-text-tertiary">{msg.mediaLabel}</p>
      )}
      {msg.text && (
        <p
          className={cn(
            'whitespace-pre-wrap break-words tg-text-chat text-text-primary',
            hasMedia && 'mt-2',
          )}
        >
          <PureFormattedText
            text={msg.text}
            entities={msg.entities}
            customEmojiUrls={state.customEmojiUrls}
          />
          <span
            className={cn('float-right h-[1.125rem]', msg.editDate > 0 ? 'w-[5.5rem]' : 'w-12')}
            aria-hidden="true"
          />
        </p>
      )}
      {msg.webPreview && (
        <PureLinkPreviewCard
          preview={{
            url: msg.webPreview.url,
            siteName: msg.webPreview.siteName,
            title: msg.webPreview.title,
            description: msg.webPreview.description,
            minithumbnail: msg.webPreview.minithumbnail,
            thumbUrl: state.linkPreviewThumbUrl,
            showLargeMedia: msg.webPreview.showLargeMedia,
            showMediaAboveDescription: msg.webPreview.showMediaAboveDescription,
          }}
        />
      )}
      {!msg.text && !msg.mediaLabel && (
        <p className="tg-text-chat italic text-text-quaternary">Unsupported message</p>
      )}
      {hasReactions && (
        <PureReactionBar
          reactions={toReactionInfos(msg.reactions)}
          onReact={(e, c) => onReact(msg.id, e, c)}
        />
      )}
      {msg.inlineKeyboard && (
        <PureBotKeyboard rows={msg.inlineKeyboard.map((row) => ({ buttons: row }))} />
      )}
      {isMediaOnly ? (
        <span className="absolute bottom-2 right-2">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType={displayType}
          />
        </span>
      ) : msg.webPreview ? (
        <span className="mt-1 flex justify-end">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType={displayType}
          />
        </span>
      ) : (
        <span className="absolute bottom-1 right-2">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType={displayType}
          />
        </span>
      )}
    </PureBubble>
  );
}

// --- Album layout ---

function PureAlbumLayout({
  state,
  groupPosition,
  onReact,
}: {
  state: AlbumRenderState;
  groupPosition: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
}) {
  const { first, messages, bubbleVariant } = state;
  const hasReactions = first.reactions.length > 0;

  return (
    <PureBubble
      variant={bubbleVariant}
      isOutgoing={first.isOutgoing}
      groupPosition={groupPosition}
      showAvatar={state.showAvatar}
      senderName={first.senderName}
      senderPhotoUrl={state.senderPhotoUrl}
      hasReactions={hasReactions}
    >
      <PureReactionPicker onReact={(e, c) => onReact(first.id, e, c)} />
      {bubbleVariant === 'framed' && state.showSenderName && (
        <div className="px-3 pt-1.5">
          <p className="mb-0.5 text-xs font-medium text-accent-brand">{first.senderName}</p>
        </div>
      )}
      {bubbleVariant === 'framed' && first.forwardFromName && (
        <div className="px-3">
          <PureForwardHeader fromName={first.forwardFromName} photoUrl={state.forwardPhotoUrl} />
        </div>
      )}
      {bubbleVariant === 'framed' &&
        (first.replyPreview ? (
          <div className="px-3">
            <PureReplyHeader
              senderName={first.replyPreview.senderName}
              text={first.replyPreview.text}
              mediaType={first.replyPreview.mediaLabel}
              isOutgoing={first.isOutgoing}
            />
          </div>
        ) : (
          first.replyToMessageId > 0 && (
            <div className="px-3">
              <PureReplyHeader
                senderName=""
                text={`Reply to message #${first.replyToMessageId}`}
                mediaType=""
                isOutgoing={first.isOutgoing}
              />
            </div>
          )
        ))}
      <PureAlbumGrid messages={messages} albumMedia={state.albumMedia} maxWidth={MAX_MEDIA_SIZE} />
      {first.text && (
        <div className="px-3 py-1.5">
          <p className="whitespace-pre-wrap break-words tg-text-chat text-text-primary">
            <PureFormattedText
              text={first.text}
              entities={first.entities}
              customEmojiUrls={state.customEmojiUrls}
            />
            <span
              className={cn('float-right h-[1.125rem]', first.editDate > 0 ? 'w-[5.5rem]' : 'w-12')}
              aria-hidden="true"
            />
          </p>
        </div>
      )}
      {hasReactions && (
        <PureReactionBar
          reactions={toReactionInfos(first.reactions)}
          onReact={(e, c) => onReact(first.id, e, c)}
        />
      )}
      {first.text ? (
        <span className="absolute bottom-1 right-2">
          <PureMessageTime
            date={first.date}
            out={first.isOutgoing}
            read={first.isRead}
            edited={first.editDate > 0}
            views={first.viewCount || undefined}
            displayType="default"
          />
        </span>
      ) : (
        <span className="absolute bottom-2 right-2">
          <PureMessageTime
            date={first.date}
            out={first.isOutgoing}
            read={first.isRead}
            edited={first.editDate > 0}
            views={first.viewCount || undefined}
            displayType="image"
          />
        </span>
      )}
    </PureBubble>
  );
}
