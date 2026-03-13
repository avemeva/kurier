import { ArrowLeft, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/data';
import { log } from '@/lib/log';

const DEBOUNCE_MS = 900;

/**
 * Global keyboard shortcut handler for in-chat search.
 * - Ctrl/Cmd+F: open search (when a chat is selected)
 * - Escape: close search
 * - F3 / Cmd+G: next result
 * - Shift+F3 / Cmd+Shift+G: previous result
 */
export function useChatSearchKeyboard() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const store = useChatStore.getState();
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd+F: open chat search
      if (mod && e.key === 'f') {
        if (store.selectedChatId && store.searchMode !== 'chat') {
          e.preventDefault();
          store.openChatSearch();
          return;
        }
      }

      // Only handle remaining shortcuts when chat search is active
      if (store.searchMode !== 'chat') return;

      // Escape: close search
      if (e.key === 'Escape') {
        e.preventDefault();
        store.closeChatSearch();
        return;
      }

      // F3: next/prev result
      if (e.key === 'F3') {
        e.preventDefault();
        if (e.shiftKey) {
          store.chatSearchPrev();
        } else {
          store.chatSearchNext();
        }
        return;
      }

      // Cmd+G / Cmd+Shift+G (macOS convention)
      if (mod && e.key === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          store.chatSearchPrev();
        } else {
          store.chatSearchNext();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}

/**
 * TopBar: replaces ChatHeader when in-chat search is active.
 * Contains back arrow, search input, and close button.
 */
export function ComposeSearchTopBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatSearchQuery = useChatStore((s) => s.chatSearchQuery);
  const setChatSearchQuery = useChatStore((s) => s.setChatSearchQuery);
  const executeChatSearch = useChatStore((s) => s.executeChatSearch);
  const closeChatSearch = useChatStore((s) => s.closeChatSearch);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const scheduleSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (!query.trim()) {
        executeChatSearch(query);
        return;
      }
      debounceRef.current = setTimeout(() => {
        log.info(`ComposeSearch: debounced search for "${query}"`);
        executeChatSearch(query);
      }, DEBOUNCE_MS);
    },
    [executeChatSearch],
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const query = e.target.value;
    setChatSearchQuery(query);
    scheduleSearch(query);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Bypass debounce, execute immediately
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      log.info(`ComposeSearch: immediate search for "${chatSearchQuery}"`);
      executeChatSearch(chatSearchQuery);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeChatSearch();
    }
  }

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-2 py-2 backdrop-blur-sm">
      <Button variant="ghost" size="icon-sm" onClick={closeChatSearch} aria-label="Close search">
        <ArrowLeft size={18} />
      </Button>

      <div className="flex flex-1 items-center rounded-lg border border-input bg-background px-3 py-1.5 transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
        <Search size={14} className="mr-2 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={chatSearchQuery}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <Button variant="ghost" size="icon-sm" onClick={closeChatSearch} aria-label="Close search">
        <X size={18} />
      </Button>
    </div>
  );
}

/**
 * BottomBar: replaces MessageInput when in-chat search is active.
 * Contains counter display and prev/next navigation.
 */
export function ComposeSearchBottomBar() {
  const chatSearchCurrentIndex = useChatStore((s) => s.chatSearchCurrentIndex);
  const chatSearchTotalCount = useChatStore((s) => s.chatSearchTotalCount);
  const chatSearchLoading = useChatStore((s) => s.chatSearchLoading);
  const chatSearchQuery = useChatStore((s) => s.chatSearchQuery);
  const chatSearchNext = useChatStore((s) => s.chatSearchNext);
  const chatSearchPrev = useChatStore((s) => s.chatSearchPrev);

  const hasResults = chatSearchTotalCount > 0;
  const hasQuery = chatSearchQuery.trim().length > 0;

  const canPrev = hasResults && chatSearchCurrentIndex > 0;
  const canNext = hasResults && chatSearchCurrentIndex < chatSearchTotalCount - 1;

  let counterText: string;
  if (chatSearchLoading) {
    counterText = 'Searching...';
  } else if (!hasQuery) {
    counterText = '';
  } else if (hasResults) {
    counterText = `${chatSearchCurrentIndex + 1} of ${chatSearchTotalCount}`;
  } else {
    counterText = 'No results';
  }

  return (
    <div className="flex h-12 items-center justify-between border-t border-border px-3">
      {/* Left side: placeholder for calendar/from buttons */}
      <div className="flex items-center gap-1">
        {/* Calendar and From buttons can be added later */}
      </div>

      {/* Center: counter */}
      <span className="text-sm text-text-secondary">{counterText}</span>

      {/* Right side: navigation arrows */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={chatSearchPrev}
          disabled={!canPrev}
          aria-label="Previous result"
        >
          <ChevronUp size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={chatSearchNext}
          disabled={!canNext}
          aria-label="Next result"
        >
          <ChevronDown size={18} />
        </Button>
      </div>
    </div>
  );
}
