import { ArrowDown, FileText } from 'lucide-react';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PureDocumentView({
  fileName,
  fileSize,
  downloaded,
  onClick,
}: {
  fileName: string;
  fileSize: number;
  downloaded: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="document-view"
      className={cn(
        'flex w-full items-center gap-3 rounded-lg py-1 text-left',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          downloaded ? 'bg-accent-brand text-white' : 'bg-accent-brand/10 text-accent-brand',
        )}
      >
        {downloaded ? <FileText size={20} /> : <ArrowDown size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{fileName}</p>
        <p className="text-xs text-text-tertiary">{formatFileSize(fileSize)}</p>
      </div>
    </button>
  );
}
