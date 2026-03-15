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
import type { MessageContentKind, TGChat, TGTypingUser } from '@/data';
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

// --- Media label from content kind ---

const MEDIA_LABELS: Partial<Record<MessageContentKind, string>> = {
  photo: 'Photo',
  video: 'Video',
  voice: 'Voice message',
  videoNote: 'Video message',
  sticker: 'Sticker',
  document: 'File',
  animation: 'GIF',
  audio: 'Audio',
  poll: 'Poll',
  contact: 'Contact',
  location: 'Location',
  venue: 'Venue',
  dice: 'Dice',
};

function mediaLabel(kind: MessageContentKind | null): string {
  if (!kind) return '';
  return MEDIA_LABELS[kind] ?? '';
}

// --- Content icon from content kind ---

const MEDIA_ICON_KINDS = {
  photo: Camera,
  video: Film,
  voice: Mic,
  document: FileText,
} as const;

// --- Typing text from structured typing data ---

function formatTypingText(typing: TGTypingUser[]): string {
  if (typing.length === 0) return '';
  // Private chat: single entry with empty name
  if (typing.length === 1 && !typing[0].name) {
    return typing[0].action;
  }
  // Group: group by action
  const byAction = new Map<string, string[]>();
  for (const t of typing) {
    const arr = byAction.get(t.action);
    if (arr) arr.push(t.name);
    else byAction.set(t.action, [t.name]);
  }
  const parts: string[] = [];
  for (const [action, names] of byAction) {
    const verb = names.length === 1 ? 'is' : 'are';
    parts.push(`${names.join(', ')} ${verb} ${action}`);
  }
  return parts.join(', ');
}

// --- Chat preview line (last message preview with media) ---

function ChatPreviewLine({ chat }: { chat: TGChat }) {
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
  const lm = chat.lastMessage;
  if (!lm) {
    return (
      <span
        data-testid="dialog-preview"
        className="flex min-w-0 items-center gap-1.5 tg-text-chat text-text-tertiary"
      >
        <span className="truncate">{'\u00A0'}</span>
      </span>
    );
  }
  const kind = lm.contentKind;
  const IconComponent = kind ? MEDIA_ICON_KINDS[kind as keyof typeof MEDIA_ICON_KINDS] : null;
  // Sender prefix: "You" for own messages in groups, sender name for others in groups
  const senderPrefix =
    lm.isOwnMessage && (chat.kind === 'basicGroup' || chat.kind === 'supergroup')
      ? 'You'
      : lm.senderName;
  // Display text: actual text if available, otherwise media label
  const previewText = lm.text || mediaLabel(kind);
  return (
    <span
      data-testid="dialog-preview"
      className="flex min-w-0 items-center gap-1.5 tg-text-chat text-text-tertiary"
    >
      {lm.isForwarded && <Forward size={14} className="shrink-0 text-text-quaternary" />}
      {lm.thumbUrl && (
        <img src={lm.thumbUrl} alt="" className="size-5 shrink-0 rounded-[3px] object-cover" />
      )}
      {!lm.thumbUrl && IconComponent && (
        <IconComponent size={14} className="shrink-0 text-text-quaternary" />
      )}
      <span className="truncate">
        {senderPrefix && <span className="font-medium text-text-primary">{senderPrefix}: </span>}
        {previewText || '\u00A0'}
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
          {chat.lastMessage && chat.lastMessage.date > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs text-text-quaternary">
              {chat.lastMessage.status === 'read' && (
                <CheckCheck size={14} className="text-unread" />
              )}
              {chat.lastMessage.status === 'sent' && <Check size={14} />}
              {formatTime(chat.lastMessage.date)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          {chat.typing && chat.typing.length > 0 ? (
            <PureTypingIndicator text={formatTypingText(chat.typing)} />
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
