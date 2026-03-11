export function PureForwardHeader({ fromName }: { fromName: string }) {
  return (
    <div className="mb-1 border-l-2 border-forward pl-2">
      <p className="text-xs font-medium text-muted-foreground">Forwarded from</p>
      <p className="text-xs font-semibold text-forward">{fromName}</p>
    </div>
  );
}
