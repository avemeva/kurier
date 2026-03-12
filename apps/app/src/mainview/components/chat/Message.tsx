import { useCallback } from 'react';
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
import { useMessage } from '@/hooks/useMessage';
import { useReplyThumb } from '@/hooks/useReplyThumb';
import { MAX_MEDIA_SIZE } from '@/lib/media-sizing';
import { useChatStore } from '@/lib/store';
import type { UIReaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlbumGrid } from './AlbumGrid';
import { FormattedText } from './FormattedText';

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
};

// --- Main component ---

export function Message({
  input,
  showSender,
  senderPhotoUrl,
  groupPosition = 'single',
  onReact,
  onReplyClick,
}: MessageProps) {
  const ctx: MessageContext = { showSender, senderPhotoUrl };
  const state = useMessage(input, ctx);

  switch (state.layout) {
    case 'service':
      return (
        <PureServiceMessage
          text={state.text}
          onClick={state.pinnedMessageId ? () => onReplyClick?.(state.pinnedMessageId) : undefined}
        />
      );
    case 'pending':
      return <PendingLayout state={state} groupPosition={groupPosition} />;
    case 'sticker':
      return <StickerLayout state={state} onReact={onReact} />;
    case 'media':
      return <MediaLayout state={state} groupPosition={groupPosition} onReact={onReact} />;
    case 'bubble':
      return (
        <BubbleLayout
          state={state}
          groupPosition={groupPosition}
          onReact={onReact}
          onReplyClick={onReplyClick}
        />
      );
    case 'album':
      return <AlbumLayout state={state} groupPosition={groupPosition} onReact={onReact} />;
  }
}

// --- Pending layout ---

function PendingLayout({
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

function StickerLayout({
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

function MediaLayout({
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
  const profilePhotos = useChatStore((s) => s.profilePhotos);

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
          <PureForwardHeader
            fromName={msg.forwardFromName}
            photoUrl={profilePhotos[msg.forwardFromPhotoId]}
          />
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
            <FormattedText text={msg.text} entities={msg.entities} />
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

function BubbleLayout({
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
  const replyThumbUrl = useReplyThumb(
    msg.replyPreview ? msg.chatId : 0,
    msg.replyPreview ? msg.replyToMessageId : 0,
  );
  const ck = msg.contentKind;
  const isPhoto = ck === 'photo';
  const isVideo = ck === 'video' || ck === 'videoNote' || ck === 'animation';
  const isVoice = ck === 'voice';
  const hasMedia = isPhoto || isVideo || isVoice;
  const hasReactions = msg.reactions.length > 0;

  const storeRecognizeSpeech = useChatStore((s) => s.recognizeSpeech);
  const profilePhotos = useChatStore((s) => s.profilePhotos);
  const linkPreviewThumbUrl = useChatStore((s) =>
    msg.webPreview ? (s.thumbUrls[`${msg.chatId}_${msg.id}`] ?? null) : null,
  );
  const handleTranscribe = useCallback(() => {
    storeRecognizeSpeech(msg.chatId, msg.id);
  }, [msg.chatId, msg.id, storeRecognizeSpeech]);

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
        <PureForwardHeader
          fromName={msg.forwardFromName}
          photoUrl={profilePhotos[msg.forwardFromPhotoId]}
        />
      )}
      {msg.replyPreview ? (
        <PureReplyHeader
          senderName={msg.replyPreview.senderName}
          text={msg.replyPreview.quoteText || msg.replyPreview.text}
          mediaType={msg.replyPreview.mediaLabel}
          mediaUrl={replyThumbUrl ?? undefined}
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
          onTranscribe={handleTranscribe}
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
          <FormattedText text={msg.text} entities={msg.entities} />
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
            thumbUrl: linkPreviewThumbUrl,
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

function AlbumLayout({
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
  const profilePhotos = useChatStore((s) => s.profilePhotos);

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
          <PureForwardHeader
            fromName={first.forwardFromName}
            photoUrl={profilePhotos[first.forwardFromPhotoId]}
          />
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
      <AlbumGrid messages={messages} chatId={first.chatId} maxWidth={MAX_MEDIA_SIZE} />
      {first.text && (
        <div className="px-3 py-1.5">
          <p className="whitespace-pre-wrap break-words tg-text-chat text-text-primary">
            <FormattedText text={first.text} entities={first.entities} />
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
