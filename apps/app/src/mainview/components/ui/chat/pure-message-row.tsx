import { memo } from 'react';
import type {
  TGAlbumContent,
  TGAnimationContent,
  TGMessage,
  TGPhotoContent,
  TGReaction,
  TGTextContent,
  TGVideoContent,
  TGVideoNoteContent,
  TGVoiceContent,
} from '@/data';
import { computeMediaSize, MAX_MEDIA_SIZE, MIN_MEDIA_SIZE } from '@/lib/media-sizing';
import { cn } from '@/lib/utils';
import { PureBotKeyboard } from './bot-keyboard';
import type { GroupPosition } from './bubble';
import { PureBubble } from './bubble';
import { PureFormattedText } from './formatted-text';
import { PureForwardHeader } from './forward-header';
import { PureLinkPreviewCard } from './link-preview-card';
import type {
  AlbumRenderState,
  BubbleRenderState,
  MediaRenderState,
  PendingRenderState,
  StickerRenderState,
} from './message-rendering';
import { computeMessageState } from './message-rendering';
import { PureMessageTime } from './message-time';
import { PurePhotoView } from './photo-view';
import { PureAlbumGrid } from './pure-album-grid';
import { PureReactionBar, PureReactionPicker } from './reaction-bar';
import { PureReplyHeader } from './reply-header';
import { PureServiceMessage } from './service-message';
import { PureStickerView } from './sticker-view';
import { PureVideoView } from './video-view';
import { PureVoiceView } from './voice-view';

export type { GroupPosition } from './bubble';

// --- Helpers ---

function toReactionInfos(reactions: TGReaction[]) {
  return reactions.map((r) => ({ emoticon: r.emoji, count: r.count, chosen: r.chosen }));
}

// --- Props ---

export type MessageProps = {
  msg: TGMessage;
  showSender: boolean;
  groupPosition?: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
  onReplyClick?: (messageId: number) => void;
  onTranscribe?: (chatId: number, msgId: number) => void;
};

// --- Main component ---

