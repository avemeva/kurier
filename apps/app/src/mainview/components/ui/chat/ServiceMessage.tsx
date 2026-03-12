export function PureServiceMessage({ text, onClick }: { text: string; onClick?: () => void }) {
  if (onClick) {
    return (
      <div className="flex justify-center py-1">
        <button
          type="button"
          className="rounded-full border border-border bg-accent/80 px-3 py-0.5 text-xs text-text-tertiary cursor-pointer hover:bg-accent"
          onClick={onClick}
        >
          {text}
        </button>
      </div>
    );
  }
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full border border-border bg-accent/80 px-3 py-0.5 text-xs text-text-tertiary">
        {text}
      </span>
    </div>
  );
}
