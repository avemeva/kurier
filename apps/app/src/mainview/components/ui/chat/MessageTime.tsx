import { Check, CheckCheck, Clock, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InfoDisplayType = 'default' | 'image' | 'background';

export interface MessageTimeProps {
  date: number;
  out: boolean;
  read: boolean;
  edited?: boolean;
  sending?: boolean;
  views?: number;
  displayType?: InfoDisplayType;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function PureMessageTime({
  date,
  out,
  read,
  edited = false,
  sending = false,
  views,
  displayType = 'default',
}: MessageTimeProps) {
  const timeStr = date
    ? new Date(date * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const isOverlay = displayType === 'image' || displayType === 'background';

  /* ── Icon color ── */
  const iconColor = isOverlay ? 'text-white' : 'text-accent-blue';
  const unreadIconColor = isOverlay ? 'text-white/70' : 'text-text-quaternary';

  /* ── Read receipt / sending icon ── */
  const statusIcon = out ? (
    sending ? (
      <Clock size={12} className={unreadIconColor} />
    ) : read ? (
      <CheckCheck size={12} className={iconColor} />
    ) : (
      <Check size={12} className={unreadIconColor} />
    )
  ) : null;

  /* ── Text color per display type ── */
  const textColor =
    displayType === 'default'
      ? out
        ? 'text-accent-blue/70'
        : 'text-text-quaternary'
      : 'text-white';

  /* ── Container: pill background for image/background types ── */
  const wrapperClasses = cn(
    'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs leading-none',
    textColor,
    displayType === 'image' && 'rounded-[10px] bg-black/40 px-1.5 py-0.5',
    displayType === 'background' && 'rounded-[10px] bg-black/40 px-1.5 py-0.5',
  );

  return (
    <span data-testid="message-time" className={wrapperClasses}>
      {views !== undefined && (
        <>
          <Eye size={11} className="opacity-80" />
          <span className="mr-0.5">{formatViews(views)}</span>
        </>
      )}
      {edited && <span>edited</span>}
      <span>{timeStr}</span>
      {statusIcon}
    </span>
  );
}

export default PureMessageTime;
