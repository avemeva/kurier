import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PureEmojiStatusIcon({
  url,
  className,
}: {
  url: string | null;
  className?: string;
}) {
  if (!url) {
    return <Star size={12} className={cn('shrink-0 fill-unread text-unread', className)} />;
  }
  return (
    <img
      src={url}
      alt=""
      className={cn('inline-block size-[18px] shrink-0 object-contain', className)}
    />
  );
}
