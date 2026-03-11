import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PureCornerButtonProps = {
  icon: ReactNode;
  count?: number;
  onClick: () => void;
};

/** Round button with icon slot and optional count badge. Pure — knows nothing about what it's for. */
export function PureCornerButton({ icon, count, onClick }: PureCornerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        'bg-surface-panel shadow-md transition-colors',
        'hover:bg-surface-panel-hover active:bg-surface-panel-active',
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
export function PureCornerButtonStack({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1">
      <div className="pointer-events-auto flex flex-col items-center gap-1">{children}</div>
    </div>
  );
}
