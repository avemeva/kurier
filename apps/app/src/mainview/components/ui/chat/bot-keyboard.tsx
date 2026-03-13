import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KeyboardButton {
  text: string;
  url?: string;
}

export interface KeyboardRow {
  buttons: KeyboardButton[];
}

export function PureBotKeyboard({
  rows,
  onButtonClick,
  className,
}: {
  rows: KeyboardRow[];
  onButtonClick?: (button: KeyboardButton) => void;
  className?: string;
}) {
  return (
    <div className={cn('mt-1 flex flex-col gap-1', className)}>
      {rows.map((row) => (
        <div key={row.buttons.map((b) => b.text).join('|')} className="flex gap-1">
          {row.buttons.map((btn) => (
            <button
              key={btn.text}
              type="button"
              onClick={() => {
                if (btn.url) {
                  window.open(btn.url, '_blank', 'noopener,noreferrer');
                }
                onButtonClick?.(btn);
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-accent-brand/50 bg-accent-brand-subtle px-3 py-1.5 text-xs font-medium text-accent-brand transition-colors hover:bg-accent-brand-subtle/80 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {btn.text}
              {btn.url && <ExternalLink size={10} className="shrink-0 opacity-60" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