function PureMessageRowInner({
  msg,
  showSender,
  groupPosition = 'single',
  onReact,
  onReplyClick,
  onTranscribe,
}: MessageProps) {
  const state = computeMessageState(msg, { showSender }, onTranscribe);

  switch (state.layout) {
    case 'service':
      return (
        <PureServiceMessage
          senderName={state.senderName}
          action={state.action}
          onClick={
            state.action.type === 'pin'
              ? () => onReplyClick?.(state.action.type === 'pin' ? state.action.messageId : 0)
              : undefined
          }
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
  return (
    prev.msg === next.msg &&
    prev.showSender === next.showSender &&
    prev.groupPosition === next.groupPosition &&
    prev.onReact === next.onReact &&
    prev.onReplyClick === next.onReplyClick &&
    prev.onTranscribe === next.onTranscribe
  );
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
  const { msg } = state;
  const hasReactions = msg.reactions.length > 0;

  return (
    <PureBubble
      variant="media"
      isOutgoing={msg.isOutgoing}
      groupPosition="single"
      showAvatar={state.showAvatar}
      senderName={msg.sender.name}
      senderPhotoUrl={msg.sender.photoUrl}
      hasReactions={hasReactions}
    >
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      <PureStickerView
        url={state.stickerUrl ?? null}
        format={state.stickerFormat}
        emoji={state.stickerEmoji}
        loading={state.stickerUrl === undefined}
      />
      {hasReactions ? (
        <PureReactionBar
          reactions={toReactionInfos(msg.reactions)}
          onReact={(e, c) => onReact(msg.id, e, c)}
        >
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType="background"
          />
        </PureReactionBar>
      ) : (
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
      )}
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
  const { msg, bubbleVariant, displayWidth, displayHeight } = state;
  const content = msg.content as
    | TGPhotoContent
    | TGVideoContent
    | TGAnimationContent
    | TGVideoNoteContent;
  const hasReactions = msg.reactions.length > 0;
  const isVideoNote = content.kind === 'videoNote';
  const isVideo = content.kind === 'video' || content.kind === 'animation' || isVideoNote;
  const text = isVideoNote
    ? ''
    : ((content as TGPhotoContent | TGVideoContent | TGAnimationContent).caption?.text ?? '');

  return (
    <PureBubble
      variant={bubbleVariant}
      isOutgoing={msg.isOutgoing}
      groupPosition={groupPosition}
      showAvatar={state.showAvatar}
      senderName={msg.sender.name}
      senderPhotoUrl={msg.sender.photoUrl}
      hasReactions={hasReactions}
    >
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      {bubbleVariant === 'framed' && state.showSenderName && (
        <div className="px-3 pt-1.5">
          <p className="mb-0.5 text-xs font-medium text-accent-brand">{msg.sender.name}</p>
        </div>
      )}
      {bubbleVariant === 'framed' && msg.forward && (
        <div className="px-3 py-1.5">
          <PureForwardHeader fromName={msg.forward.fromName} photoUrl={msg.forward.photoUrl} />
        </div>
      )}
      {bubbleVariant === 'framed' &&
        (msg.replyTo?.senderName !== undefined ? (
          <div className="px-3 py-1.5">
            <PureReplyHeader
              senderName={msg.replyTo.senderName ?? ''}
              text={msg.replyTo.text ?? ''}
              mediaType={msg.replyTo.mediaLabel ?? ''}
              isOutgoing={msg.isOutgoing}
            />
          </div>
        ) : (
          msg.replyTo &&
          msg.replyTo.messageId > 0 && (
            <div className="px-3 py-1.5">
              <PureReplyHeader
                senderName=""
                text={`Reply to message #${msg.replyTo.messageId}`}
                mediaType=""
                isOutgoing={msg.isOutgoing}
              />
            </div>
          )
        ))}
      {isVideo ? (
        <PureVideoView
          url={content.media.url ?? null}
          loading={content.media.url === undefined}
          isCircle={content.kind === 'videoNote'}
          isGif={content.kind === 'animation'}
          width={displayWidth}
          height={displayHeight}
          minithumbnail={content.media.minithumbnail}
        />
      ) : (
        <PurePhotoView
          url={content.media.url ?? null}
          loading={content.media.url === undefined}
          width={displayWidth}
          height={displayHeight}
          minithumbnail={content.media.minithumbnail}
        />
      )}
      {text && !isVideoNote && (
        <div className="px-3 py-1.5">
          <p className="whitespace-pre-wrap break-words tg-text-chat text-text-primary">
            <PureFormattedText
              text={text}
              entities={
                (content as TGPhotoContent | TGVideoContent | TGAnimationContent).caption
                  ?.entities ?? []
              }
              customEmojiUrls={
                (content as TGPhotoContent | TGVideoContent | TGAnimationContent).caption
                  ?.customEmojiUrls
              }
            />
            <span
              className={cn('float-right h-[1.125rem]', msg.editDate > 0 ? 'w-[5.5rem]' : 'w-12')}
              aria-hidden="true"
            />
          </p>
        </div>
      )}
      {hasReactions ? (
        <PureReactionBar
          reactions={toReactionInfos(msg.reactions)}
          onReact={(e, c) => onReact(msg.id, e, c)}
          className="px-3 pb-1.5"
        >
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType="default"
          />
        </PureReactionBar>
      ) : state.isMediaOnly ? (
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
  const { msg, displayType } = state;
  const content = msg.content;
  const ck = content.kind;

  const isPhoto = ck === 'photo';
  const isVideo = ck === 'video' || ck === 'videoNote' || ck === 'animation';
  const isVoice = ck === 'voice';
  const hasMedia = isPhoto || isVideo || isVoice;
  const hasReactions = msg.reactions.length > 0;

  // Extract text based on content kind
  const text =
    ck === 'text'
      ? (content as TGTextContent).text
      : 'caption' in content && (content as { caption?: { text: string } | null }).caption?.text
        ? (content as { caption: { text: string } }).caption.text
        : '';
  const entities =
    ck === 'text'
      ? (content as TGTextContent).entities
      : 'caption' in content && (content as { caption?: { entities: unknown[] } | null }).caption
        ? (content as { caption: { entities: TGTextContent['entities'] } }).caption.entities
        : [];
  const customEmojiUrls =
    ck === 'text'
      ? (content as TGTextContent).customEmojiUrls
      : 'caption' in content &&
          (content as { caption?: { customEmojiUrls: unknown } | null }).caption
        ? (content as { caption: { customEmojiUrls: TGTextContent['customEmojiUrls'] } }).caption
            .customEmojiUrls
        : undefined;

  // Media label for unsupported/document content types
  const mediaLabel =
    ck === 'document'
      ? (content as { label: string }).label
      : ck === 'unsupported'
        ? (content as { label: string }).label
        : '';

  // Compute display dimensions for photo/video in bubble
  let bubbleDisplayWidth: number | undefined;
  let bubbleDisplayHeight: number | undefined;
  let minithumbnail: string | null | undefined;
  if (
    (ck === 'photo' || ck === 'video' || ck === 'videoNote' || ck === 'animation') &&
    'media' in content
  ) {
    const media = (
      content as TGPhotoContent | TGVideoContent | TGAnimationContent | TGVideoNoteContent
    ).media;
    if (media.width > 0 && media.height > 0) {
      const sized = computeMediaSize(media.width, media.height, MAX_MEDIA_SIZE, MIN_MEDIA_SIZE);
      bubbleDisplayWidth = sized.width;
      bubbleDisplayHeight = sized.height;
    }
    minithumbnail = media.minithumbnail;
  }

  const isMediaOnly = (isPhoto || isVideo) && !text;

  // Web preview
  const webPreview = ck === 'text' ? (content as TGTextContent).webPreview : null;

  return (
    <PureBubble
      isOutgoing={msg.isOutgoing}
      groupPosition={groupPosition}
      showAvatar={state.showAvatar}
      senderName={msg.sender.name}
      senderPhotoUrl={msg.sender.photoUrl}
    >
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      {state.showSenderName && (
        <p className="mb-0.5 text-xs font-medium text-accent-brand">{msg.sender.name}</p>
      )}
      {msg.forward && (
        <PureForwardHeader fromName={msg.forward.fromName} photoUrl={msg.forward.photoUrl} />
      )}
      {msg.replyTo?.senderName !== undefined ? (
        <PureReplyHeader
          senderName={msg.replyTo.senderName ?? ''}
          text={msg.replyTo.quoteText || msg.replyTo.text || ''}
          mediaType={msg.replyTo.mediaLabel ?? ''}
          mediaUrl={msg.replyTo.thumbUrl}
          isOutgoing={msg.isOutgoing}
          onClick={() => onReplyClick?.(msg.replyTo?.messageId ?? 0)}
        />
      ) : (
        msg.replyTo &&
        msg.replyTo.messageId > 0 && (
          <PureReplyHeader
            senderName=""
            text="Loading..."
            mediaType=""
            isOutgoing={msg.isOutgoing}
            onClick={() => onReplyClick?.(msg.replyTo?.messageId ?? 0)}
          />
        )
      )}
      {isPhoto && 'media' in content && (
        <PurePhotoView
          url={(content as TGPhotoContent).media.url ?? null}
          loading={(content as TGPhotoContent).media.url === undefined}
          width={bubbleDisplayWidth}
          height={bubbleDisplayHeight}
          minithumbnail={minithumbnail}
        />
      )}
      {isVideo && 'media' in content && (
        <PureVideoView
          url={
            (content as TGVideoContent | TGVideoNoteContent | TGAnimationContent).media.url ?? null
          }
          loading={
            (content as TGVideoContent | TGVideoNoteContent | TGAnimationContent).media.url ===
            undefined
          }
          isCircle={ck === 'videoNote'}
          isGif={ck === 'animation'}
          width={bubbleDisplayWidth}
          height={bubbleDisplayHeight}
          minithumbnail={minithumbnail}
        />
      )}
      {isVoice && (
        <PureVoiceView
          url={(content as TGVoiceContent).url ?? null}
          loading={(content as TGVoiceContent).url === undefined}
          waveform={(content as TGVoiceContent).waveform}
          duration={(content as TGVoiceContent).duration}
          fileSize={(content as TGVoiceContent).fileSize}
          speechStatus={(content as TGVoiceContent).speechStatus}
          speechText={(content as TGVoiceContent).speechText}
          onTranscribe={() => state.onTranscribe?.(msg.chatId, msg.id)}
        />
      )}
      {!isPhoto && !isVideo && !isVoice && mediaLabel && (
        <p className="text-xs italic text-text-tertiary">{mediaLabel}</p>
      )}
      {text && (
        <p
          className={cn(
            'whitespace-pre-wrap break-words tg-text-chat text-text-primary',
            hasMedia && 'mt-2',
          )}
        >
          <PureFormattedText text={text} entities={entities} customEmojiUrls={customEmojiUrls} />
          <span
            className={cn('float-right h-[1.125rem]', msg.editDate > 0 ? 'w-[5.5rem]' : 'w-12')}
            aria-hidden="true"
          />
        </p>
      )}
      {webPreview && (
        <PureLinkPreviewCard
          preview={{
            url: webPreview.url,
            siteName: webPreview.siteName,
            title: webPreview.title,
            description: webPreview.description,
            minithumbnail: webPreview.minithumbnail,
            thumbUrl: webPreview.thumbUrl,
            showLargeMedia: webPreview.showLargeMedia,
            showMediaAboveDescription: webPreview.showMediaAboveDescription,
          }}
        />
      )}
      {!text && !mediaLabel && !hasMedia && !webPreview && (
        <p className="tg-text-chat italic text-text-quaternary">Unsupported message</p>
      )}
      {hasReactions && (
        <PureReactionBar
          reactions={toReactionInfos(msg.reactions)}
          onReact={(e, c) => onReact(msg.id, e, c)}
        >
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType={displayType}
          />
        </PureReactionBar>
      )}
      {msg.inlineKeyboard && (
        <PureBotKeyboard rows={msg.inlineKeyboard.map((row) => ({ buttons: row }))} />
      )}
      {!hasReactions &&
        (isMediaOnly ? (
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
        ) : webPreview ? (
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
        ))}
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
  const { msg, bubbleVariant } = state;
  const content = msg.content as TGAlbumContent;
  const hasReactions = msg.reactions.length > 0;
  const text = content.caption?.text ?? '';

  return (
    <PureBubble
      variant={bubbleVariant}
      isOutgoing={msg.isOutgoing}
      groupPosition={groupPosition}
      showAvatar={state.showAvatar}
      senderName={msg.sender.name}
      senderPhotoUrl={msg.sender.photoUrl}
      hasReactions={hasReactions}
    >
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      {bubbleVariant === 'framed' && state.showSenderName && (
        <div className="px-3 pt-1.5">
          <p className="mb-0.5 text-xs font-medium text-accent-brand">{msg.sender.name}</p>
        </div>
      )}
      {bubbleVariant === 'framed' && msg.forward && (
        <div className="px-3">
          <PureForwardHeader fromName={msg.forward.fromName} photoUrl={msg.forward.photoUrl} />
        </div>
      )}
      {bubbleVariant === 'framed' &&
        (msg.replyTo?.senderName !== undefined ? (
          <div className="px-3">
            <PureReplyHeader
              senderName={msg.replyTo.senderName ?? ''}
              text={msg.replyTo.text ?? ''}
              mediaType={msg.replyTo.mediaLabel ?? ''}
              isOutgoing={msg.isOutgoing}
            />
          </div>
        ) : (
          msg.replyTo &&
          msg.replyTo.messageId > 0 && (
            <div className="px-3">
              <PureReplyHeader
                senderName=""
                text={`Reply to message #${msg.replyTo.messageId}`}
                mediaType=""
                isOutgoing={msg.isOutgoing}
              />
            </div>
          )
        ))}
      <PureAlbumGrid items={content.items} maxWidth={MAX_MEDIA_SIZE} />
      {text && (
        <div className="px-3 py-1.5">
          <p className="whitespace-pre-wrap break-words tg-text-chat text-text-primary">
            <PureFormattedText
              text={text}
              entities={content.caption?.entities ?? []}
              customEmojiUrls={content.caption?.customEmojiUrls}
            />
            <span
              className={cn('float-right h-[1.125rem]', msg.editDate > 0 ? 'w-[5.5rem]' : 'w-12')}
              aria-hidden="true"
            />
          </p>
        </div>
      )}
      {hasReactions ? (
        <PureReactionBar
          reactions={toReactionInfos(msg.reactions)}
          onReact={(e, c) => onReact(msg.id, e, c)}
          className="px-3 pb-1.5"
        >
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType="default"
          />
        </PureReactionBar>
      ) : text ? (
        <span className="absolute bottom-1 right-2">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            edited={msg.editDate > 0}
            views={msg.viewCount || undefined}
            displayType="default"
          />
        </span>
      ) : (
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
      )}
    </PureBubble>
  );
}
