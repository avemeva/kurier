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
}: {
  reactions: ReactionInfo[];
  onReact: (emoticon: string, chosen: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn('mt-1 flex flex-wrap gap-1', className)}>
      {reactions.map((r) => (
        <button
          key={r.emoticon}
          type="button"
          onClick={() => onReact(r.emoticon, r.chosen)}
          className={cn(
            'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 leading-none transition-colors',
            r.chosen
              ? 'border-accent-brand/40 bg-accent-brand/15 text-accent-brand'
              : 'border-border/50 bg-accent/60 text-text-secondary hover:bg-accent/80',
          )}
        >
          <span className="text-[15px] leading-none">{r.emoticon}</span>
          <span className="text-xs leading-none font-medium">{r.count}</span>
        </button>
      ))}
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
