import { AtSign, Heart } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { PureCornerButton, PureCornerButtonStack } from '@/components/ui/chat/CornerButtons';
import { PureMessageInput } from '@/components/ui/chat/MessageInput';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useStickToBottom } from '@/hooks/useStickToBottom';
import { scrollToMessage } from '@/lib/scrollToMessage';
import {
  selectChatMessages,
  selectSelectedChat,
  selectUnresolvedPinnedPreviews,
  selectUnresolvedReplies,
  useChatStore,
} from '@/lib/store';
import type { UIMessage, UIPendingMessage } from '@/lib/types';
import { groupUIMessages } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ComposeSearchBottomBar } from './ComposeSearch';
import type { GroupPosition } from './Message';
import { Message } from './Message';

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

export function MessagePanel() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { scrollRef, scrollToBottom } = useStickToBottom();

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
  const profilePhotos = useChatStore((s) => s.profilePhotos);
  const goToNextUnreadMention = useChatStore((s) => s.goToNextUnreadMention);
  const goToNextUnreadReaction = useChatStore((s) => s.goToNextUnreadReaction);

  // Resolve reply previews and thumbnails for messages that need them
  const unresolvedReplies = useChatStore(selectUnresolvedReplies);
  const unresolvedPinned = useChatStore(selectUnresolvedPinnedPreviews);

  useEffect(() => {
    const { resolveReplyPreview, loadReplyThumb } = useChatStore.getState();
    for (const { chatId, messageId } of unresolvedReplies) {
      resolveReplyPreview(chatId, messageId);
      loadReplyThumb(chatId, messageId);
    }
  }, [unresolvedReplies]);

  useEffect(() => {
    const { resolvePinnedPreview } = useChatStore.getState();
    for (const { chatId, messageId } of unresolvedPinned) {
      resolvePinnedPreview(chatId, messageId);
    }
  }, [unresolvedPinned]);

  // Merge refs: useStickToBottom needs its callback ref, useInfiniteScroll needs a ref object
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
      scrollRef(node);
    },
    [scrollRef],
  );

  useInfiniteScroll(scrollContainerRef, {
    onTop: loadOlderMessages,
    onBottom: loadNewerMessages,
    hasOlder,
    hasNewer,
  });

  // Scroll to bottom on chat switch
  const selectedChatId = selectedChat?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollToBottom is stable
  useEffect(() => {
    scrollToBottom();
  }, [selectedChatId]);

  // Scroll to bottom on "go to latest" (isAtLatest: false → true)
  const prevIsAtLatestRef = useRef(isAtLatest);
  useEffect(() => {
    const was = prevIsAtLatestRef.current;
    prevIsAtLatestRef.current = isAtLatest;
    if (!was && isAtLatest) {
      scrollToBottom();
    }
  }, [isAtLatest, scrollToBottom]);

  const handleReplyClick = useCallback(
    async (messageId: number) => {
      const el = scrollContainerRef.current;
      if (!el || !messageId) return;

      // If already in the DOM, just scroll to it
      const existing = el.querySelector(`#msg-${messageId}`);
      if (existing) {
        scrollToMessage(el, messageId);
        return;
      }

      // Load messages around the target, then scroll after render
      await loadMessagesAround(messageId);
      requestAnimationFrame(() => {
        scrollToMessage(el, messageId);
      });
    },
    [loadMessagesAround],
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

  function handleReact(messageId: number, emoticon: string, chosen: boolean) {
    if (!selectedChat) return;
    react(selectedChat.id, messageId, emoticon, chosen);
  }

  const isGroup = selectedChat.kind === 'basicGroup' || selectedChat.kind === 'supergroup';
  const showSender = isGroup;

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
    if (selectedChat?.kind === 'channel') return false;
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
      <div className="relative flex-1">
        <div
          ref={combinedRef}
          data-testid="message-panel"
          className="absolute inset-0 overflow-y-auto px-4 py-3 scrollbar-subtle"
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
            {grouped.map((group, index) => {
              const input =
                group.type === 'album'
                  ? ({ kind: 'album', messages: group.messages } as const)
                  : ({ kind: 'single', message: group.message } as const);
              const isOut = getIsOutgoing(group);
              const isService =
                group.type === 'single' &&
                !('isPending' in group.message) &&
                !!(group.message as UIMessage).serviceText;

              return (
                <div
                  key={getKey(group)}
                  id={`msg-${getKey(group)}`}
                  className={cn(
                    'flex',
                    isService ? 'justify-center' : isOut ? 'sm:justify-end' : 'justify-start',
                  )}
                >
                  <Message
                    input={input}
                    showSender={showSender}
                    senderPhotoUrl={getSenderPhotoUrl(group)}
                    groupPosition={getGroupPosition(index)}
                    onReact={handleReact}
                    onReplyClick={handleReplyClick}
                  />
                </div>
              );
            })}
          </div>
          <div />
        </div>
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
