import { useCallback, useEffect, useRef } from 'react';

type UseInfiniteScrollOptions = {
  onTop: () => void;
  onBottom: () => void;
  hasOlder: boolean;
  hasNewer: boolean;
};

/**
 * Attaches scroll listeners to detect top/bottom edge proximity.
 * Fires onTop/onBottom callbacks with debounce to prevent cascading loads.
 * Does not re-fire until user scrolls away from the edge and returns.
 */
export function useInfiniteScroll(
  scrollRef: React.RefObject<HTMLElement | null>,
  options: UseInfiniteScrollOptions,
) {
  const { onTop, onBottom, hasOlder, hasNewer } = options;

  // Track whether we're "armed" for each direction.
  // Armed = user has scrolled away from the edge, so next approach triggers.
  const topArmedRef = useRef(false);
  const bottomArmedRef = useRef(false);

  // Threshold in pixels from edge to trigger
  const EDGE_THRESHOLD = 200;
  // How far user must scroll away from edge to re-arm
  const ARM_THRESHOLD = 500;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Arm/disarm top direction
    if (scrollTop > ARM_THRESHOLD) {
      topArmedRef.current = true;
    }
    // Arm/disarm bottom direction
    if (distanceFromBottom > ARM_THRESHOLD) {
      bottomArmedRef.current = true;
    }

    // Fire top callback
    if (topArmedRef.current && hasOlder && scrollTop < EDGE_THRESHOLD) {
      topArmedRef.current = false;
      onTop();
    }

    // Fire bottom callback
    if (bottomArmedRef.current && hasNewer && distanceFromBottom < EDGE_THRESHOLD) {
      bottomArmedRef.current = false;
      onBottom();
    }
  }, [scrollRef, onTop, onBottom, hasOlder, hasNewer]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [scrollRef, handleScroll]);
}
