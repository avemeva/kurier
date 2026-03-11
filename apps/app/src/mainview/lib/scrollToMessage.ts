/**
 * Finds a message element by ID, scrolls it into view centered, and adds
 * a temporary highlight class. Pure DOM — no store or domain knowledge.
 *
 * Handles layout shift from lazy-loading images: listens for `load` events
 * on incomplete images and re-centers the target each time one resolves.
 */
export function scrollToMessage(container: HTMLElement, messageId: number): void {
  const el = container.querySelector(`#msg-${messageId}`);
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('highlight-message');

  // Re-center on image loads to compensate for layout shifts.
  // Images above the target expand after loading, pushing it down.
  const cleanups: (() => void)[] = [];
  const images = container.querySelectorAll('img');

  const recenter = () => {
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
  };

  for (const img of images) {
    if (!img.complete) {
      const onLoad = () => recenter();
      const onError = () => {}; // nothing to do, but clean up
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
      cleanups.push(() => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      });
    }
  }

  setTimeout(() => {
    el.classList.remove('highlight-message');
    for (const cleanup of cleanups) cleanup();
  }, 2000);
}
