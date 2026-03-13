import { ArrowUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PureMessageInput({
  onSend,
  className,
}: {
  onSend: (text: string) => Promise<void>;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={cn('border-t border-border px-4 py-2', className)}>
      <div className="flex items-end gap-2 rounded-2xl border border-input bg-background transition-shadow has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20">
        <textarea
          aria-label="Type a message"
          data-testid="message-input"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Button
          aria-label="Send message"
          data-testid="send-button"
          size="icon-sm"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="my-1 mr-1 shrink-0 rounded-full"
        >
          <ArrowUp size={16} />
        </Button>
      </div>
    </div>
  );
}
