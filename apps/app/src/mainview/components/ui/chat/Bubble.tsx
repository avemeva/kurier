import type { ReactNode } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';

export type GroupPosition = 'single' | 'first' | 'middle' | 'last';

export type BubbleVariant = 'filled' | 'media' | 'framed';

export type PureBubbleProps = {
  isOutgoing: boolean;
  groupPosition: GroupPosition;
  showAvatar: boolean;
  senderName?: string;
  senderPhotoUrl?: string;
  hasReactions?: boolean;
  variant?: BubbleVariant;
  className?: string;
  children: ReactNode;
};

const R_LG = 'rounded-[var(--bubble-r-lg)]';

/** Map group position + direction to per-corner Tailwind radius classes. */
function bubbleRadiusClasses(pos: GroupPosition, isOutgoing: boolean): string {
  // single: all corners large
  if (pos === 'single') return R_LG;

  // Per-corner classes: tl tr br bl
  if (isOutgoing) {
    switch (pos) {
      case 'first':
        return `rounded-tl-[var(--bubble-r-lg)] rounded-tr-[var(--bubble-r-lg)] rounded-br-[var(--bubble-r-sm)] rounded-bl-[var(--bubble-r-lg)]`;
      case 'middle':
        return `rounded-tl-[var(--bubble-r-lg)] rounded-tr-[var(--bubble-r-sm)] rounded-br-[var(--bubble-r-sm)] rounded-bl-[var(--bubble-r-lg)]`;
      case 'last':
        return `rounded-tl-[var(--bubble-r-lg)] rounded-tr-[var(--bubble-r-sm)] rounded-br-[var(--bubble-r-lg)] rounded-bl-[var(--bubble-r-lg)]`;
    }
  } else {
    switch (pos) {
      case 'first':
        return `rounded-tl-[var(--bubble-r-lg)] rounded-tr-[var(--bubble-r-lg)] rounded-br-[var(--bubble-r-lg)] rounded-bl-[var(--bubble-r-sm)]`;
      case 'middle':
        return `rounded-tl-[var(--bubble-r-sm)] rounded-tr-[var(--bubble-r-lg)] rounded-br-[var(--bubble-r-lg)] rounded-bl-[var(--bubble-r-sm)]`;
      case 'last':
        return `rounded-tl-[var(--bubble-r-sm)] rounded-tr-[var(--bubble-r-lg)] rounded-br-[var(--bubble-r-lg)] rounded-bl-[var(--bubble-r-lg)]`;
    }
  }
}

export function PureBubble({
  isOutgoing,
  groupPosition,
  showAvatar,
  senderName,
  senderPhotoUrl,
  hasReactions,
  variant = 'filled',
  className,
  children,
}: PureBubbleProps) {
  const bubble = (
    <div
      data-testid="message-bubble"
      data-is-outgoing={isOutgoing ? 'true' : 'false'}
      className={cn(
        'group/bubble relative',
        bubbleRadiusClasses(groupPosition, isOutgoing),
        variant === 'filled' && 'px-3 py-1.5',
        variant !== 'media' && (isOutgoing ? 'bg-message-own' : 'bg-message-peer'),
        variant !== 'filled' && 'overflow-hidden',
        hasReactions && 'pb-5',
        showAvatar ? 'max-w-[calc(100%-36px)]' : 'max-w-[55%]',
        className,
      )}
    >
      {children}
    </div>
  );

  if (!showAvatar) return bubble;

  return (
    <div className="flex max-w-[55%] items-end gap-2">
      <UserAvatar
        name={senderName ?? ''}
        src={senderPhotoUrl}
        className="size-7 shrink-0 text-xs"
      />
      {bubble}
    </div>
  );
}
