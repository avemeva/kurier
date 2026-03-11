import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteScroll } from './useInfiniteScroll';

function createMockElement(overrides: Partial<HTMLElement> = {}): HTMLElement {
  const el = document.createElement('div');
  // Default: scrolled to middle of a tall container
  Object.defineProperty(el, 'scrollHeight', { value: 5000, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 800, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    value: 2000,
    writable: true,
    configurable: true,
  });
  Object.assign(el, overrides);
  return el;
}

function setScrollTop(el: HTMLElement, value: number) {
  Object.defineProperty(el, 'scrollTop', {
    value,
    writable: true,
    configurable: true,
  });
  el.dispatchEvent(new Event('scroll'));
}

describe('useInfiniteScroll', () => {
  let onTop: () => void;
  let onBottom: () => void;
  let el: HTMLElement;
  let scrollRef: React.RefObject<HTMLElement | null>;

  beforeEach(() => {
    onTop = vi.fn();
    onBottom = vi.fn();
    el = createMockElement();
    scrollRef = { current: el };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires onTop when scrollTop < threshold after being armed', () => {
    renderHook(() =>
      useInfiniteScroll(scrollRef, {
        onTop,
        onBottom,
        hasOlder: true,
        hasNewer: true,
      }),
    );

    // Arm: scroll far from top (scrollTop > 500)
    setScrollTop(el, 600);
    // Now approach top edge (scrollTop < 200)
    setScrollTop(el, 100);

    expect(onTop).toHaveBeenCalledOnce();
  });

  it('fires onBottom when near bottom edge after being armed', () => {
    renderHook(() =>
      useInfiniteScroll(scrollRef, {
        onTop,
        onBottom,
        hasOlder: true,
        hasNewer: true,
      }),
    );

    // Arm bottom: scroll far from bottom (distanceFromBottom > 500)
    // distanceFromBottom = scrollHeight - scrollTop - clientHeight = 5000 - 1000 - 800 = 3200
    setScrollTop(el, 1000);
    // Approach bottom: distanceFromBottom < 200 → scrollTop > 5000 - 800 - 200 = 4000
    setScrollTop(el, 4100);

    expect(onBottom).toHaveBeenCalledOnce();
  });

  it('does not re-fire until user scrolls away and returns', () => {
    renderHook(() =>
      useInfiniteScroll(scrollRef, {
        onTop,
        onBottom,
        hasOlder: true,
        hasNewer: true,
      }),
    );

    // Arm + fire
    setScrollTop(el, 600);
    setScrollTop(el, 100);
    expect(onTop).toHaveBeenCalledOnce();

    // Still near top — should not fire again
    setScrollTop(el, 50);
    expect(onTop).toHaveBeenCalledOnce();

    // Scroll away to re-arm
    setScrollTop(el, 600);
    // Approach top again
    setScrollTop(el, 80);
    expect(onTop).toHaveBeenCalledTimes(2);
  });

  it('does not call onBottom when hasNewer is false', () => {
    renderHook(() =>
      useInfiniteScroll(scrollRef, {
        onTop,
        onBottom,
        hasOlder: true,
        hasNewer: false,
      }),
    );

    // Arm bottom
    setScrollTop(el, 1000);
    // Approach bottom
    setScrollTop(el, 4100);

    expect(onBottom).not.toHaveBeenCalled();
  });

  it('does not call onTop when hasOlder is false', () => {
    renderHook(() =>
      useInfiniteScroll(scrollRef, {
        onTop,
        onBottom,
        hasOlder: false,
        hasNewer: true,
      }),
    );

    // Arm top
    setScrollTop(el, 600);
    // Approach top
    setScrollTop(el, 100);

    expect(onTop).not.toHaveBeenCalled();
  });
});
