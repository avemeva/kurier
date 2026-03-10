import type { ReactNode } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';

export type GroupPosition = 'single' | 'first' | 'middle' | 'last';

export type PureBubbleProps = {
  isOutgoing: boolean;
  groupPosition: GroupPosition;
  showAvatar: boolean;
  senderName?: string;
  senderPhotoUrl?: string;
  hasReactions?: boolean;
  className?: string;
  children: ReactNode;
};

function bubbleRadius(pos: GroupPosition, isOutgoing: boolean): string {
  const sm = '4px';
  const lg = '12px';
  if (pos === 'single') return lg;
  if (isOutgoing) {
    switch (pos) {
      case 'first':
        return `${lg} ${lg} ${sm} ${lg}`;
      case 'middle':
        return `${lg} ${sm} ${sm} ${lg}`;
      case 'last':
        return `${lg} ${sm} ${lg} ${lg}`;
    }
  } else {
    switch (pos) {
      case 'first':
        return `${lg} ${lg} ${lg} ${sm}`;
      case 'middle':
        return `${sm} ${lg} ${lg} ${sm}`;
      case 'last':
        return `${sm} ${lg} ${lg} ${lg}`;
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
  className,
  children,
}: PureBubbleProps) {
  const bubble = (
    <div
      data-testid="message-bubble"
      data-is-outgoing={isOutgoing ? 'true' : 'false'}
      className={cn(
        'group/bubble relative px-3 py-1.5',
        isOutgoing ? 'bg-message-own' : 'bg-message-peer',
        hasReactions && 'pb-5',
        showAvatar ? 'max-w-[calc(100%-36px)]' : 'max-w-[55%]',
        className,
      )}
      style={{ borderRadius: bubbleRadius(groupPosition, isOutgoing) }}
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
        className="size-7 shrink-0 text-[11px]"
      />
      {bubble}
    </div>
  );
}
