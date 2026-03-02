import { Star } from 'lucide-react';

export function PureEmojiStatusIcon({ url }: { url: string | null }) {
  if (!url) {
    return <Star size={12} className="shrink-0 fill-unread text-unread" />;
  }
  return <img src={url} alt="" className="inline-block size-[18px] shrink-0 object-contain" />;
}
