import {
  BarChart3,
  Camera,
  Clapperboard,
  MapPin,
  Mic,
  Music,
  Paperclip,
  Tag,
  User,
  Video,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const ICON_SIZE = 14;

const MEDIA_ICONS: Record<string, ReactNode> = {
  Photo: <Camera size={ICON_SIZE} />,
  Video: <Clapperboard size={ICON_SIZE} />,
  'Video message': <Video size={ICON_SIZE} />,
  'Voice message': <Mic size={ICON_SIZE} />,
  Sticker: <Tag size={ICON_SIZE} />,
  Audio: <Music size={ICON_SIZE} />,
  File: <Paperclip size={ICON_SIZE} />,
  Location: <MapPin size={ICON_SIZE} />,
  Contact: <User size={ICON_SIZE} />,
  Poll: <BarChart3 size={ICON_SIZE} />,
};

/** True when this media type can have a visual thumbnail (photo/video/GIF). */
function hasVisualThumb(mediaType: string | undefined): boolean {
  return (
    mediaType === 'Photo' ||
    mediaType === 'Video' ||
    mediaType === 'GIF' ||
    mediaType === 'Video message'
  );
}

export function PureReplyHeader({
  senderName,
  text,
  mediaType,
  mediaUrl,
  isOutgoing,
}: {
  senderName: string;
  text?: string;
  mediaType?: string;
  mediaUrl?: string;
  isOutgoing?: boolean;
}) {
  const label = text || mediaType || '';

  return (
    <div
      className={cn(
        'mb-1 flex gap-2 rounded border-l-2 border-accent-blue px-2 py-1',
        isOutgoing ? 'bg-accent-blue-subtle' : 'bg-code-bg',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-accent-blue">{senderName}</p>
        <p className="truncate text-xs text-text-secondary">{label}</p>
      </div>
      {mediaUrl && hasVisualThumb(mediaType) && (
        <div className="relative size-8 shrink-0">
          <img src={mediaUrl} alt="" className="size-8 rounded object-cover" />
          {(mediaType === 'Video' || mediaType === 'GIF' || mediaType === 'Video message') && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-3.5 items-center justify-center rounded-full bg-black/50 text-[7px] leading-none text-white">
                {mediaType === 'GIF' ? 'GIF' : '\u25B6'}
              </span>
            </span>
          )}
        </div>
      )}
      {mediaUrl && !hasVisualThumb(mediaType) && (
        <img src={mediaUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
      )}
      {!mediaUrl && mediaType && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-xs text-text-tertiary">
          {mediaType === 'GIF' ? 'GIF' : (MEDIA_ICONS[mediaType] ?? mediaType.charAt(0))}
        </div>
      )}
    </div>
  );
}
