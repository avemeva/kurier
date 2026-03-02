export function PureForwardHeader({ fromName }: { fromName: string }) {
  return (
    <div className="mb-1 border-l-2 border-forward pl-2">
      <p className="text-[10px] font-medium text-muted-foreground">Forwarded from</p>
      <p className="text-[11px] font-semibold leading-[14px] text-forward">{fromName}</p>
    </div>
  );
}
