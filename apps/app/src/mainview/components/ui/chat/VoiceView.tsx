import { Mic, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Match tdesktop: kWaveformSamplesCount=100, msgWaveformBar=2, msgWaveformSkip=1, min=3, max=17 */
const WAVEFORM_SAMPLES = 100;
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const BAR_STEP = BAR_WIDTH + BAR_GAP; // 3px per bar
const BAR_MIN = 3;
const BAR_MAX = 17;

/** Simple seedable PRNG (mulberry32) for deterministic waveform shapes. */
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a numeric seed from a string (url or fallback). */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

/** Generate deterministic bar heights from a seed string. */
function generateBars(seed: string): number[] {
  const rng = mulberry32(hashString(seed));
  return Array.from({ length: WAVEFORM_SAMPLES }, () =>
    Math.round(BAR_MIN + rng() * (BAR_MAX - BAR_MIN)),
  );
}

/**
 * Downsample bars to fit container width, like tdesktop.
 * Each displayed bar represents the max of a group of source bars.
 */
function sampleBars(allBars: number[], targetCount: number): number[] {
  if (targetCount >= allBars.length) return allBars;
  const result: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor((i * allBars.length) / targetCount);
    const end = Math.floor(((i + 1) * allBars.length) / targetCount);
    let max = 0;
    for (let j = start; j < end; j++) {
      if (allBars[j] > max) max = allBars[j];
    }
    result.push(max);
  }
  return result;
}

/** Hook: measure container width and compute how many bars fit. */
function useBarCount(ref: React.RefObject<HTMLDivElement | null>): number {
  const [barCount, setBarCount] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      setBarCount(Math.min(Math.floor(width / BAR_STEP), WAVEFORM_SAMPLES));
    };

    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();

    return () => ro.disconnect();
  }, [ref]);

  return barCount;
}

/** Format seconds as m:ss */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PureVoiceView({
  url,
  loading,
  onRetry,
}: {
  url: string | null;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number>(0);

  const barCount = useBarCount(waveformRef);
  const allBars = url ? generateBars(url) : generateBars('placeholder');
  const bars = barCount > 0 ? sampleBars(allBars, barCount) : [];

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      setCurrentTime(audio.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      setPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      setCurrentTime(audio.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      setCurrentTime(0);
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [tick]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const displayTime =
    playing || currentTime > 0 ? formatTime(duration - currentTime) : formatTime(duration);

  if (loading) {
    return (
      <div className="flex h-10 w-48 animate-pulse items-center gap-2 rounded-full bg-accent px-3">
        <Mic size={16} className="shrink-0 text-text-quaternary" />
        <div className="h-1 flex-1 rounded bg-border" />
      </div>
    );
  }

  if (!url) {
    const allPlaceholderBars = generateBars('unavailable');
    const placeholderBars = barCount > 0 ? sampleBars(allPlaceholderBars, barCount) : [];
    return (
      <div className="flex w-full min-w-[200px] items-center gap-[11px] py-1">
        {/* Play button — clickable for retry, otherwise just a muted circle */}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-text-quaternary/30 text-text-quaternary transition-opacity hover:opacity-80"
            aria-label="Retry"
          >
            <Play size={18} fill="currentColor" className="ml-0.5" />
          </button>
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-text-quaternary/30 text-text-quaternary">
            <Play size={18} fill="currentColor" className="ml-0.5" />
          </div>
        )}

        {/* Muted waveform bars at minimum height */}
        <div ref={waveformRef} className="flex min-w-0 flex-1 items-center gap-[1px]">
          {placeholderBars.map((h, i) => (
            <div
              key={`bar-${i}-${h}`}
              className="w-[2px] rounded-full bg-muted-foreground/20"
              style={{ height: `${BAR_MIN}px` }}
            />
          ))}
        </div>

        {/* Placeholder duration */}
        <span className="min-w-[32px] shrink-0 text-right text-[11px] tabular-nums text-text-quaternary">
          --:--
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-[200px] items-center gap-[11px] py-1">
      {/* biome-ignore lint/a11y/useMediaCaption: Telegram voice messages don't have captions */}
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play/pause button */}
      <button
        type="button"
        onClick={togglePlay}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-blue text-white transition-opacity hover:opacity-90"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      {/* Waveform bars */}
      <div ref={waveformRef} className="flex min-w-0 flex-1 items-center gap-[1px]">
        {bars.map((height, i) => {
          const barProgress = bars.length > 0 ? (i + 0.5) / bars.length : 0;
          const filled = barProgress <= progress;
          return (
            <div
              key={`bar-${i}-${height}`}
              className={`w-[2px] rounded-full transition-colors duration-75 ${
                filled ? 'bg-accent-blue' : 'bg-muted-foreground/40'
              }`}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>

      {/* Duration */}
      <span className="min-w-[32px] shrink-0 text-right text-[11px] tabular-nums text-text-tertiary">
        {displayTime}
      </span>
    </div>
  );
}
