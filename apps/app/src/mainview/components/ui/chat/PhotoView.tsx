import { cn } from '@/lib/utils';

export function PurePhotoView({
  url,
  loading,
  cover,
  onRetry,
}: {
  url: string | null;
  loading?: boolean;
  cover?: boolean;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div
        className={cn(
          'animate-pulse bg-muted',
          cover ? 'h-full w-full' : 'aspect-video w-full max-w-xs rounded-lg',
        )}
      />
    );
  }
  if (!url) {
    const Container = onRetry ? 'button' : 'div';
    return (
      <Container
        type={onRetry ? 'button' : undefined}
        onClick={onRetry}
        className={cn(
          'bg-accent',
          cover ? 'h-full w-full' : 'aspect-video w-full max-w-xs rounded',
          onRetry && 'cursor-pointer transition-colors hover:bg-accent/80',
        )}
      />
    );
  }
  if (cover) {
    return <img src={url} className="h-full w-full object-cover" alt="" />;
  }
  return <img src={url} className="max-h-80 max-w-full rounded" alt="" />;
}
