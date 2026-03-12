export type WebPreview = {
  url: string;
  siteName: string;
  title: string;
  description: string;
  minithumbnail?: string | null;
  thumbUrl?: string | null;
};

export function PureLinkPreviewCard({ preview }: { preview: WebPreview }) {
  if (!preview.title && !preview.description) return null;
  const thumbSrc =
    preview.thumbUrl ??
    (preview.minithumbnail ? `data:image/jpeg;base64,${preview.minithumbnail}` : null);
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex gap-2.5 overflow-hidden rounded-lg border-l-2 border-accent-blue bg-code-bg px-3 py-2 transition-colors hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        {preview.siteName && (
          <p className="truncate text-xs text-text-tertiary">{preview.siteName}</p>
        )}
        {preview.title && (
          <p className="break-words text-xs font-semibold text-text-primary">{preview.title}</p>
        )}
        {preview.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{preview.description}</p>
        )}
      </div>
      {thumbSrc && (
        <img src={thumbSrc} alt="" className="size-14 shrink-0 self-center rounded object-cover" />
      )}
    </a>
  );
}
