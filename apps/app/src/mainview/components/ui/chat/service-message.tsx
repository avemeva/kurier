import { cn } from '@/lib/utils';

export function PureServiceMessage({
  text,
  onClick,
  className,
}: {
  text: string;
  onClick?: () => void;
  className?: string;
}) {
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
