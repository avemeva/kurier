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
  Loader2,
  Megaphone,
  Mic,
  Pin,
  Search,
  Star,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PureOnlineDot } from '@/components/ui/chat/OnlineDot';
import { PureTypingIndicator } from '@/components/ui/chat/TypingIndicator';
import { Separator } from '@/components/ui/separator';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { UserAvatar } from '@/components/ui/user-avatar';
import type { PeerInfo, UIChat, UISearchResult } from '@/data';
import {
  selectContactPhotos,
  selectSearchResults,
  selectUIArchivedChats,
  selectUIChats,
  useChatStore,
  useSidebarPhotoLoader,
} from '@/data';
import { formatTime } from '@/lib/format';
import { log } from '@/lib/log';
import { cn } from '@/lib/utils';
import { EmojiStatusBadge } from './EmojiStatusBadge';

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

type Tab = 'all' | 'archive';

const SEARCH_DEBOUNCE_MS = 900;

// --- Highlight helper ---

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) {
    return <>{text}</>;
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={`${i}-${part}`} className="font-semibold text-accent-brand">
            {part}
          </span>
        ) : (
          <span key={`${i}-${part}`}>{part}</span>
        ),
      )}
    </>
  );
}

// --- Section bar ---

function SectionBar({ label }: { label: string }) {
  return (
    <div className="flex h-7 items-center bg-bg-secondary px-3.5">
      <span className="text-sm text-text-tertiary">{label}</span>
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

function ChatPreviewLine({ chat }: { chat: UIChat }) {
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

// --- Search result row for messages ---

function SearchMessageRow({
  result,
  query,
  onClick,
}: {
  result: UISearchResult;
  query: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-accent"
    >
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar
          name={result.chatTitle || '?'}
          src={result.photoUrl ?? undefined}
          className="size-10 text-sm"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-text-primary">{result.chatTitle}</span>
          {result.date > 0 && (
            <span className="shrink-0 text-xs text-text-quaternary">{formatTime(result.date)}</span>
          )}
        </div>
        <div className="truncate text-xs text-text-tertiary">
          <HighlightedText text={result.text || '\u00A0'} query={query} />
        </div>
      </div>
    </button>
  );
}

// --- Contact / peer result row ---

function PeerResultRow({
  peer,
  profilePhoto,
  onClick,
}: {
  peer: PeerInfo;
  profilePhoto?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-accent"
    >
      <div className="relative shrink-0">
        <UserAvatar name={peer.name} src={profilePhoto} className="size-10 text-sm" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-medium text-text-primary">{peer.name}</span>
        {peer.username && <p className="truncate text-xs text-text-tertiary">@{peer.username}</p>}
      </div>
    </button>
  );
}

// --- Search results view ---

function SearchResults({
  query,
  localMatches,
  contactResults,
  messageResults,
  searchLoading,
  contactsLoading,
  profilePhotos,
  onSelectChat,
  onSelectPeer,
  onSelectMessage,
}: {
  query: string;
  localMatches: UIChat[];
  contactResults: PeerInfo[];
  messageResults: UISearchResult[];
  searchLoading: boolean;
  contactsLoading: boolean;
  profilePhotos: Record<number, string>;
  onSelectChat: (chatId: number) => void;
  onSelectPeer: (peer: PeerInfo) => void;
  onSelectMessage: (msg: UISearchResult) => void;
}) {
  const hasQuery = query.trim().length > 0;
  const hasAnyResults =
    localMatches.length > 0 || contactResults.length > 0 || messageResults.length > 0;
  const isLoading = searchLoading || contactsLoading;

  if (!hasQuery) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-center text-sm text-text-tertiary">Search messages and chats</p>
      </div>
    );
  }

  if (isLoading && !hasAnyResults) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-8">
        <Loader2 size={16} className="animate-spin text-text-tertiary" />
        <p className="text-sm text-text-tertiary">Searching...</p>
      </div>
    );
  }

  if (!isLoading && !hasAnyResults) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-center text-sm text-text-tertiary">No results found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 scrollbar-subtle">
      {localMatches.length > 0 && (
        <>
          <SectionBar label="Chats" />
          {localMatches.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelectChat(chat.id)}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-accent"
            >
              <div className="relative shrink-0">
                <UserAvatar
                  name={chat.title}
                  src={chat.photoUrl ?? undefined}
                  className="size-10 text-sm"
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="truncate text-sm font-medium text-text-primary">
                  <HighlightedText text={chat.title} query={query} />
                </span>
                {chat.lastMessagePreview && (
                  <p className="truncate text-xs text-text-tertiary">{chat.lastMessagePreview}</p>
                )}
              </div>
            </button>
          ))}
        </>
      )}

      {contactResults.length > 0 && (
        <>
          <SectionBar label="Global search results" />
          {contactResults.map((peer) => (
            <PeerResultRow
              key={peer.id}
              peer={peer}
              profilePhoto={profilePhotos[peer.id]}
              onClick={() => onSelectPeer(peer)}
            />
          ))}
        </>
      )}

      {messageResults.length > 0 && (
        <>
          <SectionBar label={`Messages${searchLoading ? ' (searching...)' : ''}`} />
          {messageResults.map((msg) => (
            <SearchMessageRow
              key={`${msg.chatId}-${msg.messageId}`}
              result={msg}
              query={query}
              onClick={() => onSelectMessage(msg)}
            />
          ))}
        </>
      )}

      {isLoading && hasAnyResults && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 size={14} className="animate-spin text-text-tertiary" />
          <p className="text-xs text-text-tertiary">Loading more...</p>
        </div>
      )}
    </div>
  );
}

