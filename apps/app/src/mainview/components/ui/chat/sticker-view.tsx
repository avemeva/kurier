import type { AnimationItem } from 'lottie-web';
import lottie from 'lottie-web/build/player/lottie_light';
import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// --- TGS Player (internal) ---

function TgsPlayer({ url, loop = true }: { url: string; loop?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!url || !container) return;
    let cancelled = false;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok || !response.body) return;

        let text: string;
        if (typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('gzip');
          const decompressed = response.body.pipeThrough(ds);
          text = await new Response(decompressed).text();
        } else {
          // Fallback: try reading as-is (some environments lack DecompressionStream)
          const buf = await response.arrayBuffer();
          // Manual gzip decompression via Response trick
          const blob = new Blob([buf]);
          const ds2 = new Response(blob).body;
          if (!ds2) return;
          text = new TextDecoder().decode(await new Response(ds2).arrayBuffer());
        }

        const animationData = JSON.parse(text);
        if (cancelled || !containerRef.current) return;

        animationRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'canvas',
          loop,
          autoplay: !prefersReducedMotion,
          animationData,
        });
      } catch {
        // Fetch or decompression failed — container stays empty
      }
    })();

    return () => {
      cancelled = true;
      if (animationRef.current) {
        animationRef.current.destroy();
        animationRef.current = null;
      }
    };
  }, [url, loop]);

  return <div ref={containerRef} data-sticker-format="tgs" className="size-full" />;
}

// --- Muted Video (workaround for React muted prop issue) ---

function MutedVideo({ src, loop, className }: { src: string; loop: boolean; className?: string }) {
  const ref = useCallback((el: HTMLVideoElement | null) => {
    if (el) el.muted = true;
  }, []);

  return <video ref={ref} autoPlay muted loop={loop} playsInline src={src} className={className} />;
}

// --- Pure Sticker View ---

export interface PureStickerViewProps {
  url: string | null;
  format: 'webp' | 'tgs' | 'webm' | null;
  emoji?: string;
  loop?: boolean;
  loading?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function PureStickerView({
  url,
  format,
  emoji,
  loop = true,
  loading,
  onRetry,
  className,
}: PureStickerViewProps) {
  // Loading state
  if (loading) {
    return (
      <div className={cn('aspect-square w-full max-w-sticker animate-pulse bg-muted', className)} />
    );
  }

  // No URL + emoji fallback: render large emoji character
  if (!url && emoji) {
    return (
      <div
        className={cn(
          'flex aspect-square w-full max-w-sticker items-center justify-center',
          className,
        )}
      >
        <span className="text-7xl">{emoji}</span>
      </div>
    );
  }

  // No URL, no emoji: retry or empty placeholder
  if (!url) {
    const Container = onRetry ? 'button' : 'div';
    return (
      <Container
        type={onRetry ? 'button' : undefined}
        onClick={onRetry}
        className={cn(
          'aspect-square w-full max-w-sticker bg-accent',
          onRetry && 'cursor-pointer transition-colors hover:bg-accent/80',
          className,
        )}
      />
    );
  }

  // TGS: Lottie animation
  if (format === 'tgs') {
    return (
      <div className={cn('aspect-square w-full max-w-sticker', className)}>
        <TgsPlayer url={url} loop={loop} />
      </div>
    );
  }

  // WEBM: video element
  if (format === 'webm') {
    return (
      <MutedVideo
        src={url}
        loop={loop}
        className={cn('aspect-square w-full max-w-sticker', className)}
      />
    );
  }

  // WebP or null format with URL: static image
  return (
    <img
      src={url}
      className={cn('aspect-square w-full max-w-sticker object-contain', className)}
      alt={emoji || 'Sticker'}
    />
  );
}
