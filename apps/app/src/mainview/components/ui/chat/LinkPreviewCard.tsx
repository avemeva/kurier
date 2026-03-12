import { cn } from '@/lib/utils';

export type WebPreview = {
  url: string;
  siteName: string;
  title: string;
  description: string;
  minithumbnail?: string | null;
  thumbUrl?: string | null;
  showLargeMedia?: boolean;
  showMediaAboveDescription?: boolean;
};

function TextContent({ preview }: { preview: WebPreview }) {
  return (
    <>
      {preview.siteName && (
        <p className="truncate text-xs text-text-tertiary">{preview.siteName}</p>
      )}
      {preview.title && (
        <p className="break-words text-xs font-semibold text-text-primary">{preview.title}</p>
      )}
      {preview.description && (
        <p className="mt-0.5 line-clamp-3 text-xs text-text-secondary">{preview.description}</p>
      )}
    </>
  );
}

export function PureLinkPreviewCard({
  preview,
  className,
}: {
  preview: WebPreview;
  className?: string;
}) {
  if (!preview.title && !preview.description) return null;
  const thumbSrc =
    preview.thumbUrl ??
    (preview.minithumbnail ? `data:image/jpeg;base64,${preview.minithumbnail}` : null);
  const isLarge = preview.showLargeMedia && thumbSrc;

  if (isLarge) {
    return (
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('mt-1 block border-l-2 border-accent-brand pl-2.5', className)}
      >
        <TextContent preview={preview} />
        <img src={thumbSrc} alt="" className="mt-1.5 w-full rounded-lg object-cover" />
      </a>
    );
  }

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('mt-1 flex gap-2.5 border-l-2 border-accent-brand pl-2.5', className)}
    >
      <div className="min-w-0 flex-1">
        <TextContent preview={preview} />
      </div>
      {thumbSrc && (
        <img src={thumbSrc} alt="" className="size-14 shrink-0 self-center rounded object-cover" />
      )}
    </a>
  );
}
