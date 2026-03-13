import { AtSign, Heart } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { PureCornerButton, PureCornerButtonStack } from '@/components/ui/chat/corner-buttons';
import { PureMessageInput } from '@/components/ui/chat/message-input';
import type { GroupPosition } from '@/components/ui/chat/pure-message-row';
import { PureMessageRow } from '@/components/ui/chat/pure-message-row';
import type { ScrollContainerHandle } from '@/components/ui/chat/scroll-container';
import { ScrollContainer } from '@/components/ui/chat/scroll-container';
import type { TGMessage } from '@/data';
import { selectChatMessages, selectSelectedChat, useChatMessageLoader, useChatStore } from '@/data';
import { useVisibleMessages } from '@/hooks/use-visible-messages';
import { cn } from '@/lib/utils';
import { ComposeSearchBottomBar } from './compose-search';

const ArrowDownIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function ChatView() {
  const scrollContainerRef = useRef<ScrollContainerHandle>(null);
  const getScrollElement = useCallback(
    () => scrollContainerRef.current?.getScrollElement() ?? null,
    [],
  );
  const visibleMessageIds = useVisibleMessages(getScrollElement);

  const selectedChat = useChatStore(selectSelectedChat);
  const messages = useChatStore(selectChatMessages);
  const loadingMessages = useChatStore((s) => s.loadingMessages);
  const loadingOlderMessages = useChatStore((s) => s.loadingOlderMessages);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const loadNewerMessages = useChatStore((s) => s.loadNewerMessages);
  const loadLatestMessages = useChatStore((s) => s.loadLatestMessages);
  const hasOlder = useChatStore((s) =>
    s.selectedChatId ? (s.hasOlder[s.selectedChatId] ?? false) : false,
  );
  const hasNewer = useChatStore((s) =>
    s.selectedChatId ? (s.hasNewer[s.selectedChatId] ?? false) : false,
  );
  const isAtLatest = useChatStore((s) =>
    s.selectedChatId ? (s.isAtLatest[s.selectedChatId] ?? true) : true,
  );
  const loadMessagesAround = useChatStore((s) => s.loadMessagesAround);
  const send = useChatStore((s) => s.send);
  const react = useChatStore((s) => s.react);
  const searchMode = useChatStore((s) => s.searchMode);
  const recognizeSpeech = useChatStore((s) => s.recognizeSpeech);
  const goToNextUnreadMention = useChatStore((s) => s.goToNextUnreadMention);
  const goToNextUnreadReaction = useChatStore((s) => s.goToNextUnreadReaction);

  // One hook handles all media loading for visible messages
  useChatMessageLoader(messages, visibleMessageIds);

  const selectedChatId = selectedChat?.id;

  const handleReplyClick = useCallback(
    async (messageId: number) => {
      const el = scrollContainerRef.current?.getScrollElement();
      if (!el || !messageId) return;

      // If already in the DOM, just scroll to it
      const existing = el.querySelector(`#msg-${messageId}`);
      if (existing) {
        scrollContainerRef.current?.scrollToMessage(messageId);
        return;
      }

      // Load messages around the target, then scroll after render
      await loadMessagesAround(messageId);
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollToMessage(messageId);
      });
    },
    [loadMessagesAround],
  );

  const handleReact = useCallback(
    (messageId: number, emoticon: string, chosen: boolean) => {
      if (!selectedChat) return;
      react(selectedChat.id, messageId, emoticon, chosen);
    },
    [selectedChat, react],
  );

  const handleTranscribe = useCallback(
    (chatId: number, msgId: number) => {
      recognizeSpeech(chatId, msgId);
    },
    [recognizeSpeech],
  );

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

  const isGroup = selectedChat.kind === 'basicGroup' || selectedChat.kind === 'supergroup';
  const showSender = isGroup;

  function getKey(msg: TGMessage): string | number {
    if (msg.kind === 'pending') return msg.localId;
    return msg.id;
  }

  function getIsOutgoing(msg: TGMessage): boolean {
    if (selectedChat?.kind === 'channel') return false;
    if (msg.kind === 'pending') return true;
    if (msg.kind === 'service') return false;
    return msg.isOutgoing;
  }

  function getSenderId(msg: TGMessage): number | string {
    if (msg.kind === 'pending') return `pending-${msg.localId}`;
    if (msg.kind === 'service') return msg.sender.userId;
    return msg.sender.userId;
  }

  function getGroupPosition(index: number): GroupPosition {
    const cur = getSenderId(messages[index]);
    const curOut = getIsOutgoing(messages[index]);
    const prev = index > 0 ? getSenderId(messages[index - 1]) : null;
    const prevOut = index > 0 ? getIsOutgoing(messages[index - 1]) : null;
    const next = index < messages.length - 1 ? getSenderId(messages[index + 1]) : null;
    const nextOut = index < messages.length - 1 ? getIsOutgoing(messages[index + 1]) : null;
    const samePrev = prev === cur && prevOut === curOut;
    const sameNext = next === cur && nextOut === curOut;
    if (samePrev && sameNext) return 'middle';
    if (samePrev) return 'last';
    if (sameNext) return 'first';
    return 'single';
  }

  return (
    <>
      <div className="relative flex-1">
        <ScrollContainer
          ref={scrollContainerRef}
          chatId={selectedChatId}
          isAtLatest={isAtLatest}
          hasOlder={hasOlder}
          hasNewer={hasNewer}
          loadingOlder={loadingOlderMessages}
          onReachTop={loadOlderMessages}
          onReachBottom={loadNewerMessages}
        >
          {loadingOlderMessages && (
            <p className="shimmer py-4 text-center text-sm text-text-tertiary">
              Loading older messages...
            </p>
          )}
          {loadingMessages && (
            <p className="shimmer py-8 text-center text-sm text-text-tertiary">
              Loading messages...
            </p>
          )}
          {!loadingMessages && messages.length === 0 && (
            <p className="py-8 text-center text-sm text-text-tertiary">No messages</p>
          )}
          <div className="mx-auto max-w-[720px] space-y-1">
            {messages.map((msg, index) => {
              const isOut = getIsOutgoing(msg);
              const isService = msg.kind === 'service';

              return (
                <div
                  key={getKey(msg)}
                  id={`msg-${getKey(msg)}`}
                  className={cn(
                    'flex',
                    isService ? 'justify-center' : isOut ? 'sm:justify-end' : 'justify-start',
                  )}
                >
                  <PureMessageRow
                    msg={msg}
                    showSender={showSender}
                    groupPosition={getGroupPosition(index)}
                    onReact={handleReact}
                    onReplyClick={handleReplyClick}
                    onTranscribe={handleTranscribe}
                  />
                </div>
              );
            })}
          </div>
          <div />
        </ScrollContainer>
        <PureCornerButtonStack>
          {selectedChat.unreadReactionCount > 0 && (
            <PureCornerButton
              icon={<Heart size={18} className="text-text-secondary" />}
              count={selectedChat.unreadReactionCount}
              onClick={goToNextUnreadReaction}
            />
          )}
          {selectedChat.unreadMentionCount > 0 && (
            <PureCornerButton
              icon={<AtSign size={18} className="text-accent-blue" />}
              count={selectedChat.unreadMentionCount}
              onClick={goToNextUnreadMention}
            />
          )}
          {!isAtLatest && (
            <PureCornerButton icon={<ArrowDownIcon />} onClick={loadLatestMessages} />
          )}
        </PureCornerButtonStack>
      </div>

      {searchMode === 'chat' ? (
        <ComposeSearchBottomBar />
      ) : (
        <PureMessageInput onSend={handleSend} />
      )}
    </>
  );
}