// --- Main sidebar ---

export function ChatSidebar({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chats = useChatStore(selectUIChats);
  const archivedChats = useChatStore(selectUIArchivedChats);
  const selectedChatId = useChatStore((s) => s.selectedChatId);
  const loadingDialogs = useChatStore((s) => s.loadingDialogs);
  const loadingMoreChats = useChatStore((s) => s.loadingMoreChats);
  const loadingMoreArchivedChats = useChatStore((s) => s.loadingMoreArchivedChats);
  const loadMoreChats = useChatStore((s) => s.loadMoreChats);

  const searchMode = useChatStore((s) => s.searchMode);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const searchResults = useChatStore(selectSearchResults);
  const searchLoading = useChatStore((s) => s.searchLoading);
  const contactResults = useChatStore((s) => s.contactResults);
  const contactsLoading = useChatStore((s) => s.contactsLoading);
  const contactPhotos = useChatStore(selectContactPhotos);

  const openChatById = useChatStore((s) => s.openChatById);
  const openGlobalSearch = useChatStore((s) => s.openGlobalSearch);
  const closeGlobalSearch = useChatStore((s) => s.closeGlobalSearch);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const executeGlobalSearch = useChatStore((s) => s.executeGlobalSearch);
  const executeContactSearch = useChatStore((s) => s.executeContactSearch);

  const isSearchActive = searchMode === 'global';

  const displayedChats = tab === 'all' ? chats : archivedChats;

  // Filter chats locally by search query
  const localMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const allChats = [...chats, ...archivedChats];
    return allChats.filter((c) => c.title.toLowerCase().includes(q)).slice(0, 10);
  }, [searchQuery, chats, archivedChats]);

  // Trigger profile photo loading for sidebar chats without avatars.
  // Uses imperative getState() internally to avoid re-render cycles.
  useSidebarPhotoLoader(displayedChats);

  // Focus search input when search mode opens
  useEffect(() => {
    if (isSearchActive) {
      // Small delay to ensure the input is rendered
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isSearchActive]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const executeSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      log.info(`search: executing for "${trimmed}"`);
      executeGlobalSearch(trimmed);
      executeContactSearch(trimmed);
    },
    [executeGlobalSearch, executeContactSearch],
  );

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      // Clear previous debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (!value.trim()) {
        // Clear results immediately when input is emptied
        executeGlobalSearch('');
        executeContactSearch('');
        return;
      }

      // Debounce the actual search
      debounceTimerRef.current = setTimeout(() => {
        executeSearch(value);
      }, SEARCH_DEBOUNCE_MS);
    },
    [setSearchQuery, executeGlobalSearch, executeContactSearch, executeSearch],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        closeGlobalSearch();
        return;
      }
      if (e.key === 'Enter') {
        // Bypass debounce - search immediately
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        executeSearch(searchQuery);
      }
    },
    [closeGlobalSearch, executeSearch, searchQuery],
  );

  const handleCloseSearch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    closeGlobalSearch();
  }, [closeGlobalSearch]);

  const handleSidebarScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        const isArchive = tab === 'archive';
        loadMoreChats(isArchive);
      }
    },
    [tab, loadMoreChats],
  );

  function handleSelectChat(chatId: number) {
    if (isSearchActive) {
      handleCloseSearch();
    }
    openChatById(chatId);
  }

  function handleSelectPeer(peer: PeerInfo) {
    const existing = [...chats, ...archivedChats].find((c) => c.id === peer.id);
    if (existing) {
      handleSelectChat(existing.id);
      return;
    }
    handleCloseSearch();
    openChatById(peer.id);
  }

  function handleSelectMessage(msg: UISearchResult) {
    const existing = [...chats, ...archivedChats].find((c) => c.id === msg.chatId);
    if (existing) {
      handleSelectChat(existing.id);
      return;
    }
    handleCloseSearch();
    openChatById(msg.chatId);
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-border md:w-80">
      {/* Header with search */}
      {isSearchActive ? (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="relative flex flex-1 items-center">
            <Search size={16} className="pointer-events-none absolute left-3 text-text-tertiary" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              data-testid="search-input"
              placeholder="Search"
              className="h-[35px] w-full rounded-full border border-border bg-bg-secondary pl-9 pr-9 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-brand focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => handleSearchInputChange('')}
                className="absolute right-2.5 rounded-full p-0.5 text-text-tertiary hover:text-text-secondary"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Close search"
            onClick={handleCloseSearch}
            className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-accent hover:text-text-secondary"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-3">
          <h1 data-testid="sidebar-heading" className="text-sm font-bold text-text-primary">
            Chats
          </h1>
          <div className="flex items-center gap-1">
            <button
              data-testid="search-button"
              type="button"
              onClick={openGlobalSearch}
              className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-accent hover:text-text-secondary"
              title="Search"
            >
              <Search size={16} />
            </button>
            <ThemeSwitcher />
            <Button variant="ghost" size="xs" onClick={onLogout}>
              Logout
            </Button>
          </div>
        </div>
      )}
      <Separator />

      {/* Search results mode */}
      {isSearchActive ? (
        <SearchResults
          query={searchQuery}
          localMatches={localMatches}
          contactResults={contactResults}
          messageResults={searchResults}
          searchLoading={searchLoading}
          contactsLoading={contactsLoading}
          profilePhotos={contactPhotos}
          onSelectChat={handleSelectChat}
          onSelectPeer={handleSelectPeer}
          onSelectMessage={handleSelectMessage}
        />
      ) : (
        <>
          {archivedChats.length > 0 && (
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setTab('all')}
                className={cn(
                  'flex-1 py-2 text-xs font-medium transition-colors',
                  tab === 'all'
                    ? 'border-b-2 border-accent-brand text-accent-brand'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTab('archive')}
                className={cn(
                  'flex-1 py-2 text-xs font-medium transition-colors',
                  tab === 'archive'
                    ? 'border-b-2 border-accent-brand text-accent-brand'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
              >
                Archive ({archivedChats.length})
              </button>
            </div>
          )}

          <div
            data-testid="sidebar-scroll"
            className="flex-1 overflow-y-auto px-2 scrollbar-subtle"
            onScroll={handleSidebarScroll}
          >
            {loadingDialogs && (
              <p className="animate-pulse p-4 text-sm text-text-tertiary">Loading chats...</p>
            )}
            {!loadingDialogs && displayedChats.length === 0 && (
              <p className="p-4 text-sm text-text-tertiary">No chats found</p>
            )}
            {displayedChats.map((chat) => {
              return (
                <button
                  key={chat.id}
                  data-testid="dialog-item"
                  type="button"
                  onClick={() => handleSelectChat(chat.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg px-4 py-2 text-left transition-colors hover:bg-accent',
                    selectedChatId === chat.id && 'bg-message-own hover:bg-message-own-hover',
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
                        <span className="truncate">
                          {chat.isSavedMessages ? 'Saved Messages' : chat.title}
                        </span>
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
                          chat.unreadCount === 0 && (
                            <Pin size={12} className="text-text-quaternary" />
                          )}
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
            })}
            {(tab === 'all' ? loadingMoreChats : loadingMoreArchivedChats) && (
              <div
                data-testid="loading-more-chats"
                className="flex items-center justify-center py-3"
              >
                <Loader2 size={16} className="animate-spin text-text-tertiary" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
