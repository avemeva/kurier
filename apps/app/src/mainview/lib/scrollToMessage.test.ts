import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToMessage } from './scrollToMessage';

describe('scrollToMessage', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scrolls element into view centered', () => {
    const msgEl = document.createElement('div');
    msgEl.id = 'msg-42';
    msgEl.scrollIntoView = vi.fn();
    container.appendChild(msgEl);

    scrollToMessage(container, 42);

    expect(msgEl.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('adds highlight-message class', () => {
    const msgEl = document.createElement('div');
    msgEl.id = 'msg-42';
    msgEl.scrollIntoView = vi.fn();
    container.appendChild(msgEl);

    scrollToMessage(container, 42);

    expect(msgEl.classList.contains('highlight-message')).toBe(true);
  });

  it('removes highlight after 2 seconds', () => {
    const msgEl = document.createElement('div');
    msgEl.id = 'msg-42';
    msgEl.scrollIntoView = vi.fn();
    container.appendChild(msgEl);

    scrollToMessage(container, 42);
    expect(msgEl.classList.contains('highlight-message')).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(msgEl.classList.contains('highlight-message')).toBe(false);
  });

  it('no-op when element not found', () => {
    // querySelector returns null — should not throw
    expect(() => scrollToMessage(container, 999)).not.toThrow();
  });
});
