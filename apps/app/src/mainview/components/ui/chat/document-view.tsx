import { ArrowDown, FileText } from 'lucide-react';
import { formatFileSize } from '@/lib/format';

export function PureDocumentView({
  fileName,
  fileSize,
  url,
}: {
  fileName: string;
  fileSize: number;
  url?: string;
}) {
  const inner = (
    <div
      data-testid="document-view"
      className={`flex items-center gap-3 py-1${url ? ' cursor-pointer' : ''}`}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-brand/10 text-accent-brand">
        {url ? <ArrowDown size={20} /> : <FileText size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{fileName}</p>
        <p className="text-xs text-text-tertiary">{formatFileSize(fileSize)}</p>
      </div>
    </div>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="no-underline">
        {inner}
      </a>
    );
  }

  return inner;
}
