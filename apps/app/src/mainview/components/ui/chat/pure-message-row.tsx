import { memo, type ReactNode } from 'react';
import type { TGMessage, TGReaction } from '@/data';
import { MAX_MEDIA_SIZE } from '@/lib/media-sizing';
import { cn } from '@/lib/utils';
import { PureBotKeyboard } from './bot-keyboard';
import type { GroupPosition } from './bubble';
import { PureBubble } from './bubble';
import { PureDocumentView } from './document-view';
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
import { PureReactionBar } from './reaction-bar';
import { PureReplyHeader } from './reply-header';
import { PureServiceMessage } from './service-message';
import { PureStickerView } from './sticker-view';
import { PureVideoView } from './video-view';
import { PureVoiceView } from './voice-view';

export type { GroupPosition } from './bubble';

// ─── Helpers ─────────────────────────────────────────────

function toReactionInfos(reactions: TGReaction[]) {
  return reactions.map((r) => ({ emoticon: r.emoji, count: r.count, chosen: r.chosen }));
}

// ─── Props ───────────────────────────────────────────────

export type MessageProps = {
  msg: TGMessage;
  showSender: boolean;
  groupPosition?: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
  onReplyClick?: (messageId: number) => void;
  onTranscribe?: (chatId: number, msgId: number) => void;
};

// ─── PureMessageRow ──────────────────────────────────────
// Computes render state, selects content, passes to layout frame.

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
      return <PendingFrame state={state} groupPosition={groupPosition} />;

    case 'sticker':
      return (
        <StickerFrame state={state} onReact={onReact}>
          <PureStickerView
            url={state.url ?? null}
            format={state.format}
            emoji={state.emoji}
            loading={state.url === undefined}
          />
        </StickerFrame>
      );

    case 'media':
      return (
        <MediaFrame
          state={state}
          groupPosition={groupPosition}
          onReact={onReact}
          onReplyClick={onReplyClick}
        >
          {state.contentKind === 'videoNote' ? (
            <PureVideoView
              url={state.media.url ?? null}
              loading={state.media.url === undefined}
              isCircle
              width={state.displayWidth}
              height={state.displayHeight}
              senderPhotoUrl={state.msg.sender.photoUrl}
              speechStatus={state.videoNote?.speechStatus}
              speechText={state.videoNote?.speechText}
              onTranscribe={() => onTranscribe?.(state.msg.chatId, state.msg.id)}
              minithumbnail={state.media.minithumbnail}
            />
          ) : state.contentKind === 'animation' ? (
            <PureVideoView
              url={state.media.url ?? null}
              loading={state.media.url === undefined}
              isGif
              width={state.displayWidth}
              height={state.displayHeight}
              minithumbnail={state.media.minithumbnail}
            />
          ) : state.contentKind === 'video' ? (
            <PureVideoView
              url={state.media.url ?? null}
              loading={state.media.url === undefined}
              width={state.displayWidth}
              height={state.displayHeight}
              minithumbnail={state.media.minithumbnail}
            />
          ) : (
            <PurePhotoView
              url={state.media.url ?? null}
              loading={state.media.url === undefined}
              width={state.displayWidth}
              height={state.displayHeight}
              minithumbnail={state.media.minithumbnail}
            />
          )}
          {state.caption && (
            <div className="px-3 py-1.5">
              <p className="whitespace-pre-wrap break-words tg-text-chat text-text-primary">
                <PureFormattedText
                  text={state.caption.text}
                  entities={state.caption.entities}
                  customEmojiUrls={state.caption.customEmojiUrls}
                />
                <span
                  className={cn(
                    'float-right h-[1.125rem]',
                    state.msg.editDate > 0 ? 'w-[5.5rem]' : 'w-12',
                  )}
                  aria-hidden="true"
                />
              </p>
            </div>
          )}
        </MediaFrame>
      );

    case 'album':
      return (
        <MediaFrame
          state={state}
          groupPosition={groupPosition}
          onReact={onReact}
          onReplyClick={onReplyClick}
        >
          <PureAlbumGrid items={state.items} maxWidth={MAX_MEDIA_SIZE} />
          {state.caption && (
            <div className="px-3 py-1.5">
              <p className="whitespace-pre-wrap break-words tg-text-chat text-text-primary">
                <PureFormattedText
                  text={state.caption.text}
                  entities={state.caption.entities}
                  customEmojiUrls={state.caption.customEmojiUrls}
                />
                <span
                  className={cn(
                    'float-right h-[1.125rem]',
                    state.msg.editDate > 0 ? 'w-[5.5rem]' : 'w-12',
                  )}
                  aria-hidden="true"
                />
              </p>
            </div>
          )}
        </MediaFrame>
      );

    case 'bubble':
      return (
        <BubbleFrame
          state={state}
          groupPosition={groupPosition}
          onReact={onReact}
          onReplyClick={onReplyClick}
        >
          {/* Voice */}
          {state.voiceContent && (
            <PureVoiceView
              url={state.voiceContent.url ?? null}
              loading={state.voiceContent.url === undefined}
              waveform={state.voiceContent.waveform}
              duration={state.voiceContent.duration}
              fileSize={state.voiceContent.fileSize}
              speechStatus={state.voiceContent.speechStatus}
              speechText={state.voiceContent.speechText}
              onTranscribe={() => state.onTranscribe?.(state.msg.chatId, state.msg.id)}
            />
          )}
          {/* Document */}
          {!state.voiceContent && state.documentContent && (
            <PureDocumentView
              fileName={state.documentContent.fileName}
              fileSize={state.documentContent.fileSize}
              url={state.documentContent.url}
            />
          )}
          {/* Text */}
          {state.textContent && (
            <>
              <p
                className={cn(
                  'whitespace-pre-wrap break-words tg-text-chat text-text-primary',
                  state.voiceContent && 'mt-2',
                )}
              >
                <PureFormattedText
                  text={state.textContent.text}
                  entities={state.textContent.entities}
                  customEmojiUrls={state.textContent.customEmojiUrls}
                />
                <span
                  className={cn(
                    'float-right h-[1.125rem]',
                    state.msg.editDate > 0 ? 'w-[5.5rem]' : 'w-12',
                  )}
                  aria-hidden="true"
                />
              </p>
              {state.textContent.webPreview && (
                <PureLinkPreviewCard
                  preview={{
                    url: state.textContent.webPreview.url,
                    siteName: state.textContent.webPreview.siteName,
                    title: state.textContent.webPreview.title,
                    description: state.textContent.webPreview.description,
                    minithumbnail: state.textContent.webPreview.minithumbnail,
                    thumbUrl: state.textContent.webPreview.thumbUrl,
                    showLargeMedia: state.textContent.webPreview.showLargeMedia,
                    showMediaAboveDescription:
                      state.textContent.webPreview.showMediaAboveDescription,
                  }}
                />
              )}
            </>
          )}
          {/* Unsupported */}
          {!state.textContent && !state.documentContent && !state.voiceContent && (
            <p className="tg-text-chat italic text-text-quaternary">Unsupported message</p>
          )}
        </BubbleFrame>
      );
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

