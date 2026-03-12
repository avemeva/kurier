import { cn } from '@/lib/utils';

const COLORS = [
  'bg-avatar-1 text-white',
  'bg-avatar-2 text-white',
  'bg-avatar-3 text-white',
  'bg-avatar-4 text-white',
  'bg-avatar-5 text-white',
];

function Avatar({
  name,
  src,
  className,
  children,
}: {
  name?: string;
  src?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  if (children) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-full',
          className,
        )}
      >
        {children}
      </div>
    );
  }

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        data-testid="avatar-img"
        className={cn('rounded-full object-cover', className)}
      />
    );
  }

  const initials = (name ?? '')
    .split(/[\s]+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const hash = (name ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const color = COLORS[hash % COLORS.length];

  return (
    <div
      className={cn('flex items-center justify-center rounded-full font-medium', color, className)}
    >
      {initials || '?'}
    </div>
  );
}

function AvatarImage({ src, alt, className }: { src?: string; alt?: string; className?: string }) {
  if (!src) return null;
  return <img src={src} alt={alt ?? ''} className={cn('h-full w-full object-cover', className)} />;
}

function AvatarFallback({ children }: { children: React.ReactNode; delayMs?: number }) {
  return <>{children}</>;
}

export { Avatar, AvatarFallback, AvatarImage };
