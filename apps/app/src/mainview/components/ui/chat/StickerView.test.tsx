import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PureStickerView } from './StickerView';

// Mock lottie-web — not available in happy-dom
vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: {
    loadAnimation: vi.fn(() => ({ destroy: vi.fn() })),
  },
}));

describe('PureStickerView', () => {
  it('renders <img> for webp sticker', () => {
    const { container } = render(<PureStickerView url="/test.webp" format="webp" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/test.webp');
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders <video> for webm sticker', () => {
    const { container } = render(<PureStickerView url="/test.webm" format="webm" />);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.getAttribute('src')).toBe('/test.webm');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders tgs container for tgs sticker', () => {
    const { container } = render(<PureStickerView url="/test.tgs" format="tgs" />);
    expect(container.querySelector('[data-sticker-format="tgs"]')).not.toBeNull();
  });

  it('renders fallback emoji when format is null and emoji provided', () => {
    const { container } = render(<PureStickerView url={null} format={null} emoji="🐸" />);
    expect(container.textContent).toContain('🐸');
    // Should not render img or video
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders <img> for null format with url (safe fallback)', () => {
    const { container } = render(<PureStickerView url="/test.unknown" format={null} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/test.unknown');
  });

  it('renders loading placeholder when loading is true', () => {
    const { container } = render(<PureStickerView url={null} format="webp" loading={true} />);
    // Should show a placeholder div, not an img or video
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    // The placeholder has animate-pulse class
    const placeholder = container.firstElementChild;
    expect(placeholder?.className).toContain('animate-pulse');
  });

  it('renders empty placeholder when no url and no emoji', () => {
    const { container } = render(<PureStickerView url={null} format="webp" />);
    // Should not render img, video, or emoji text
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders retry button when no url and onRetry provided', () => {
    const onRetry = vi.fn();
    const { container } = render(<PureStickerView url={null} format="webp" onRetry={onRetry} />);
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    button?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