// ─── PendingFrame ────────────────────────────────────────

function PendingFrame({
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

// ─── StickerFrame ────────────────────────────────────────
// variant="media". No headers. Flow time with background pill.

function StickerFrame({
  state,
  onReact,
  children,
}: {
  state: StickerRenderState;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
  children: ReactNode;
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
      {children}
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

// ─── MediaFrame ──────────────────────────────────────────
// variant="media"|"framed". Padded headers. Image/default time.
// Shared by media and album layouts.

function MediaFrame({
  state,
  groupPosition,
  onReact,
  onReplyClick,
  children,
}: {
  state: MediaRenderState | AlbumRenderState;
  groupPosition: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
  onReplyClick?: (messageId: number) => void;
  children: ReactNode;
}) {
  const { msg, bubbleVariant } = state;
  const hasReactions = msg.reactions.length > 0;
  const isMediaOnly =
    'isMediaOnly' in state ? state.isMediaOnly : !('caption' in state && state.caption);

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
              onClick={() => onReplyClick?.(msg.replyTo?.messageId ?? 0)}
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
                onClick={() => onReplyClick?.(msg.replyTo?.messageId ?? 0)}
              />
            </div>
          )
        ))}
      {children}
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
      ) : isMediaOnly ? (
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
            displayType="default"
          />
        </span>
      )}
    </PureBubble>
  );
}

// ─── BubbleFrame ─────────────────────────────────────────
// variant="filled". Inline headers. Absolute/flow time. Bot keyboard.

function BubbleFrame({
  state,
  groupPosition,
  onReact,
  onReplyClick,
  children,
}: {
  state: BubbleRenderState;
  groupPosition: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
  onReplyClick?: (messageId: number) => void;
  children: ReactNode;
}) {
  const { msg, displayType } = state;
  const hasReactions = msg.reactions.length > 0;
  const hasWebPreview = !!state.textContent?.webPreview;

  return (
    <PureBubble
      isOutgoing={msg.isOutgoing}
      groupPosition={groupPosition}
      showAvatar={state.showAvatar}
      senderName={msg.sender.name}
      senderPhotoUrl={msg.sender.photoUrl}
      hasReactions={hasReactions}
    >
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
      {children}
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
        (hasWebPreview ? (
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
