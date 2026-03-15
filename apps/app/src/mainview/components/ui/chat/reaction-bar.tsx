import { useState } from 'react';
import { cn } from '@/lib/utils';

export type ReactionInfo = {
  emoticon: string;
  count: number;
  chosen: boolean;
};

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

export function PureReactionBar({
  reactions,
  onReact,
  className,
  children,
}: {
  reactions: ReactionInfo[];
  onReact: (emoticon: string, chosen: boolean) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('mt-1 flex flex-wrap items-center gap-1', className)}>
      {reactions.map((r) => (
        <button
          key={r.emoticon}
          type="button"
          onClick={() => onReact(r.emoticon, r.chosen)}
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-1 leading-none transition-colors',
            r.chosen
              ? 'border-reaction-border-chosen bg-reaction-bg-chosen text-reaction-text-chosen'
              : 'border-reaction-border bg-reaction-bg text-reaction-text hover:brightness-95',
          )}
        >
          <span className="text-[15px] leading-none">{r.emoticon}</span>
          <span className="text-xs leading-none font-extrabold">{r.count}</span>
        </button>
      ))}
      {children && <span className="ml-auto">{children}</span>}
    </div>
  );
}

export function PureReactionPicker({
  onReact,
  className,
}: {
  onReact: (emoticon: string, chosen: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'absolute -right-1 -top-3 hidden rounded-full bg-card px-1 py-0.5 text-xs shadow group-hover/bubble:block',
          className,
        )}
      >
        +
      </button>
    );
  }
  return (
    <div
      className={cn(
        'absolute -top-8 right-0 z-10 flex gap-0.5 rounded-full bg-popover px-1 py-0.5 shadow-md',
        className,
      )}
    >
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => {
            onReact(e, false);
            setOpen(false);
          }}
          className="rounded p-0.5 text-sm transition-transform hover:scale-125"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
