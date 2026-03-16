import { AtSign, Heart } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { PureCornerButton, PureCornerButtonStack } from '@/components/ui/chat/corner-buttons';
import { PureMessageInput } from '@/components/ui/chat/message-input';
import { PureChatView } from '@/components/ui/chat/pure-chat-view';
import type { ScrollContainerHandle } from '@/components/ui/chat/scroll-container';
import { ScrollContainer } from '@/components/ui/chat/scroll-container';
import { selectChatMessages, selectSelectedChat, useChatMessageLoader, useChatStore } from '@/data';
import { useVisibleMessages } from '@/hooks/use-visible-messages';
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
  const openDocument = useChatStore((s) => s.openDocument);
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

  const handleOpenDocument = useCallback(
    (chatId: number, msgId: number) => {
      openDocument(chatId, msgId);
    },
    [openDocument],
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
          <PureChatView
            messages={messages}
            chatKind={selectedChat.kind}
            onReact={handleReact}
            onReplyClick={handleReplyClick}
            onTranscribe={handleTranscribe}
            onOpenDocument={handleOpenDocument}
          />
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
