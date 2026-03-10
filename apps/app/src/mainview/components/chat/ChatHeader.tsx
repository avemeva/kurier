import { Bookmark, Search, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PureStatusText } from '@/components/ui/chat/StatusText';
import { UserAvatar } from '@/components/ui/user-avatar';
import { selectHeaderStatus, selectSelectedChat, selectUIUser, useChatStore } from '@/lib/store';
import { EmojiStatusBadge } from './EmojiStatusBadge';

export function ChatHeader() {
  const selectedChat = useChatStore(selectSelectedChat);
  const headerStatus = useChatStore(selectHeaderStatus);
  const openChatSearch = useChatStore((s) => s.openChatSearch);
  const user = useChatStore((s) => selectUIUser(s, selectedChat?.userId ?? 0));
  const avatarId = selectedChat?.userId || selectedChat?.id;
  const avatarSrc = useChatStore((s) => (avatarId ? s.profilePhotos[avatarId] : undefined));

  if (!selectedChat) return null;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
      {selectedChat.isSavedMessages ? (
        <div className="flex size-8 items-center justify-center rounded-full bg-accent-blue text-white">
          <Bookmark size={16} className="fill-current" />
        </div>
      ) : (
        <UserAvatar name={selectedChat.title} src={avatarSrc} className="size-8 text-sm" />
      )}
      <div className="flex-1">
        <h2
          data-testid="chat-title"
          className="flex items-center gap-1 text-sm font-medium text-text-primary"
        >
          {selectedChat.isSavedMessages ? 'Saved Messages' : selectedChat.title}
          {user?.emojiStatusId ? (
            <EmojiStatusBadge documentId={user.emojiStatusId} />
          ) : (
            user?.isPremium && <Star size={12} className="shrink-0 fill-unread text-unread" />
          )}
        </h2>
        <PureStatusText status={headerStatus} />
      </div>
      <Button variant="ghost" size="icon-sm" onClick={openChatSearch} aria-label="Search in chat">
        <Search size={18} />
      </Button>
    </div>
  );
}
