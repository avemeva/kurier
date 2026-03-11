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
import { PureVideoView } from '@/components/ui/chat/VideoView';
import { PureVoiceView } from '@/components/ui/chat/VoiceView';
import { UserAvatar } from '@/components/ui/user-avatar';
import type {
  AlbumRenderState,
  BubbleRenderState,
  MessageContext,
  MessageInput,
  PendingRenderState,
  StickerRenderState,
} from '@/hooks/useMessage';
import { useMessage } from '@/hooks/useMessage';
import { useReplyThumb } from '@/hooks/useReplyThumb';
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
};

// --- Main component ---

export function Message({
  input,
  showSender,
  senderPhotoUrl,
  groupPosition = 'single',
  onReact,
}: MessageProps) {
  const ctx: MessageContext = { showSender, senderPhotoUrl };
  const state = useMessage(input, ctx);

  switch (state.layout) {
    case 'service':
      return <PureServiceMessage text={state.text} />;
    case 'pending':
      return <PendingLayout state={state} groupPosition={groupPosition} />;
    case 'sticker':
      return <StickerLayout state={state} onReact={onReact} />;
    case 'bubble':
      return <BubbleLayout state={state} groupPosition={groupPosition} onReact={onReact} />;
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
          <span className="float-right h-[18px] w-12" aria-hidden="true" />
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

  const stickerEl = (
    <div className="group/bubble relative max-w-[224px]">
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      <PurePhotoView url={media.url} loading={media.loading} onRetry={media.retry} />
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
          displayType="background"
        />
      </span>
    </div>
  );

  if (!state.showAvatar) return stickerEl;

  return (
    <div className="flex items-end gap-2">
      <UserAvatar
        name={msg.senderName}
        src={state.senderPhotoUrl}
        className="size-7 shrink-0 text-xs"
      />
      {stickerEl}
    </div>
  );
}

// --- Bubble layout ---

function BubbleLayout({
  state,
  groupPosition,
  onReact,
}: {
  state: BubbleRenderState;
  groupPosition: GroupPosition;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
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
        <p className="mb-0.5 text-xs font-medium text-accent-blue">{msg.senderName}</p>
      )}
      {msg.forwardFromName && <PureForwardHeader fromName={msg.forwardFromName} />}
      {msg.replyPreview ? (
        <PureReplyHeader
          senderName={msg.replyPreview.senderName}
          text={msg.replyPreview.quoteText || msg.replyPreview.text}
          mediaType={msg.replyPreview.mediaLabel}
          mediaUrl={replyThumbUrl ?? undefined}
          isOutgoing={msg.isOutgoing}
        />
      ) : (
        msg.replyToMessageId > 0 && (
          <PureReplyHeader
            senderName=""
            text="Loading..."
            mediaType=""
            isOutgoing={msg.isOutgoing}
          />
        )
      )}
      {isPhoto && media && (
        <PurePhotoView url={media.url} loading={media.loading} onRetry={media.retry} />
      )}
      {isVideo && media && (
        <PureVideoView
          url={media.url}
          loading={media.loading}
          isCircle={ck === 'videoNote'}
          isGif={ck === 'animation'}
          onRetry={media.retry}
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
          <span className="float-right h-[18px] w-12" aria-hidden="true" />
        </p>
      )}
      {msg.webPreview && (
        <PureLinkPreviewCard
          preview={{
            url: msg.webPreview.url,
            siteName: msg.webPreview.siteName,
            title: msg.webPreview.title,
            description: msg.webPreview.description,
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
  const { first, messages } = state;
  const hasReactions = first.reactions.length > 0;

  return (
    <PureBubble
      isOutgoing={first.isOutgoing}
      groupPosition={groupPosition}
      showAvatar={state.showAvatar}
      senderName={first.senderName}
      senderPhotoUrl={state.senderPhotoUrl}
      hasReactions={hasReactions}
    >
      <PureReactionPicker onReact={(e, c) => onReact(first.id, e, c)} />
      {state.showSenderName && (
        <p className="mb-0.5 text-xs font-medium text-accent-blue">{first.senderName}</p>
      )}
      <AlbumGrid messages={messages} chatId={first.chatId} />
      {first.text && (
        <p className="mt-1 whitespace-pre-wrap break-words tg-text-chat text-text-primary">
          <FormattedText text={first.text} entities={first.entities} />
          <span className="inline-block w-12 align-baseline" aria-hidden="true">
            {'\u00A0'}
          </span>
        </p>
      )}
      {hasReactions && (
        <PureReactionBar
          reactions={toReactionInfos(first.reactions)}
          onReact={(e, c) => onReact(first.id, e, c)}
        />
      )}
      <span className="absolute bottom-1 right-2">
        <PureMessageTime
          date={first.date}
          out={first.isOutgoing}
          read={first.isRead}
          edited={first.editDate > 0}
          displayType={first.text ? 'default' : 'image'}
        />
      </span>
    </PureBubble>
  );
}
