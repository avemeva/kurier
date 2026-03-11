import { Maximize, Minimize, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Format seconds as m:ss */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function VideoPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [isPlaying]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  const seekToFraction = useCallback(
    (clientX: number) => {
      const video = videoRef.current;
      const bar = progressBarRef.current;
      if (!video || !bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      video.currentTime = fraction * duration;
    },
    [duration],
  );

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      seekToFraction(e.clientX);
    },
    [seekToFraction],
  );

  const handleProgressDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSeeking) return;
      seekToFraction(e.clientX);
    },
    [isSeeking, seekToFraction],
  );

  const handleProgressKeyDown = useCallback((e: React.KeyboardEvent) => {
    const video = videoRef.current;
    if (!video) return;
    if (e.key === 'ArrowRight') {
      video.currentTime = Math.min(video.duration, video.currentTime + 5);
    }
    if (e.key === 'ArrowLeft') {
      video.currentTime = Math.max(0, video.currentTime - 5);
    }
  }, []);

  // Sync play/pause state from the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      setShowControls(true);
    };
    const onPause = () => {
      setIsPlaying(false);
      setShowControls(true);
    };
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onDurationChange = () => setDuration(video.duration);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('durationchange', onDurationChange);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('durationchange', onDurationChange);
    };
  }, []);

  // Auto-hide controls during playback
  useEffect(() => {
    if (isPlaying) {
      scheduleHide();
    } else {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setShowControls(true);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, scheduleHide]);

  // Track fullscreen changes
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Release seeking on mouseup anywhere
  useEffect(() => {
    if (!isSeeking) return;
    const onUp = () => setIsSeeking(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [isSeeking]);

  const controlsVisible = showControls || !isPlaying;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse tracking for control auto-hide
    <div
      ref={containerRef}
      className={cn(
        'group relative overflow-hidden rounded bg-black',
        isFullscreen ? 'flex items-center justify-center' : 'max-h-80 max-w-full',
      )}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        if (isPlaying) setShowControls(false);
      }}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: Telegram videos don't have caption tracks */}
      <video
        ref={videoRef}
        src={url}
        className={cn('block', isFullscreen ? 'max-h-screen max-w-screen' : 'max-h-80 max-w-full')}
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />

      {/* Large centered play/pause overlay */}
      <button
        type="button"
        className={cn(
          'absolute inset-0 flex cursor-pointer items-center justify-center transition-opacity duration-200',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <span
          className={cn(
            'flex size-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform duration-150',
            isPlaying ? 'scale-90' : 'scale-100',
          )}
        >
          {isPlaying ? (
            <Pause size={28} fill="white" />
          ) : (
            <Play size={28} fill="white" className="ml-1" />
          )}
        </span>
      </button>

      {/* Bottom controls bar */}
      <div
        className={cn(
          'absolute right-0 bottom-0 left-0 flex items-end transition-opacity duration-200',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {/* Gradient scrim for readability */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        <div className="relative flex w-full flex-col gap-1 px-2.5 pb-2 pt-6">
          {/* Time + fullscreen row */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium leading-none text-white drop-shadow-sm">
              {formatTime(currentTime)}
              <span className="text-white/60">
                {' / '}
                {formatTime(duration)}
              </span>
            </span>
            <button
              type="button"
              className="flex size-6 cursor-pointer items-center justify-center rounded text-white/80 transition-colors hover:text-white"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </div>

          {/* Progress bar */}
          <div
            ref={progressBarRef}
            className="relative h-3 cursor-pointer py-1"
            onClick={handleProgressClick}
            onMouseDown={(e) => {
              setIsSeeking(true);
              handleProgressClick(e);
            }}
            onMouseMove={handleProgressDrag}
            onKeyDown={handleProgressKeyDown}
            role="slider"
            aria-label="Video progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            tabIndex={0}
          >
            {/* Track background */}
            <div className="absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2 rounded-full bg-white/25" />
            {/* Filled track */}
            <div
              className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-white transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
            {/* Thumb dot — visible on hover / seeking */}
            <div
              className={cn(
                'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-opacity duration-100',
                isSeeking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PureVideoView({
  url,
  loading,
  isCircle,
  isGif,
  cover,
  onRetry,
}: {
  url: string | null;
  loading?: boolean;
  isCircle?: boolean;
  isGif?: boolean;
  cover?: boolean;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div
        className={cn(
          'animate-pulse bg-muted',
          isCircle
            ? 'size-[200px] rounded-full'
            : cover
              ? 'h-full w-full'
              : 'aspect-video w-full max-w-xs rounded-lg',
        )}
      />
    );
  }
  if (!url) {
    const Container = onRetry ? 'button' : 'div';
    return (
      <Container
        type={onRetry ? 'button' : undefined}
        onClick={onRetry}
        className={cn(
          'bg-accent',
          isCircle
            ? 'size-[200px] rounded-full'
            : cover
              ? 'h-full w-full'
              : 'aspect-video w-full max-w-xs rounded',
          onRetry && 'cursor-pointer transition-colors hover:bg-accent/80',
        )}
      />
    );
  }
  if (isCircle) {
    return (
      <div className="size-[200px] overflow-hidden rounded-full">
        <video src={url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
      </div>
    );
  }
  if (cover) {
    return (
      <video src={url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
    );
  }
  if (isGif) {
    return (
      <video src={url} className="max-h-80 max-w-full rounded" autoPlay muted loop playsInline />
    );
  }
  return <VideoPlayer url={url} />;
}
