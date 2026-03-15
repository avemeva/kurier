import { useEffect, useState } from 'react';
import { PureChatView } from '@/components/ui/chat/pure-chat-view';
import type { ChatKind, TGMessage } from '@/data';

type FixtureData = {
  messages: TGMessage[];
  chatKind: ChatKind;
  // Legacy single-message format
  message?: TGMessage;
  showSender?: boolean;
  groupPosition?: string;
};

type Props = {
  name: string;
  navigate: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

const noop = () => {};

export function FixturePage({ name, navigate }: Props) {
  const [fixture, setFixture] = useState<{ messages: TGMessage[]; chatKind: ChatKind } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFixture(null);
    setError(null);
    fetch(`/dev/fixtures/${name}/fixture.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: FixtureData) => {
        // Support both formats: { messages, chatKind } and legacy { message, showSender }
        if (data.messages) {
          setFixture({ messages: data.messages, chatKind: data.chatKind ?? 'private' });
        } else if (data.message) {
          setFixture({
            messages: [data.message],
            chatKind: data.showSender ? 'supergroup' : 'private',
          });
        }
      })
      .catch((err: Error) => {
        setError(err.message);
      });
  }, [name]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div data-testid="fixture-error" className="text-center">
          <p className="text-lg font-semibold text-red-500">Failed to load fixture</p>
          <p className="mt-2 text-sm text-text-secondary">
            Fixture &quot;{name}&quot;: {error}
          </p>
          <a
            href="/dev"
            onClick={navigate}
            className="mt-4 inline-block text-sm text-accent-brand hover:underline"
          >
            Back to index
          </a>
        </div>
      </div>
    );
  }

  if (!fixture) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-secondary">Loading...</p>
      </div>
    );
  }

  const msg = fixture.messages[0];
  const contentKind = msg?.kind === 'message' ? msg.content.kind : (msg?.kind ?? 'unknown');
  const direction = msg?.kind === 'message' ? (msg.isOutgoing ? 'outgoing' : 'incoming') : 'n/a';

  return (
    <div className="flex h-screen flex-col bg-background">
      <div data-testid="fixture-meta" className="shrink-0 border-b border-border-primary px-4 py-2">
        <div className="flex items-center gap-4">
          <a href="/dev" onClick={navigate} className="text-sm text-accent-brand hover:underline">
            Back to index
          </a>
          <h1 className="text-sm font-semibold text-text-primary">{name}</h1>
          <div
            data-testid="fixture-state"
            className="ml-auto flex gap-3 text-xs text-text-tertiary"
          >
            <span>{contentKind}</span>
            <span>{direction}</span>
            <span>{fixture.chatKind}</span>
          </div>
        </div>
      </div>

      <ResizableChat>
        <div data-testid="fixture-message" className="flex-1 overflow-y-auto bg-chat-bg px-4 py-6">
          <PureChatView
            messages={fixture.messages}
            chatKind={fixture.chatKind}
            onReact={noop}
            onReplyClick={noop}
            onTranscribe={noop}
          />
        </div>
      </ResizableChat>
    </div>
  );
}

/** Resizable container — drag the right edge to test at different widths. Full width by default. */
function ResizableChat({ children }: { children: React.ReactNode }) {
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const container = document.getElementById('resizable-chat');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setCustomWidth(Math.max(280, e.clientX - rect.left));
    };

    const onMouseUp = () => setDragging(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging]);

  return (
    <div className="relative flex flex-1">
      <div
        id="resizable-chat"
        className="relative flex flex-1"
        style={customWidth ? { width: customWidth, flex: 'none' } : undefined}
      >
        {children}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle for dev tool */}
        <div
          className="absolute top-0 right-0 bottom-0 z-10 flex w-3 cursor-col-resize items-center justify-center bg-border-primary/50 hover:bg-accent-brand/40 active:bg-accent-brand/60"
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
        >
          <div className="h-8 w-1 rounded-full bg-text-quaternary" />
        </div>
      </div>
      {/* Width indicator — only when resized */}
      {customWidth && (
        <div className="flex items-start pt-2 pl-2 text-xs text-text-quaternary">
          {Math.round(customWidth)}px
        </div>
      )}
    </div>
  );
}
