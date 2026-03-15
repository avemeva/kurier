import { useEffect, useState } from 'react';
import { PureChatView } from '@/components/ui/chat/pure-chat-view';
import type { ChatKind, TGMessage } from '@/data';

type FixtureEntry = {
  name: string;
  description: string;
  contentKind: string;
};

type LoadedFixture = {
  name: string;
  description: string;
  contentKind: string;
  messages: TGMessage[];
  chatKind: ChatKind;
};

type Props = {
  navigate: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

const noop = () => {};

/** Pretty section title from contentKind slug */
function sectionTitle(kind: string): string {
  const titles: Record<string, string> = {
    'private-text': 'Private Chat \u2014 Text',
    'text-formatting': 'Text Formatting',
    replies: 'Replies',
    reactions: 'Reactions',
    photo: 'Photos',
    video: 'Videos',
    voice: 'Voice Messages',
    animation: 'Animations (GIF)',
    videoNote: 'Video Notes',
    sticker: 'Stickers',
    album: 'Albums',
    forward: 'Forwarded Messages',
    'group-chat': 'Group Chat',
    channel: 'Channel',
    service: 'Service Messages',
    grouping: 'Message Grouping',
    document: 'Documents',
    pending: 'Pending Messages',
  };
  return titles[kind] ?? kind.toUpperCase();
}

export function FixtureIndex({ navigate }: Props) {
  const [fixtures, setFixtures] = useState<LoadedFixture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/dev/fixtures/manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(async (manifest: FixtureEntry[]) => {
        // Load all fixture.json files in parallel
        const loaded = await Promise.all(
          manifest.map(async (entry) => {
            try {
              const res = await fetch(`/dev/fixtures/${entry.name}/fixture.json`);
              if (!res.ok) return null;
              const data = await res.json();
              const messages: TGMessage[] = data.messages ?? (data.message ? [data.message] : []);
              const chatKind: ChatKind =
                data.chatKind ?? (data.showSender ? 'supergroup' : 'private');
              return { ...entry, messages, chatKind } as LoadedFixture;
            } catch {
              return null;
            }
          }),
        );
        setFixtures(loaded.filter((f): f is LoadedFixture => f !== null));
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Group fixtures by contentKind, preserving insertion order
  const grouped = new Map<string, LoadedFixture[]>();
  for (const f of fixtures) {
    const group = grouped.get(f.contentKind) ?? [];
    group.push(f);
    grouped.set(f.contentKind, group);
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 border-b border-border-primary bg-background px-6 py-3">
        <h1 className="text-lg font-bold text-text-primary">
          Dev Harness
          {!loading && (
            <span className="ml-2 text-sm font-normal text-text-tertiary">
              {fixtures.length} fixtures
            </span>
          )}
        </h1>
      </div>
      {loading && <p className="p-8 text-text-secondary">Loading fixtures...</p>}
      {error && <p className="p-8 text-red-500">Failed to load manifest: {error}</p>}
      {!loading && !error && (
        <div data-testid="fixture-list" className="space-y-8 p-6">
          {[...grouped.entries()].map(([kind, entries]) => {
            // Concatenate all messages from fixtures of this kind into one list,
            // interleaving fixture-name labels as service messages for visual separation.
            const allMessages: TGMessage[] = [];
            // Determine the dominant chatKind for the group (use first fixture's)
            const chatKind = entries[0].chatKind;

            for (const f of entries) {
              for (const msg of f.messages) {
                allMessages.push(msg);
              }
            }

            return (
              <section key={kind}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
                  {sectionTitle(kind)}
                </h2>
                {/* Fixture labels as links above the combined chat view */}
                <div className="mb-2 flex flex-wrap gap-2">
                  {entries.map((f) => (
                    <a
                      key={f.name}
                      href={`/dev/fixture/${f.name}`}
                      onClick={navigate}
                      className="rounded-md border border-border-primary px-2 py-0.5 text-xs text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
                    >
                      {f.name}
                    </a>
                  ))}
                </div>
                <div className="rounded-lg border border-border-primary bg-chat-bg px-4 py-4">
                  <PureChatView
                    messages={allMessages}
                    chatKind={chatKind}
                    onReact={noop}
                    onReplyClick={noop}
                    onTranscribe={noop}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
