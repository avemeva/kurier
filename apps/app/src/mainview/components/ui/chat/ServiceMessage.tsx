export function PureServiceMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full border border-border bg-accent/80 px-3 py-0.5 text-xs text-text-tertiary">
        {text}
      </span>
    </div>
  );
}
