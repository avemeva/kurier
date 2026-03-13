import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useStickToBottom } from '@/hooks/use-stick-to-bottom';
import { scrollToMessage } from '@/lib/scroll-to-message';

export interface ScrollContainerProps {
  chatId: number | undefined;
  isAtLatest: boolean;
  hasOlder: boolean;
  hasNewer: boolean;
  loadingOlder: boolean;
  onReachTop: () => void;
  onReachBottom: () => void;
  children: React.ReactNode;
}

export interface ScrollContainerHandle {
  scrollToMessage: (messageId: number) => void;
  scrollToBottom: () => void;
  getScrollElement: () => HTMLDivElement | null;
}

export const ScrollContainer = forwardRef<ScrollContainerHandle, ScrollContainerProps>(
  function ScrollContainer(
    { chatId, isAtLatest, hasOlder, hasNewer, loadingOlder, onReachTop, onReachBottom, children },
    ref,
  ) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { scrollRef, scrollToBottom } = useStickToBottom();

    // Merge refs: useStickToBottom needs its callback ref, useInfiniteScroll needs a ref object
    const combinedRef = useCallback(
      (node: HTMLDivElement | null) => {
        scrollContainerRef.current = node;
        scrollRef(node);
      },
      [scrollRef],
    );

    useInfiniteScroll(scrollContainerRef, {
      onTop: onReachTop,
      onBottom: onReachBottom,
      hasOlder,
      hasNewer,
    });

    // Scroll to bottom on chat switch
    // biome-ignore lint/correctness/useExhaustiveDependencies: scrollToBottom is stable
    useEffect(() => {
      scrollToBottom();
    }, [chatId]);

    // Scroll to bottom on "go to latest" (isAtLatest: false -> true)
    const prevIsAtLatestRef = useRef(isAtLatest);
    useEffect(() => {
      const was = prevIsAtLatestRef.current;
      prevIsAtLatestRef.current = isAtLatest;
      if (!was && isAtLatest) {
        scrollToBottom();
      }
    }, [isAtLatest, scrollToBottom]);

    // Scroll position preservation when older messages are prepended.
    // Phase 1: capture scroll state during render (before DOM commit).
    const scrollSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
    const wasLoadingOlderRef = useRef(loadingOlder);
    if (scrollContainerRef.current) {
      scrollSnapshotRef.current = {
        scrollHeight: scrollContainerRef.current.scrollHeight,
        scrollTop: scrollContainerRef.current.scrollTop,
      };
    }

    // Phase 2: after DOM commit, adjust scrollTop so the user's viewport stays put.
    // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot ref is intentionally read from render phase
    useLayoutEffect(() => {
      const el = scrollContainerRef.current;
      const snapshot = scrollSnapshotRef.current;
      if (el && snapshot && wasLoadingOlderRef.current && !loadingOlder) {
        const heightDelta = el.scrollHeight - snapshot.scrollHeight;
        if (heightDelta > 0) {
          el.scrollTop = snapshot.scrollTop + heightDelta;
        }
      }
      wasLoadingOlderRef.current = loadingOlder;
    }, [loadingOlder]);

    useImperativeHandle(ref, () => ({
      scrollToMessage: (messageId: number) => {
        const el = scrollContainerRef.current;
        if (el) scrollToMessage(el, messageId);
      },
      scrollToBottom,
      getScrollElement: () => scrollContainerRef.current,
    }));

    return (
      <div
        ref={combinedRef}
        data-testid="message-panel"
        className="absolute inset-0 overflow-y-auto px-4 py-3 scrollbar-subtle"
      >
        {children}
      </div>
    );
  },
);
