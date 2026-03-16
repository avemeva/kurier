import { cn } from '@/lib/utils';

export type ReactionInfo = {
  emoticon: string;
  count: number;
  chosen: boolean;
};

export const QUICK_REACTIONS = ['❤️', '👍', '🔥', '🤝', '😁', '😈', '😎'];

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
