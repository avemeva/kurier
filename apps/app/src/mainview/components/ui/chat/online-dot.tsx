import { cn } from '@/lib/utils';

export function PureOnlineDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-online',
        className,
      )}
    />
  );
}
