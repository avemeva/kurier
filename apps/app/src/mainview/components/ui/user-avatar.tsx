import { Avatar } from './avatar';

/** Pure user avatar — resolves name to initials/color, displays photo when src is provided. */
export function UserAvatar({
  name,
  src,
  className,
  children,
}: {
  name: string;
  src?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Avatar name={name} src={src} className={className}>
      {children}
    </Avatar>
  );
}
