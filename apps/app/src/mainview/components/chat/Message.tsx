import { useCallback } from 'react';
import { PureBotKeyboard } from '@/components/ui/chat/BotKeyboard';
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
import { recognizeSpeech } from '@/lib/telegram';
import type { UIReaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlbumGrid } from './AlbumGrid';
import { FormattedText } from './FormattedText';

// --- Helpers ---

function toReactionInfos(reactions: UIReaction[]) {
  return reactions.map((r) => ({ emoticon: r.emoji, count: r.count, chosen: r.chosen }));
}

// --- Props ---

export type MessageProps = {
  input: MessageInput;
  showSender: boolean;
  senderPhotoUrl?: string;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
};

// --- Main component ---

export function Message({ input, showSender, senderPhotoUrl, onReact }: MessageProps) {
  const ctx: MessageContext = { showSender, senderPhotoUrl };
  const state = useMessage(input, ctx);

  switch (state.layout) {
    case 'service':
      return <PureServiceMessage text={state.text} />;
    case 'pending':
      return <PendingLayout state={state} />;
    case 'sticker':
      return <StickerLayout state={state} onReact={onReact} />;
    case 'bubble':
      return <BubbleLayout state={state} onReact={onReact} />;
    case 'album':
      return <AlbumLayout state={state} onReact={onReact} />;
  }
}

// --- Pending layout ---

function PendingLayout({ state }: { state: PendingRenderState }) {
  return (
    <div
      className={cn(
        'flex justify-end',
        state.status === 'sending' && 'opacity-60',
        state.status === 'failed' && 'opacity-40',
      )}
    >
      <div
        data-testid="message-bubble"
        data-is-outgoing="true"
        className="group/bubble relative max-w-[55%] rounded-2xl bg-message-own px-4 py-2.5"
      >
        <p className="whitespace-pre-wrap break-words text-[13px] leading-[18px] text-text-primary">
          {state.text}
          <span className="float-right h-[18px] w-14" aria-hidden="true" />
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
      </div>
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
        className="size-7 shrink-0 text-[11px]"
      />
      {stickerEl}
    </div>
  );
}

// --- Bubble layout ---

function BubbleLayout({
  state,
  onReact,
}: {
  state: BubbleRenderState;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
}) {
  const { msg, media, displayType, isMediaOnly } = state;
  const ck = msg.contentKind;
  const isPhoto = ck === 'photo';
  const isVideo = ck === 'video' || ck === 'videoNote' || ck === 'animation';
  const isVoice = ck === 'voice';
  const hasMedia = isPhoto || isVideo || isVoice;
  const hasReactions = msg.reactions.length > 0;

  const handleTranscribe = useCallback(() => {
    recognizeSpeech(msg.chatId, msg.id).catch(() => {});
  }, [msg.chatId, msg.id]);

  const bubble = (
    <div
      data-testid="message-bubble"
      data-is-outgoing={msg.isOutgoing ? 'true' : 'false'}
      className={cn(
        'group/bubble relative rounded-2xl px-4 py-2.5',
        msg.isOutgoing ? 'bg-message-own' : 'bg-message-peer',
        hasReactions && 'pb-5',
        state.showAvatar ? 'max-w-[calc(100%-36px)]' : 'max-w-[55%]',
      )}
    >
      <PureReactionPicker onReact={(e, c) => onReact(msg.id, e, c)} />
      {state.showSenderName && (
        <p className="mb-0.5 text-[10px] font-medium text-accent-blue">{msg.senderName}</p>
      )}
      {msg.forwardFromName && <PureForwardHeader fromName={msg.forwardFromName} />}
      {msg.replyPreview ? (
        <PureReplyHeader
          senderName={msg.replyPreview.senderName}
          text={msg.replyPreview.text}
          mediaType={msg.replyPreview.mediaLabel}
          isOutgoing={msg.isOutgoing}
        />
      ) : (
        msg.replyToMessageId > 0 && (
          <PureReplyHeader
            senderName=""
            text={`Reply to message #${msg.replyToMessageId}`}
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
            'whitespace-pre-wrap break-words text-[13px] leading-[18px] text-text-primary',
            hasMedia && 'mt-2',
          )}
        >
          <FormattedText text={msg.text} entities={msg.entities} />
          <span className="float-right h-[18px] w-14" aria-hidden="true" />
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
        <p className="text-sm italic text-text-quaternary">Unsupported message</p>
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
    </div>
  );

  if (!state.showAvatar) return bubble;

  return (
    <div className="flex max-w-[55%] items-end gap-2">
      <UserAvatar
        name={msg.senderName}
        src={state.senderPhotoUrl}
        className="size-7 shrink-0 text-[11px]"
      />
      {bubble}
    </div>
  );
}

// --- Album layout ---

function AlbumLayout({
  state,
  onReact,
}: {
  state: AlbumRenderState;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
}) {
  const { first, messages } = state;
  const hasReactions = first.reactions.length > 0;

  const albumBubble = (
    <div
      data-testid="message-bubble"
      data-is-outgoing={first.isOutgoing ? 'true' : 'false'}
      className={cn(
        'group/bubble relative rounded-2xl px-4 py-2.5',
        first.isOutgoing ? 'bg-message-own' : 'bg-message-peer',
        hasReactions && 'pb-5',
        state.showAvatar ? 'max-w-[calc(100%-36px)]' : 'max-w-[55%]',
      )}
    >
      <PureReactionPicker onReact={(e, c) => onReact(first.id, e, c)} />
      {state.showSenderName && (
        <p className="mb-0.5 text-[10px] font-medium text-accent-blue">{first.senderName}</p>
      )}
      <AlbumGrid messages={messages} chatId={first.chatId} />
      {first.text && (
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-text-primary">
          <FormattedText text={first.text} entities={first.entities} />
          <span className="inline-block w-14 align-baseline" aria-hidden="true">
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
    </div>
  );

  if (!state.showAvatar) return albumBubble;

  return (
    <div className="flex max-w-[55%] items-end gap-2">
      <UserAvatar
        name={first.senderName}
        src={state.senderPhotoUrl}
        className="size-7 shrink-0 text-[11px]"
      />
      {albumBubble}
    </div>
  );
}
