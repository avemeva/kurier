import { cn } from '@/lib/utils';

export function PureTypingIndicator({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-accent-brand', className)}>
      <span className="text-xs">{text}</span>
      <span className="mt-px flex items-center gap-[2px]">
        <span className="size-[3px] animate-bounce rounded-full bg-accent-brand [animation-delay:0ms]" />
        <span className="size-[3px] animate-bounce rounded-full bg-accent-brand [animation-delay:150ms]" />
        <span className="size-[3px] animate-bounce rounded-full bg-accent-brand [animation-delay:300ms]" />
      </span>
    </span>
  );
}
