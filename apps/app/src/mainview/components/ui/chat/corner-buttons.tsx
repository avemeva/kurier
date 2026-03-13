import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PureCornerButtonProps = {
  icon: ReactNode;
  count?: number;
  onClick: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;

/** Round button with icon slot and optional count badge. Pure — knows nothing about what it's for. */
export function PureCornerButton({
  icon,
  count,
  onClick,
  className,
  ...props
}: PureCornerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...props}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        'bg-surface-panel shadow-md transition-colors',
        'hover:bg-surface-panel-hover active:bg-surface-panel-active',
        className,
      )}
    >
      {icon}
      {count != null && count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-medium text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

/** Vertical stack, sticky bottom-right of scroll container. Just layout. */
export function PureCornerButtonStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1',
        className,
      )}
    >
      <div className="pointer-events-auto flex flex-col items-center gap-1">{children}</div>
    </div>
  );
}
