import { useCallback, useEffect, useRef } from 'react';
import { PureMessageInput } from '@/components/ui/chat/MessageInput';
import { PureMessageTime } from '@/components/ui/chat/MessageTime';
import { PureReactionBar, PureReactionPicker } from '@/components/ui/chat/ReactionBar';
import { UserAvatar } from '@/components/ui/user-avatar';
import { selectChatMessages, selectSelectedChat, useChatStore } from '@/lib/store';
import type { UIMessage, UIPendingMessage } from '@/lib/types';
import { groupUIMessages } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlbumGrid } from './AlbumGrid';
import { ComposeSearchBottomBar } from './ComposeSearch';
import { FormattedText } from './FormattedText';
import { MessageBubble } from './MessageBubble';

export function MessagePanel() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  // Block scroll-triggered loads until user scrolls down past the threshold
  const canLoadRef = useRef(false);

  const selectedChat = useChatStore(selectSelectedChat);
  const messages = useChatStore(selectChatMessages);
  const loadingMessages = useChatStore((s) => s.loadingMessages);
  const loadingOlderMessages = useChatStore((s) => s.loadingOlderMessages);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const hasMoreMessages = useChatStore((s) =>
    s.selectedChatId ? (s.hasMoreMessages[s.selectedChatId] ?? false) : false,
  );
  const send = useChatStore((s) => s.send);
  const react = useChatStore((s) => s.react);
  const searchMode = useChatStore((s) => s.searchMode);
  const profilePhotos = useChatStore((s) => s.profilePhotos);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages.length > 0 && prevMessageCountRef.current === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      // Allow loading after initial scroll settles
      canLoadRef.current = false;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  // Reset on chat change
  const selectedChatId = selectedChat?.id;
  useEffect(() => {
    if (selectedChatId === undefined) return;
    prevMessageCountRef.current = 0;
    prevScrollHeightRef.current = 0;
    canLoadRef.current = false;
  }, [selectedChatId]);

  // Preserve scroll position when older messages are prepended
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (prevMessageCountRef.current > 0 && messages.length > prevMessageCountRef.current) {
      const addedHeight = el.scrollHeight - prevScrollHeightRef.current;
      if (addedHeight > 0 && el.scrollTop < 300) {
        el.scrollTop += addedHeight;
        // After restoring position, block loads until user scrolls down again
        canLoadRef.current = false;
      }
    }
    prevScrollHeightRef.current = el.scrollHeight;
  });

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Once user scrolls past 500px from top, arm the trigger
    if (el.scrollTop > 500) {
      canLoadRef.current = true;
    }

    if (!canLoadRef.current || loadingOlderMessages || !hasMoreMessages) return;

    // Load when within 200px of the top
    if (el.scrollTop < 200) {
      canLoadRef.current = false;
      loadOlderMessages();
    }
  }, [loadingOlderMessages, hasMoreMessages, loadOlderMessages]);

  if (!selectedChat) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-text-quaternary">Select a chat to view messages</p>
      </div>
    );
  }

  async function handleSend(text: string) {
    if (!selectedChat) return;
    send(selectedChat.id, text);
  }

  function handleReact(messageId: number, emoticon: string, chosen: boolean) {
    if (!selectedChat) return;
    react(selectedChat.id, messageId, emoticon, chosen);
  }

  const isGroup = selectedChat.kind === 'basicGroup' || selectedChat.kind === 'supergroup';
  const isChannel = selectedChat.kind === 'channel';
  const showSender = isGroup || isChannel;

  const grouped = groupUIMessages(messages);

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 scrollbar-subtle"
      >
        {loadingOlderMessages && (
          <p className="shimmer py-4 text-center text-sm text-text-tertiary">
            Loading older messages...
          </p>
        )}
        {loadingMessages && (
          <p className="shimmer py-8 text-center text-sm text-text-tertiary">Loading messages...</p>
        )}
        {!loadingMessages && messages.length === 0 && (
          <p className="py-8 text-center text-sm text-text-tertiary">No messages</p>
        )}
        <div className="space-y-1">
          {grouped.map((group) => {
            if (group.type === 'album') {
              const first = group.messages[0];
              const albumHasReactions = first.reactions.length > 0;
              const albumShowAvatar = showSender && !first.isOutgoing;

              const albumBubble = (
                <div
                  data-testid="message-bubble"
                  className={cn(
                    'group/bubble relative rounded-2xl px-4 py-2.5',
                    first.isOutgoing ? 'bg-message-own' : 'bg-message-peer',
                    albumHasReactions && 'pb-5',
                    albumShowAvatar ? 'max-w-[calc(100%-36px)]' : 'max-w-[55%]',
                  )}
                >
                  <PureReactionPicker onReact={(e, c) => handleReact(first.id, e, c)} />
                  {showSender && !first.isOutgoing && (
                    <p className="mb-0.5 text-[10px] font-medium text-accent-blue">
                      {first.senderName}
                    </p>
                  )}
                  <AlbumGrid messages={group.messages} chatId={selectedChat.id} />
                  {first.text && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-text-primary">
                      <FormattedText text={first.text} entities={first.entities} />
                      <span className="inline-block w-14 align-baseline" aria-hidden="true">
                        {'\u00A0'}
                      </span>
                    </p>
                  )}
                  {albumHasReactions && (
                    <PureReactionBar
                      reactions={first.reactions.map((r) => ({
                        emoticon: r.emoji,
                        count: r.count,
                        chosen: r.chosen,
                      }))}
                      onReact={(e, c) => handleReact(first.id, e, c)}
                    />
                  )}
                  <span className="absolute bottom-1 right-2">
                    <PureMessageTime
                      date={first.date}
                      out={first.isOutgoing}
                      read={first.isRead}
                      displayType={first.text ? 'default' : 'image'}
                    />
                  </span>
                </div>
              );

              return (
                <div
                  key={first.id}
                  className={cn('flex', first.isOutgoing ? 'justify-end' : 'justify-start')}
                >
                  {albumShowAvatar ? (
                    <div className="flex max-w-[55%] items-end gap-2">
                      <UserAvatar
                        name={first.senderName}
                        src={profilePhotos[first.senderUserId]}
                        className="size-7 shrink-0 text-[11px]"
                      />
                      {albumBubble}
                    </div>
                  ) : (
                    albumBubble
                  )}
                </div>
              );
            }

            const msg = group.message;
            const isPending = 'isPending' in msg;
            const pendingStatus = isPending ? (msg as UIPendingMessage).status : null;

            if (isPending) {
              const pmsg = msg as UIPendingMessage;
              return (
                <div
                  key={pmsg.localId}
                  className={cn(
                    'flex justify-end',
                    pendingStatus === 'sending' && 'opacity-60',
                    pendingStatus === 'failed' && 'opacity-40',
                  )}
                >
                  <div
                    data-testid="message-bubble"
                    className="group/bubble relative max-w-[55%] rounded-2xl bg-message-own px-4 py-2.5"
                  >
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-[18px] text-text-primary">
                      {pmsg.text}
                      <span className="float-right h-[18px] w-14" aria-hidden="true" />
                    </p>
                    <span className="absolute bottom-1 right-2">
                      <PureMessageTime
                        date={pmsg.date}
                        out={true}
                        read={false}
                        displayType="default"
                      />
                    </span>
                  </div>
                </div>
              );
            }

            const uiMsg = msg as UIMessage;
            return (
              <div
                key={uiMsg.id}
                className={cn('flex', uiMsg.isOutgoing ? 'justify-end' : 'justify-start')}
              >
                <MessageBubble
                  msg={uiMsg}
                  showSender={showSender}
                  onReact={(e, c) => handleReact(uiMsg.id, e, c)}
                  senderPhotoUrl={profilePhotos[uiMsg.senderUserId]}
                />
              </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {searchMode === 'chat' ? (
        <ComposeSearchBottomBar />
      ) : (
        <PureMessageInput onSend={handleSend} />
      )}
    </>
  );
}
