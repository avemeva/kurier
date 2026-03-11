export type WebPreview = {
  url: string;
  siteName: string;
  title: string;
  description: string;
};

export function PureLinkPreviewCard({ preview }: { preview: WebPreview }) {
  if (!preview.title && !preview.description) return null;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-lg border-l-2 border-accent-blue bg-code-bg px-3 py-2 transition-colors hover:bg-accent"
    >
      {preview.siteName && <p className="text-xs text-text-tertiary">{preview.siteName}</p>}
      {preview.title && <p className="text-xs font-semibold text-text-primary">{preview.title}</p>}
      {preview.description && (
        <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{preview.description}</p>
      )}
    </a>
  );
}
