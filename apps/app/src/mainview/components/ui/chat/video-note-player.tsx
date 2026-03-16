import { Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const SIZE = 200;
const RING_WIDTH = 3;
const RING_RADIUS = SIZE / 2 - RING_WIDTH / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function PureVideoNotePlayer({
  url,
  senderPhotoUrl,
  speechStatus = 'none',
  speechText = '',
  onTranscribe,
  className,
}: {
  url: string;
  senderPhotoUrl?: string;
  speechStatus?: 'none' | 'pending' | 'done' | 'error';
  speechText?: string;
  onTranscribe?: () => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = duration > 0 ? currentTime / duration : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  // Auto-expand when transcription completes
  useEffect(() => {
    if (speechStatus === 'done') {
      setExpanded(true);
      setRequesting(false);
    } else if (speechStatus === 'pending' || speechStatus === 'error') {
      setRequesting(false);
    }
  }, [speechStatus]);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 2500);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setPlaying(true);
      setShowControls(true);
      scheduleHide();
    };
    const onPause = () => {
      setPlaying(false);
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
      setShowControls(true);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [scheduleHide]);

  // Seek by angle from click/drag on the ring area
  const seekFromEvent = useCallback(
    (clientX: number, clientY: number, container: DOMRect) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      const cx = container.left + container.width / 2;
      const cy = container.top + container.height / 2;
      // Angle from 12 o'clock position, clockwise
      let angle = Math.atan2(clientX - cx, -(clientY - cy));
      if (angle < 0) angle += 2 * Math.PI;
      const fraction = angle / (2 * Math.PI);
      video.currentTime = fraction * duration;
      setCurrentTime(video.currentTime);
    },
    [duration],
  );

  const handleRingMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      seekFromEvent(e.clientX, e.clientY, rect);

      const onMove = (ev: MouseEvent) => seekFromEvent(ev.clientX, ev.clientY, rect);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [seekFromEvent],
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

  const isTranscribing = speechStatus === 'pending' || requesting;
  const hasTranscription = speechStatus === 'done' && speechText;
  const canTranscribe =
    onTranscribe &&
    (speechStatus === 'none' || speechStatus === 'error' || speechStatus === 'done');
  const controlsVisible = showControls || !playing;

  return (
    <div className={cn('inline-flex flex-col', className)}>
      {/* Circular video with ring */}
      <div className="relative cursor-pointer" style={{ width: SIZE, height: SIZE }}>
        {/* Video */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          {/* biome-ignore lint/a11y/useMediaCaption: video note has no captions */}
          <video
            ref={videoRef}
            src={url}
            poster={senderPhotoUrl}
            className="h-full w-full object-cover"
            playsInline
            preload="metadata"
            onClick={togglePlay}
          />
        </div>

        {/* SVG progress ring */}
        <svg
          className="absolute inset-0"
          width={SIZE}
          height={SIZE}
          aria-hidden="true"
          onMouseDown={handleRingMouseDown}
        >
          {/* Background ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="white"
            strokeOpacity={0.3}
            strokeWidth={RING_WIDTH}
          />
          {/* Progress ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="white"
            strokeWidth={RING_WIDTH}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className="transition-[stroke-dashoffset] duration-100"
          />
        </svg>

        {/* Play/pause overlay */}
        <button
          type="button"
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity duration-200',
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {!playing && (
            <span className="flex size-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <Play size={24} fill="white" className="ml-0.5" />
            </span>
          )}
        </button>

        {/* Bottom overlays */}
        <div
          className={cn(
            'absolute right-0 bottom-2 left-0 flex items-end justify-between px-3 transition-opacity duration-200',
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {/* Time pill */}
          <span className="rounded-[10px] bg-black/50 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            {formatTime(playing || currentTime > 0 ? currentTime : 0)}
          </span>

          {/* Transcribe button */}
          {(canTranscribe || isTranscribing) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTranscribe();
              }}
              disabled={isTranscribing}
              className={cn(
                'flex size-7 items-center justify-center rounded-[10px] bg-black/50 text-white backdrop-blur-sm transition-opacity hover:opacity-80',
                isTranscribing && 'cursor-default opacity-70',
              )}
              aria-label={isTranscribing ? 'Transcribing...' : 'Transcribe'}
            >
              {isTranscribing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : hasTranscription ? (
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points={expanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
                </svg>
              ) : (
                <span className="text-xs font-semibold leading-none">→A</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Transcription text (expanded below the circle) */}
      {hasTranscription && expanded && (
        <p className="mt-2 max-w-video-note-text text-sm text-text-primary">{speechText}</p>
      )}
    </div>
  );
}
