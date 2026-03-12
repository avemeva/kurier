import { UserAvatar } from '../user-avatar';

export function PureForwardHeader({ fromName, photoUrl }: { fromName: string; photoUrl?: string }) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <span className="text-xs text-forward">Forwarded from</span>
      <UserAvatar name={fromName} src={photoUrl} className="size-4 text-[6px]" />
      <span className="text-xs font-semibold text-forward">{fromName}</span>
    </div>
  );
}
