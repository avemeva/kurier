import { ChevronUp, Loader2, Mic, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Match tdesktop: kWaveformSamplesCount=100, msgWaveformBar=2, msgWaveformSkip=1, min=3, max=17 */
const WAVEFORM_SAMPLES = 100;
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const BAR_STEP = BAR_WIDTH + BAR_GAP; // 3px per bar
const BAR_MIN = 3;
const BAR_MAX = 23;

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

/** Format seconds as mm:ss */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Format file size in human-readable form */
function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PureVoiceView({
  url,
  loading,
  onRetry,
  waveform,
  duration: tdDuration,
  fileSize,
  speechStatus = 'none',
  speechText = '',
  onTranscribe,
}: {
  url: string | null;
  loading?: boolean;
  onRetry?: () => void;
  waveform?: string | null;
  duration?: number;
  fileSize?: number;
  speechStatus?: 'none' | 'pending' | 'done' | 'error';
  speechText?: string;
  onTranscribe?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(tdDuration ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number>(0);
  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Auto-expand when transcription completes
  useEffect(() => {
    if (speechStatus === 'done') {
      setExpanded(true);
      setRequesting(false);
    } else if (speechStatus === 'pending') {
      setRequesting(false);
    } else if (speechStatus === 'error') {
      setRequesting(false);
    }
  }, [speechStatus]);

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

  const seekToX = useCallback((clientX: number, rect: DOMRect) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  }, []);

  const handleWaveformMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;
      e.preventDefault();
      draggingRef.current = true;
      wasPlayingRef.current = !audio.paused;
      if (!audio.paused) audio.pause();
      const rect = e.currentTarget.getBoundingClientRect();
      seekToX(e.clientX, rect);

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        seekToX(ev.clientX, rect);
      };
      const onUp = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        seekToX(ev.clientX, rect);
        if (wasPlayingRef.current) audio.play();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [seekToX],
  );

  const handleTranscribe = useCallback(() => {
    if (speechStatus === 'done') {
      setExpanded((v) => !v);
      return;
    }
    if (onTranscribe && speechStatus !== 'pending' && !requesting) {
      setRequesting(true);
      onTranscribe();
    }
  }, [speechStatus, onTranscribe, requesting]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: url triggers re-attach when <audio> mounts after async load
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
  }, [tick, url]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const displayTime =
    playing || currentTime > 0 ? formatTime(duration - currentTime) : formatTime(duration);
  const fileSizeStr = fileSize ? formatFileSize(fileSize) : '';
  const metaText = fileSizeStr ? `${displayTime}, ${fileSizeStr}` : displayTime;

  const isTranscribing = speechStatus === 'pending' || requesting;
  const hasTranscription = speechStatus === 'done' && speechText;
  const canTranscribe =
    onTranscribe &&
    (speechStatus === 'none' || speechStatus === 'error' || speechStatus === 'done');

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
      <div className="flex w-full min-w-[200px] items-center gap-2 py-1">
        {/* Play button — clickable for retry, otherwise just a muted circle */}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex size-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-text-quaternary/30 text-text-quaternary transition-opacity hover:opacity-80"
            aria-label="Retry"
          >
            <Play size={18} fill="currentColor" className="ml-0.5" />
          </button>
        ) : (
          <div className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-text-quaternary/30 text-text-quaternary">
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
    <div data-testid="voice-message" className="w-[280px] py-1">
      {/* biome-ignore lint/a11y/useMediaCaption: Telegram voice messages don't have captions */}
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play button | right column */}
      <div className="flex gap-2">
        {/* Play/pause button — aligned to waveform row */}
        <button
          type="button"
          onClick={togglePlay}
          className="mt-0.5 flex size-[42px] shrink-0 items-center justify-center rounded-full bg-accent-blue text-white transition-opacity hover:opacity-90"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        {/* Right column: waveform row + duration row */}
        <div className="min-w-0 flex-1">
          {/* Waveform + transcribe button */}
          <div className="flex items-center gap-1.5">
            <div
              ref={waveformRef}
              data-testid="voice-waveform"
              role="slider"
              aria-label="Audio position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              tabIndex={0}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-[1px]"
              onMouseDown={handleWaveformMouseDown}
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

            {/* Transcribe / loading / collapse button */}
            {(canTranscribe || isTranscribing) && (
              <button
                type="button"
                onClick={handleTranscribe}
                disabled={isTranscribing}
                className={`flex shrink-0 items-center justify-center rounded transition-opacity hover:opacity-80 ${
                  hasTranscription
                    ? 'size-6 bg-accent-blue text-white'
                    : 'bg-accent-blue/10 px-1 py-0.5 text-accent-blue'
                } ${isTranscribing ? 'cursor-default opacity-70' : ''}`}
                aria-label={
                  isTranscribing
                    ? 'Transcribing...'
                    : hasTranscription && expanded
                      ? 'Collapse transcript'
                      : 'Transcribe'
                }
              >
                {isTranscribing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : hasTranscription ? (
                  <ChevronUp
                    size={14}
                    className={`transition-transform ${expanded ? '' : 'rotate-180'}`}
                  />
                ) : (
                  <span className="text-[11px] font-medium leading-none">→A</span>
                )}
              </button>
            )}
          </div>

          {/* Duration + file size */}
          <span
            data-testid="voice-duration"
            className="mt-0.5 block text-[11px] tabular-nums text-text-tertiary"
          >
            {metaText}
          </span>
        </div>
      </div>

      {/* Transcription text (when expanded) */}
      {hasTranscription && expanded && (
        <p className="mt-1.5 text-[13px] leading-[18px] text-text-primary">{speechText}</p>
      )}
    </div>
  );
}
