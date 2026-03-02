export function PureTypingIndicator({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-accent-blue">
      <span className="text-xs">{text}</span>
      <span className="mt-px flex items-center gap-[2px]">
        <span className="size-[3px] animate-bounce rounded-full bg-accent-blue [animation-delay:0ms]" />
        <span className="size-[3px] animate-bounce rounded-full bg-accent-blue [animation-delay:150ms]" />
        <span className="size-[3px] animate-bounce rounded-full bg-accent-blue [animation-delay:300ms]" />
      </span>
    </span>
  );
}
