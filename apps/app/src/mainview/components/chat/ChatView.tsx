import { AtSign, Heart } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PureCornerButton, PureCornerButtonStack } from '@/components/ui/chat/CornerButtons';
import { PureMessageInput } from '@/components/ui/chat/MessageInput';
import { useVisibleMessages } from '@/hooks/useVisibleMessages';
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
import type { GroupPosition } from './PureMessageRow';
import { PureMessageRow } from './PureMessageRow';
import type { ScrollContainerHandle } from './ScrollContainer';
import { ScrollContainer } from './ScrollContainer';

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
  const profilePhotos = useChatStore((s) => s.profilePhotos);
  const mediaUrls = useChatStore((s) => s.mediaUrls);
  const thumbUrls = useChatStore((s) => s.thumbUrls);
  const customEmojiUrls = useChatStore((s) => s.customEmojiUrls);
  const recognizeSpeech = useChatStore((s) => s.recognizeSpeech);
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

  // Build a lookup from message id → UIMessage for visible messages
  const messageById = useMemo(() => {
    const map = new Map<number, UIMessage>();
    for (const item of messages) {
      if ('isPending' in item) continue;
      const msg = item as UIMessage;
      map.set(msg.id, msg);
    }
    return map;
  }, [messages]);

  const grouped = useMemo(() => groupUIMessages(messages), [messages]);

  // Map from album's first message ID → all message IDs in the album
  const albumByFirstId = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const group of grouped) {
      if (group.type === 'album') {
        map.set(
          group.messages[0].id,
          group.messages.map((m) => m.id),
        );
      }
    }
    return map;
  }, [grouped]);

  // Trigger media loading for visible messages (expands album groups)
  useEffect(() => {
    if (!selectedChat) return;
    const chatId = selectedChat.id;
    const { loadMedia } = useChatStore.getState();
    for (const msgId of visibleMessageIds) {
      const idsToLoad = albumByFirstId.get(msgId) ?? [msgId];
      for (const id of idsToLoad) {
        const msg = messageById.get(id);
        if (!msg) continue;
        const ck = msg.contentKind;
        if (
          ck === 'photo' ||
          ck === 'video' ||
          ck === 'videoNote' ||
          ck === 'animation' ||
          ck === 'sticker' ||
          ck === 'voice'
        ) {
          const key = `${chatId}_${id}`;
          if (mediaUrls[key] === undefined) {
            loadMedia(chatId, id);
          }
        }
      }
    }
  }, [visibleMessageIds, selectedChat, mediaUrls, messageById, albumByFirstId]);

  // Trigger custom emoji loading for visible messages
  useEffect(() => {
    if (!selectedChat) return;
    const { loadCustomEmojiUrl } = useChatStore.getState();
    const needed = new Set<string>();
    for (const msgId of visibleMessageIds) {
      const msg = messageById.get(msgId);
      if (!msg) continue;
      for (const entity of msg.entities) {
        if (entity.type === 'customEmoji' && entity.customEmojiId) {
          if (customEmojiUrls[entity.customEmojiId] === undefined) {
            needed.add(entity.customEmojiId);
          }
        }
      }
    }
    for (const id of needed) {
      loadCustomEmojiUrl(id);
    }
  }, [visibleMessageIds, selectedChat, customEmojiUrls, messageById]);

  // Trigger forward photo loading for visible messages
  useEffect(() => {
    if (!selectedChat) return;
    const { loadProfilePhoto } = useChatStore.getState();
    for (const msgId of visibleMessageIds) {
      const msg = messageById.get(msgId);
      if (!msg) continue;
      if (msg.forwardFromPhotoId && profilePhotos[msg.forwardFromPhotoId] === undefined) {
        loadProfilePhoto(msg.forwardFromPhotoId);
      }
    }
  }, [visibleMessageIds, selectedChat, profilePhotos, messageById]);

  // Trigger link preview thumb loading for visible messages
  useEffect(() => {
    if (!selectedChat) return;
    const chatId = selectedChat.id;
    const { loadReplyThumb } = useChatStore.getState();
    for (const msgId of visibleMessageIds) {
      const msg = messageById.get(msgId);
      if (!msg?.webPreview) continue;
      const key = `${chatId}_${msgId}`;
      if (thumbUrls[key] === undefined) {
        loadReplyThumb(chatId, msgId);
      }
    }
  }, [visibleMessageIds, selectedChat, thumbUrls, messageById]);

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

              // Resolve media props for this group
              const chatId = selectedChat.id;
              const msg: UIMessage | null =
                group.type === 'album'
                  ? group.messages[0]
                  : group.type === 'single' && !('isPending' in group.message)
                    ? (group.message as UIMessage)
                    : null;
              const msgId = msg?.id ?? 0;

              // Media URL for single messages
              const mediaKey = msgId ? `${chatId}_${msgId}` : '';
              const mediaEntry = mediaKey ? mediaUrls[mediaKey] : undefined;

              // Album media
              const albumMedia =
                group.type === 'album'
                  ? group.messages.map((m) => {
                      const key = `${chatId}_${m.id}`;
                      const entry = mediaUrls[key];
                      return { url: entry ?? null, loading: entry === undefined };
                    })
                  : undefined;

              // Forward photo
              const forwardPhotoUrl = msg?.forwardFromPhotoId
                ? profilePhotos[msg.forwardFromPhotoId]
                : undefined;

              // Reply thumb
              const replyThumbUrl = msg?.replyToMessageId
                ? (thumbUrls[`${chatId}_${msg.replyToMessageId}`] ?? null)
                : undefined;

              // Link preview thumb
              const linkPreviewThumbUrl = msg?.webPreview
                ? (thumbUrls[`${chatId}_${msg.id}`] ?? null)
                : undefined;

              // Custom emoji URLs subset for this message's entities
              const msgEntities = msg?.entities ?? [];
              const emojiIds = msgEntities
                .filter((e) => e.type === 'customEmoji' && e.customEmojiId)
                .map((e) => e.customEmojiId!);
              const msgCustomEmojiUrls =
                emojiIds.length > 0
                  ? Object.fromEntries(
                      emojiIds
                        .filter((id) => customEmojiUrls[id])
                        .map((id) => [id, customEmojiUrls[id]]),
                    )
                  : undefined;

              return (
                <div
                  key={getKey(group)}
                  id={`msg-${getKey(group)}`}
                  className={cn(
                    'flex',
                    isService ? 'justify-center' : isOut ? 'sm:justify-end' : 'justify-start',
                  )}
                >
                  <PureMessageRow
                    input={input}
                    showSender={showSender}
                    senderPhotoUrl={getSenderPhotoUrl(group)}
                    groupPosition={getGroupPosition(index)}
                    onReact={handleReact}
                    onReplyClick={handleReplyClick}
                    mediaUrl={mediaEntry !== undefined ? (mediaEntry ?? null) : undefined}
                    mediaLoading={mediaEntry === undefined}
                    replyThumbUrl={replyThumbUrl}
                    forwardPhotoUrl={forwardPhotoUrl}
                    linkPreviewThumbUrl={linkPreviewThumbUrl}
                    onTranscribe={handleTranscribe}
                    albumMedia={albumMedia}
                    customEmojiUrls={msgCustomEmojiUrls}
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
