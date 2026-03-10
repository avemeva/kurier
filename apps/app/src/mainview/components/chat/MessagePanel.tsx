import { useCallback, useEffect, useRef } from 'react';
import { PureMessageInput } from '@/components/ui/chat/MessageInput';
import { selectChatMessages, selectSelectedChat, useChatStore } from '@/lib/store';
import type { UIMessage, UIPendingMessage } from '@/lib/types';
import { groupUIMessages } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ComposeSearchBottomBar } from './ComposeSearch';
import type { GroupPosition } from './Message';
import { Message } from './Message';

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

  function getKey(group: (typeof grouped)[number]): string | number {
    if (group.type === 'album') return group.messages[0].id;
    const msg = group.message;
    return 'isPending' in msg ? (msg as UIPendingMessage).localId : (msg as UIMessage).id;
  }

  function getSenderPhotoUrl(group: (typeof grouped)[number]): string | undefined {
    if (group.type === 'album') return profilePhotos[group.messages[0].senderUserId];
    const msg = group.message;
    if ('isPending' in msg) return undefined;
    return profilePhotos[(msg as UIMessage).senderUserId];
  }

  function getIsOutgoing(group: (typeof grouped)[number]): boolean {
    if (group.type === 'album') return group.messages[0].isOutgoing;
    const msg = group.message;
    if ('isPending' in msg) return true;
    return (msg as UIMessage).isOutgoing;
  }

  function getSenderId(group: (typeof grouped)[number]): number | string {
    if (group.type === 'album') return group.messages[0].senderUserId;
    const msg = group.message;
    if ('isPending' in msg) return `pending-${(msg as UIPendingMessage).localId}`;
    return (msg as UIMessage).senderUserId;
  }

  function getGroupPosition(index: number): GroupPosition {
    const cur = getSenderId(grouped[index]);
    const curOut = getIsOutgoing(grouped[index]);
    const prev = index > 0 ? getSenderId(grouped[index - 1]) : null;
    const prevOut = index > 0 ? getIsOutgoing(grouped[index - 1]) : null;
    const next = index < grouped.length - 1 ? getSenderId(grouped[index + 1]) : null;
    const nextOut = index < grouped.length - 1 ? getIsOutgoing(grouped[index + 1]) : null;
    const samePrev = prev === cur && prevOut === curOut;
    const sameNext = next === cur && nextOut === curOut;
    if (samePrev && sameNext) return 'middle';
    if (samePrev) return 'last';
    if (sameNext) return 'first';
    return 'single';
  }

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        data-testid="message-panel"
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
        <div className="max-w-[720px] space-y-1">
          {grouped.map((group, index) => {
            const input =
              group.type === 'album'
                ? ({ kind: 'album', messages: group.messages } as const)
                : ({ kind: 'single', message: group.message } as const);
            const isOut = getIsOutgoing(group);

            return (
              <div
                key={getKey(group)}
                className={cn('flex', isOut ? 'justify-end' : 'justify-start')}
              >
                <Message
                  input={input}
                  showSender={showSender}
                  senderPhotoUrl={getSenderPhotoUrl(group)}
                  groupPosition={getGroupPosition(index)}
                  onReact={handleReact}
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
