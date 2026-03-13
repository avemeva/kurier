import { cn } from '@/lib/utils';

export function PurePhotoView({
  url,
  loading,
  cover,
  onRetry,
  width,
  height,
  minithumbnail,
  className,
}: {
  url: string | null;
  loading?: boolean;
  cover?: boolean;
  onRetry?: () => void;
  width?: number;
  height?: number;
  minithumbnail?: string | null;
  className?: string;
}) {
  const hasDimensions = width != null && height != null;

  // Cover mode takes priority — unchanged behavior
  if (cover) {
    if (loading) {
      return <div className={cn('h-full w-full animate-pulse bg-muted', className)} />;
    }
    if (!url) {
      const Container = onRetry ? 'button' : 'div';
      return (
        <Container
          type={onRetry ? 'button' : undefined}
          onClick={onRetry}
          className={cn(
            'h-full w-full bg-accent',
            onRetry && 'cursor-pointer transition-colors hover:bg-accent/80',
            className,
          )}
        />
      );
    }
    return <img src={url} className={cn('h-full w-full object-cover', className)} alt="" />;
  }

  // Metadata-driven path: explicit width/height from photo dimensions
  // Use maxWidth + aspectRatio instead of fixed pixel w/h so the photo
  // shrinks to fit the bubble when max-w-[55%] is narrower than displayWidth.
  if (hasDimensions) {
    const sizeStyle = {
      width: '100%',
      maxWidth: width,
      aspectRatio: `${width} / ${height}`,
    } as const;

    if (loading) {
      if (minithumbnail) {
        return (
          <div style={sizeStyle} className={cn('relative overflow-hidden', className)}>
            <img
              src={`data:image/jpeg;base64,${minithumbnail}`}
              className="h-full w-full object-cover blur-[20px] scale-110"
              alt=""
            />
          </div>
        );
      }
      return <div style={sizeStyle} className={cn('animate-pulse bg-muted', className)} />;
    }
    if (!url) {
      const Container = onRetry ? 'button' : 'div';
      return (
        <Container
          type={onRetry ? 'button' : undefined}
          onClick={onRetry}
          style={sizeStyle}
          className={cn(
            'bg-accent',
            onRetry && 'cursor-pointer transition-colors hover:bg-accent/80',
            className,
          )}
        />
      );
    }
    // Use minithumbnail for blur background (uniform colors, like Telegram).
    // Falls back to the full image if no minithumbnail available.
    const blurSrc = minithumbnail ? `data:image/jpeg;base64,${minithumbnail}` : url;
    return (
      <div style={sizeStyle} className={cn('relative overflow-hidden', className)}>
        <img
          src={blurSrc}
          className="absolute inset-0 h-full w-full object-cover blur-[20px] scale-110"
          alt=""
        />
        <div className="relative flex h-full w-full items-center justify-center">
          <img src={url} className="max-h-full max-w-full" alt="" />
        </div>
      </div>
    );
  }

  // Fallback path: no dimensions provided — original behavior
  if (loading) {
    return (
      <div
        className={cn('aspect-video w-full max-w-xs animate-pulse rounded-lg bg-muted', className)}
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
          'aspect-video w-full max-w-xs rounded bg-accent',
          onRetry && 'cursor-pointer transition-colors hover:bg-accent/80',
          className,
        )}
      />
    );
  }
  return <img src={url} className={cn('max-h-80 max-w-full rounded', className)} alt="" />;
}
