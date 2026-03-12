import { useCallback, useEffect, useRef } from 'react';

/** How close to the bottom (px) counts as "stuck". */
const STICK_THRESHOLD = 30;

export type StickToBottomHandle = {
  /** Imperatively scroll to bottom and enter stuck mode. */
  scrollToBottom: () => void;
  /** The scroll container ref — attach to your scrollable div. */
  scrollRef: React.RefCallback<HTMLDivElement>;
};

/**
 * Generic "stick to bottom" scroll behavior.
 *
 * When stuck (scroll position at bottom), polls scrollHeight via rAF and
 * re-pins whenever it grows. This catches ALL sources of height change:
 * new DOM nodes, image loads, font rendering, CSS transitions — without
 * needing to know what caused the change.
 *
 * When the user scrolls up, the rAF loop stops (no CPU cost while unstuck).
 * `scrollToBottom()` re-enters stuck mode (for chat switch, "go to latest").
 */
export function useStickToBottom(): StickToBottomHandle {
  const elRef = useRef<HTMLDivElement | null>(null);
  const stuckRef = useRef(true);
  const prevScrollHeightRef = useRef(0);
  const rafRef = useRef(0);
  const programmaticRef = useRef(false);

  const pin = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    programmaticRef.current = true;
    el.scrollTop = el.scrollHeight;
    prevScrollHeightRef.current = el.scrollHeight;
  }, []);

  // rAF loop: runs only while stuck, checks scrollHeight each frame
  const tick = useCallback(() => {
    const el = elRef.current;
    if (!el || !stuckRef.current) return;

    const h = el.scrollHeight;
    if (h !== prevScrollHeightRef.current) {
      prevScrollHeightRef.current = h;
      pin();
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [pin]);

  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const scrollToBottom = useCallback(() => {
    stuckRef.current = true;
    pin();
    startLoop();
  }, [pin, startLoop]);

  const onScroll = useCallback(() => {
    if (programmaticRef.current) {
      programmaticRef.current = false;
      return;
    }
    const el = elRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const wasStuck = stuckRef.current;
    stuckRef.current = dist <= STICK_THRESHOLD;

    // User scrolled back to bottom → restart loop
    if (!wasStuck && stuckRef.current) {
      startLoop();
    }
    // User scrolled away → loop stops naturally (tick checks stuckRef)
  }, [startLoop]);

  const scrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (elRef.current) elRef.current.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);

      elRef.current = node;
      if (!node) return;

      node.addEventListener('scroll', onScroll, { passive: true });
      prevScrollHeightRef.current = node.scrollHeight;

      if (stuckRef.current) {
        pin();
        startLoop();
      }
    },
    [onScroll, pin, startLoop],
  );

  useEffect(() => {
    return () => {
      if (elRef.current) elRef.current.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [onScroll]);

  return { scrollToBottom, scrollRef };
}
