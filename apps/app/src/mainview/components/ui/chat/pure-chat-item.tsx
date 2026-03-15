import {
  AtSign,
  Bookmark,
  Bot,
  Camera,
  Check,
  CheckCheck,
  FileText,
  Film,
  Forward,
  Heart,
  Megaphone,
  Mic,
  Pin,
  Star,
  Users,
} from 'lucide-react';
import type { TGChat } from '@/data';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmojiStatusBadge } from '../../chat/emoji-status-badge';
import { UserAvatar } from '../user-avatar';
import { PureOnlineDot } from './online-dot';
import { PureTypingIndicator } from './typing-indicator';

// --- SavedMessages avatar ---

function SavedMessagesAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-accent-brand text-white',
        className,
      )}
    >
      <Bookmark size={20} className="fill-current" />
    </div>
  );
}

// --- Chat preview line (last message preview with media) ---

const MEDIA_ICON_KINDS = {
  photo: Camera,
  video: Film,
  voice: Mic,
  document: FileText,
} as const;

function ChatPreviewLine({ chat }: { chat: TGChat }) {
  const thumbUrl = chat.lastMessageThumbUrl;
  if (chat.draftText) {
    return (
      <span
        data-testid="dialog-preview"
        className="flex min-w-0 items-center gap-1.5 text-sm text-text-tertiary"
      >
        <span className="truncate">
          <span className="text-draft">Draft: </span>
          {chat.draftText}
        </span>
      </span>
    );
  }
  const kind = chat.lastMessageContentKind;
  const IconComponent = kind ? MEDIA_ICON_KINDS[kind as keyof typeof MEDIA_ICON_KINDS] : null;
  const senderPrefix = chat.lastMessageSenderName;
  return (
    <span
      data-testid="dialog-preview"
      className="flex min-w-0 items-center gap-1.5 tg-text-chat text-text-tertiary"
    >
      {chat.lastMessageIsForwarded && (
        <Forward size={14} className="shrink-0 text-text-quaternary" />
      )}
      {thumbUrl && (
        <img src={thumbUrl} alt="" className="size-5 shrink-0 rounded-[3px] object-cover" />
      )}
      {!thumbUrl && IconComponent && (
        <IconComponent size={14} className="shrink-0 text-text-quaternary" />
      )}
      <span className="truncate">
        {senderPrefix && <span className="font-medium text-text-primary">{senderPrefix}: </span>}
        {chat.lastMessagePreview || '\u00A0'}
      </span>
    </span>
  );
}

// --- PureChatItem ---

export type PureChatItemProps = {
  chat: TGChat;
  isSelected: boolean;
  onClick: () => void;
};

export function PureChatItem({ chat, isSelected, onClick }: PureChatItemProps) {
  return (
    <button
      data-testid="dialog-item"
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-4 py-2 text-left transition-colors hover:bg-accent',
        isSelected && 'bg-message-own hover:bg-message-own-hover',
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        {chat.isSavedMessages ? (
          <SavedMessagesAvatar className="size-12" />
        ) : (
          <UserAvatar
            name={chat.title}
            src={chat.photoUrl ?? undefined}
            className="size-12 text-sm"
          />
        )}
        {chat.isOnline && !chat.isSavedMessages && <PureOnlineDot />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            data-testid="dialog-name"
            className="flex min-w-0 items-center gap-1 text-sm font-semibold text-text-primary"
          >
            {chat.kind === 'channel' && (
              <Megaphone size={14} className="shrink-0 text-text-tertiary" />
            )}
            {(chat.kind === 'basicGroup' || chat.kind === 'supergroup') && (
              <Users size={14} className="shrink-0 text-text-tertiary" />
            )}
            {chat.isBot && <Bot size={14} className="shrink-0 text-text-tertiary" />}
            <span className="truncate">{chat.isSavedMessages ? 'Saved Messages' : chat.title}</span>
            {chat.user?.emojiStatusId ? (
              <EmojiStatusBadge documentId={chat.user.emojiStatusId} />
            ) : (
              chat.user?.isPremium && (
                <Star size={12} className="shrink-0 fill-unread text-unread" />
              )
            )}
          </span>
          {chat.lastMessageDate > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs text-text-quaternary">
              {chat.lastMessageStatus === 'read' && (
                <CheckCheck size={14} className="text-unread" />
              )}
              {chat.lastMessageStatus === 'sent' && <Check size={14} />}
              {formatTime(chat.lastMessageDate)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          {chat.typingText ? (
            <PureTypingIndicator text={chat.typingText} />
          ) : (
            <ChatPreviewLine chat={chat} />
          )}
          <div className="flex shrink-0 items-center gap-1">
            {chat.isPinned &&
              chat.unreadMentionCount === 0 &&
              chat.unreadReactionCount === 0 &&
              chat.unreadCount === 0 && <Pin size={12} className="text-text-quaternary" />}
            {chat.unreadMentionCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-9 px-1 text-[10px] font-medium leading-none text-white">
                <AtSign size={10} />
              </span>
            )}
            {chat.unreadCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-badge-muted px-1 text-xs font-medium leading-none text-white dark:bg-unread">
                {chat.unreadCount}
              </span>
            )}
            {chat.unreadReactionCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-9 text-[10px] leading-none text-white">
                <Heart size={10} className="fill-current" />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
