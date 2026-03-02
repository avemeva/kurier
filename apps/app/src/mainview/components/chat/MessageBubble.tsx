import { PureLinkPreviewCard } from '@/components/ui/chat/LinkPreviewCard';
import type { InfoDisplayType } from '@/components/ui/chat/MessageTime';
import { PureMessageTime } from '@/components/ui/chat/MessageTime';
import { PureReactionBar, PureReactionPicker } from '@/components/ui/chat/ReactionBar';
import { PureReplyHeader } from '@/components/ui/chat/ReplyHeader';
import { UserAvatar } from '@/components/ui/user-avatar';
import type { UIMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FormattedText } from './FormattedText';
import { MessagePhoto } from './MessagePhoto';
import { MessageVideo } from './MessageVideo';
import { MessageVoice } from './MessageVoice';

function getDisplayType(msg: UIMessage): InfoDisplayType {
  const contentKind = msg.contentKind;
  if (contentKind === 'sticker') return 'background';
  if (
    contentKind === 'photo' ||
    contentKind === 'video' ||
    contentKind === 'videoNote' ||
    contentKind === 'animation'
  ) {
    if (msg.text) return 'default';
    return 'image';
  }
  return 'default';
}

export function MessageBubble({
  msg,
  showSender,
  onReact,
  senderPhotoUrl,
}: {
  msg: UIMessage;
  showSender: boolean;
  onReact: (emoticon: string, chosen: boolean) => void;
  senderPhotoUrl?: string;
}) {
  const contentKind = msg.contentKind;
  const isSticker = contentKind === 'sticker';
  const isPhoto = contentKind === 'photo';
  const isVideo =
    contentKind === 'video' || contentKind === 'videoNote' || contentKind === 'animation';
  const isVoice = contentKind === 'voice';

  const text = msg.text;
  const entities = msg.entities;
  const mediaLabel = msg.mediaLabel;
  const reactions = msg.reactions;
  const hasMedia = isPhoto || isSticker || isVideo || isVoice;
  const hasReactions = reactions.length > 0;
  const showAvatar = showSender && !msg.isOutgoing;
  const displayType = getDisplayType(msg);
  const senderName = msg.senderName;

  const webPreview = msg.webPreview;

  /* ── Sticker: no bubble, constrained size ── */
  if (isSticker) {
    const sticker = (
      <div className="group/bubble relative max-w-[224px]">
        <PureReactionPicker onReact={onReact} />
        <MessagePhoto chatId={msg.chatId} messageId={msg.id} />
        {hasReactions && (
          <PureReactionBar
            reactions={reactions.map((r) => ({
              emoticon: r.emoji,
              count: r.count,
              chosen: r.chosen,
            }))}
            onReact={onReact}
          />
        )}
        <span className="mt-0.5 flex justify-end">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            displayType="background"
          />
        </span>
      </div>
    );

    if (!showAvatar) return sticker;

    return (
      <div className="flex items-end gap-2">
        <UserAvatar
          name={senderName}
          src={senderPhotoUrl}
          className="size-7 shrink-0 text-[11px]"
        />
        {sticker}
      </div>
    );
  }

  /* ── Regular bubble ── */
  const isMediaOnly = (isPhoto || isVideo) && !text;

  const bubble = (
    <div
      data-testid="message-bubble"
      className={cn(
        'group/bubble relative rounded-2xl px-4 py-2.5',
        msg.isOutgoing ? 'bg-message-own' : 'bg-message-peer',
        hasReactions && 'pb-5',
        showAvatar ? 'max-w-[calc(100%-36px)]' : 'max-w-[55%]',
      )}
    >
      <PureReactionPicker onReact={onReact} />
      {showSender && !msg.isOutgoing && (
        <p className="mb-0.5 text-[10px] font-medium text-accent-blue">{senderName}</p>
      )}
      {msg.replyToMessageId > 0 && (
        <PureReplyHeader
          senderName=""
          text={`Reply to message #${msg.replyToMessageId}`}
          mediaType=""
          isOutgoing={msg.isOutgoing}
        />
      )}
      {isPhoto && <MessagePhoto chatId={msg.chatId} messageId={msg.id} />}
      {isVideo && (
        <MessageVideo
          chatId={msg.chatId}
          messageId={msg.id}
          isCircle={contentKind === 'videoNote'}
          isGif={contentKind === 'animation'}
        />
      )}
      {isVoice && <MessageVoice chatId={msg.chatId} messageId={msg.id} />}
      {!isPhoto && !isVideo && !isVoice && mediaLabel && (
        <p className="text-xs italic text-text-tertiary">{mediaLabel}</p>
      )}
      {text && (
        <p
          className={cn(
            'whitespace-pre-wrap break-words text-[13px] leading-[18px] text-text-primary',
            hasMedia && 'mt-2',
          )}
        >
          <FormattedText text={text} entities={entities} />
          <span className="float-right h-[18px] w-14" aria-hidden="true" />
        </p>
      )}
      {webPreview && (
        <PureLinkPreviewCard
          preview={{
            url: webPreview.url,
            siteName: webPreview.siteName,
            title: webPreview.title,
            description: webPreview.description,
          }}
        />
      )}
      {!text && !mediaLabel && (
        <p className="text-sm italic text-text-quaternary">Unsupported message</p>
      )}
      {hasReactions && (
        <PureReactionBar
          reactions={reactions.map((r) => ({
            emoticon: r.emoji,
            count: r.count,
            chosen: r.chosen,
          }))}
          onReact={onReact}
        />
      )}
      {isMediaOnly ? (
        <span className="absolute bottom-2 right-2">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            displayType={displayType}
          />
        </span>
      ) : (
        <span className="absolute bottom-1 right-2">
          <PureMessageTime
            date={msg.date}
            out={msg.isOutgoing}
            read={msg.isRead}
            displayType={displayType}
          />
        </span>
      )}
    </div>
  );

  if (!showAvatar) return bubble;

  return (
    <div className="flex max-w-[55%] items-end gap-2">
      <UserAvatar name={senderName} src={senderPhotoUrl} className="size-7 shrink-0 text-[11px]" />
      {bubble}
    </div>
  );
}
