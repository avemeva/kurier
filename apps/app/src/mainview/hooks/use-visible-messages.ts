import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks which message elements are currently visible in the scroll container
 * using IntersectionObserver + MutationObserver.
 *
 * @param scrollElementGetter - Function that returns the scroll container DOM element
 * @returns Set<number> of visible message IDs
 */
export function useVisibleMessages(scrollElementGetter: () => HTMLElement | null): Set<number> {
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set());
  // Track the actual element so we re-run when it becomes available
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const rafRef = useRef(0);

  // Poll for scroll element availability (handles ref timing)
  const checkElement = useCallback(() => {
    const el = scrollElementGetter();
    setScrollElement((prev) => (prev === el ? prev : el));
    if (!el) {
      rafRef.current = requestAnimationFrame(checkElement);
    }
  }, [scrollElementGetter]);

  useEffect(() => {
    checkElement();
    return () => cancelAnimationFrame(rafRef.current);
  }, [checkElement]);

  useEffect(() => {
    const root = scrollElement;
    if (!root) return;

    const currentlyVisible = new Set<number>();

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const id = Number(entry.target.id.replace('msg-', ''));
          if (Number.isNaN(id)) continue;

          if (entry.isIntersecting) {
            if (!currentlyVisible.has(id)) {
              currentlyVisible.add(id);
              changed = true;
            }
          } else {
            if (currentlyVisible.has(id)) {
              currentlyVisible.delete(id);
              changed = true;
            }
          }
        }
        if (changed) {
          setVisibleIds(new Set(currentlyVisible));
        }
      },
      {
        root,
        threshold: 0,
        rootMargin: '200px 0px',
      },
    );

    // Observe all existing msg- elements
    const msgElements = root.querySelectorAll<HTMLElement>('[id^="msg-"]');
    for (const el of msgElements) {
      intersectionObserver.observe(el);
    }

    // Watch for new msg- elements being added to the DOM
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (node.id?.startsWith('msg-')) {
            intersectionObserver.observe(node);
          }
          // Also check children (e.g. a wrapper div containing msg- elements)
          const children = node.querySelectorAll<HTMLElement>('[id^="msg-"]');
          for (const child of children) {
            intersectionObserver.observe(child);
          }
        }
      }
    });

    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [scrollElement]);

  return visibleIds;
}
