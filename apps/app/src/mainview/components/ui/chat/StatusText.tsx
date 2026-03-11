import type { HeaderStatus } from '@/lib/store';
import { PureTypingIndicator } from './TypingIndicator';

export function PureStatusText({ status }: { status: HeaderStatus }) {
  if (!status) return null;

  if (status.type === 'typing') {
    return (
      <p className="text-xs">
        <PureTypingIndicator text={status.text} />
      </p>
    );
  }

  if (status.type === 'online') {
    return <p className="text-xs text-accent-blue">online</p>;
  }

  return <p className="text-xs text-text-quaternary">{status.text}</p>;
}
