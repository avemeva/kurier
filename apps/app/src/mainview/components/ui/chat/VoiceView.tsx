import { Mic, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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

/** Generate deterministic bar heights from a seed string (fallback when no waveform data). */
function generateBars(seed: string): number[] {
  const rng = mulberry32(hashString(seed));
  return Array.from({ length: WAVEFORM_SAMPLES }, () =>
    Math.round(BAR_MIN + rng() * (BAR_MAX - BAR_MIN)),
  );
}

/**
 * Decode TDLib 5-bit packed waveform from base64.
 * Each sample is 5 bits (0-31), packed sequentially into bytes.
 */
function decodeWaveform(base64: string): number[] {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  const totalBits = bytes.length * 8;
  const sampleCount = Math.floor(totalBits / 5);
  const samples: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const bitOffset = i * 5;
    const byteIdx = bitOffset >> 3;
    const bitIdx = bitOffset & 7;
    // Read up to 2 bytes to extract 5 bits
    const val = ((bytes[byteIdx] | ((bytes[byteIdx + 1] ?? 0) << 8)) >> bitIdx) & 0x1f;
    samples.push(val);
  }

  return samples;
}

/** Convert decoded 5-bit waveform samples (0-31) to bar heights (BAR_MIN..BAR_MAX). */
function waveformToBars(waveform: string): number[] {
  const samples = decodeWaveform(waveform);
  if (samples.length === 0) return [];
  return samples.map((s) => Math.round(BAR_MIN + (s / 31) * (BAR_MAX - BAR_MIN)));
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

/** Hook: measure container width and compute how many bars fit via callback ref. */
function useBarCount(): [React.RefCallback<HTMLDivElement>, number] {
  const [barCount, setBarCount] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);

  const callbackRef = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      setBarCount(Math.min(Math.floor(width / BAR_STEP), WAVEFORM_SAMPLES));
    };

    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    roRef.current = ro;
  }, []);

  return [callbackRef, barCount];
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
  waveform,
  duration: tdDuration,
}: {
  url: string | null;
  loading?: boolean;
  onRetry?: () => void;
  waveform?: string | null;
  duration?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(tdDuration ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number>(0);

  const [waveformRef, barCount] = useBarCount();
  const allBars = waveform
    ? waveformToBars(waveform)
    : url
      ? generateBars(url)
      : generateBars('placeholder');
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
    <div
      data-testid="voice-message"
      className="flex w-full min-w-[200px] items-center gap-[11px] py-1"
    >
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
      <div
        ref={waveformRef}
        data-testid="voice-waveform"
        className="flex min-w-0 flex-1 items-center gap-[1px]"
      >
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
      <span
        data-testid="voice-duration"
        className="min-w-[32px] shrink-0 text-right text-[11px] tabular-nums text-text-tertiary"
      >
        {displayTime}
      </span>
    </div>
  );
}
