import type { TGServiceAction } from '@/data';
import { cn } from '@/lib/utils';

function actionText(senderName: string, action: TGServiceAction): string {
  switch (action.type) {
    case 'pin':
      return action.previewText
        ? `${senderName} pinned "${action.previewText}"`
        : `${senderName} pinned a message`;
    case 'join':
      return `${senderName} joined the group`;
    case 'leave':
      return `${senderName} left the group`;
    case 'changeTitle':
      return `${senderName} changed group name to "${action.title}"`;
    case 'changePhoto':
      return `${senderName} changed group photo`;
    case 'deletePhoto':
      return `${senderName} removed group photo`;
    case 'createGroup':
      return `${senderName} created group "${action.title}"`;
    case 'screenshot':
      return `${senderName} took a screenshot`;
    case 'joinByLink':
      return `${senderName} joined via invite link`;
    case 'joinByRequest':
      return `${senderName} was accepted to the group`;
    case 'custom':
      return action.text;
  }
}

export function PureServiceMessage({
  senderName,
  action,
  onClick,
  className,
}: {
  senderName: string;
  action: TGServiceAction;
  onClick?: () => void;
  className?: string;
}) {
  const text = actionText(senderName, action);

  if (onClick) {
    return (
      <div className={cn('flex justify-center py-1', className)}>
        <button
          type="button"
          className="cursor-pointer rounded-full border border-border bg-accent/80 px-3 py-0.5 text-xs text-text-tertiary hover:bg-accent"
          onClick={onClick}
        >
          {text}
        </button>
      </div>
    );
  }
  return (
    <div className={cn('flex justify-center py-1', className)}>
      <span className="rounded-full border border-border bg-accent/80 px-3 py-0.5 text-xs text-text-tertiary">
        {text}
      </span>
    </div>
  );
}
