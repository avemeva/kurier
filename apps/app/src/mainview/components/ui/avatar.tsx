import { cn } from '@/lib/utils';

const COLORS = [
  'bg-blue-9 text-white',
  'bg-plum-9 text-white',
  'bg-green-9 text-white',
  'bg-red-9 text-white',
  'bg-sand-9 text-white',
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
    return <img src={src} alt={name} className={cn('rounded-full object-cover', className)} />;
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
