import type { HeaderStatus } from '@/data';
import { cn } from '@/lib/utils';
import { PureTypingIndicator } from './typing-indicator';

export function PureStatusText({
  status,
  className,
}: {
  status: HeaderStatus;
  className?: string;
}) {
  if (!status) return null;

  if (status.type === 'typing') {
    return (
      <p className={cn('text-xs', className)}>
        <PureTypingIndicator text={status.text} />
      </p>
    );
  }

  if (status.type === 'online') {
    return <p className={cn('text-xs text-accent-brand', className)}>online</p>;
  }

  return <p className={cn('text-xs text-text-quaternary', className)}>{status.text}</p>;
}
