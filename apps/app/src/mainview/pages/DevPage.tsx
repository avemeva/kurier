import { Agentation } from 'agentation';
import { AtSign, BellOff, Pin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PureFormattedText } from '@/components/chat/PureFormattedText';
import { PureMessageRow } from '@/components/chat/PureMessageRow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PureBotKeyboard } from '@/components/ui/chat/BotKeyboard';
import { PureEmojiStatusIcon } from '@/components/ui/chat/EmojiStatusIcon';
import { PureForwardHeader } from '@/components/ui/chat/ForwardHeader';
import { PureLinkPreviewCard } from '@/components/ui/chat/LinkPreviewCard';
import { PureMessageInput } from '@/components/ui/chat/MessageInput';
import { PureMessageTime } from '@/components/ui/chat/MessageTime';
import { PureOnlineDot } from '@/components/ui/chat/OnlineDot';
import { PurePhotoView } from '@/components/ui/chat/PhotoView';
import { PureReactionBar, PureReactionPicker } from '@/components/ui/chat/ReactionBar';
import { PureReplyHeader } from '@/components/ui/chat/ReplyHeader';
import { PureServiceMessage } from '@/components/ui/chat/ServiceMessage';
import { PureTypingIndicator } from '@/components/ui/chat/TypingIndicator';
import { PureVideoView } from '@/components/ui/chat/VideoView';
import { PureVoiceView } from '@/components/ui/chat/VoiceView';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { UserAvatar } from '@/components/ui/user-avatar';
import { log } from '@/lib/log';
import { groupUIMessages, type UIMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CHATS, HEADER_STATES, MEDIA_URLS, MESSAGES, PROFILE_PHOTOS } from './dev-data';

// ---------------------------------------------------------------------------
// Nav sections: [anchor, label]
// ---------------------------------------------------------------------------

const SECTIONS: [string, string][] = [
  ['ui-primitives', 'UI Primitives'],
  ['status-presence', 'Status & Presence'],
  ['chat-header-states', 'Chat Header States'],
  ['text-messages', 'Text Messages'],
  ['entities', 'Entities'],
  ['photos', 'Photos'],
  ['videos', 'Videos'],
  ['gifs', 'GIFs'],
  ['stickers', 'Stickers'],
  ['voice-messages', 'Voice Messages'],
  ['link-previews', 'Link Previews'],
  ['replies', 'Replies'],
  ['media', 'Media Pure Views'],
  ['formatted-text', 'FormattedText'],
  ['media-variants', 'Media Variants'],
  ['albums', 'Albums'],
  ['reactions', 'Reactions'],
  ['forwards', 'Forwards'],
  ['bot-keyboards', 'Bot Keyboards'],
  ['timestamps', 'Timestamps'],
  ['service-messages', 'Service Messages'],
  ['sidebar-dialog-rows', 'Sidebar Dialog Rows'],
];

// ---------------------------------------------------------------------------
// Pre-filter messages by type
// ---------------------------------------------------------------------------

const textIncoming = MESSAGES.filter((m) => m.text && !m.mediaLabel && !m.isOutgoing);
const textOutgoing = MESSAGES.filter((m) => m.text && !m.mediaLabel && m.isOutgoing);
const entityMessages = MESSAGES.filter((m) => m.entities.length > 0);
const reactionMessages = MESSAGES.filter((m) => m.reactions.length > 0);
const replyMessages = MESSAGES.filter((m) => !!m.replyPreview);
const photoMessages = MESSAGES.filter((m) => m.contentKind === 'photo');
const videoMessages = MESSAGES.filter(
  (m) => m.contentKind === 'video' || m.contentKind === 'videoNote',
);
const stickerMessages = MESSAGES.filter((m) => m.contentKind === 'sticker');
const gifMessages = MESSAGES.filter((m) => m.contentKind === 'animation');
const voiceMessages = MESSAGES.filter((m) => m.contentKind === 'voice');
const linkPreviewMessages = MESSAGES.filter((m) => !!m.webPreview);
const spoilerMessages = MESSAGES.filter((m) => m.entities.some((e) => e.type === 'spoiler'));
const photoCaptionMessages = MESSAGES.filter((m) => m.contentKind === 'photo' && m.text);
const forwardMessages = MESSAGES.filter((m) => !!m.forwardFromName);
const botKeyboardMessages = MESSAGES.filter((m) => !!m.inlineKeyboard);
const serviceMessages = MESSAGES.filter((m) => !!m.serviceText);
const replyMediaMessages = MESSAGES.filter((m) => !!m.replyPreview?.mediaLabel);
// Media variant fixture messages
// biome-ignore lint/style/noNonNullAssertion: dev-only fixture lookups
const mediaVariantStandalone = MESSAGES.find((m) => m.id === 100000001)!;
// biome-ignore lint/style/noNonNullAssertion: dev-only fixture lookups
const mediaVariantCaption = MESSAGES.find((m) => m.id === 100000002)!;
// biome-ignore lint/style/noNonNullAssertion: dev-only fixture lookups
const mediaVariantPortrait = MESSAGES.find((m) => m.id === 100000003)!;
// biome-ignore lint/style/noNonNullAssertion: dev-only fixture lookups
const mediaVariantReply = MESSAGES.find((m) => m.id === 100000004)!;
// biome-ignore lint/style/noNonNullAssertion: dev-only fixture lookups
const mediaVariantOutgoing = MESSAGES.find((m) => m.id === 100000005)!;
const mediaVariant3Album = MESSAGES.filter((m) => [100000006, 100000007, 100000008].includes(m.id));
const mediaVariant4Album = MESSAGES.filter((m) =>
  [100000009, 100000010, 100000011, 100000012].includes(m.id),
);

const albums = groupUIMessages(MESSAGES).filter(
  (g): g is { type: 'album'; messages: UIMessage[] } => g.type === 'album',
);

// Helper: resolved media props for a single message in dev fixtures
function devMediaProps(msg: UIMessage) {
  return {
    mediaUrl: MEDIA_URLS[msg.id] ?? null,
    mediaLoading: false as const,
  };
}

// Helper: resolved album media props for dev fixtures
function devAlbumMediaProps(messages: UIMessage[]) {
  return {
    albumMedia: messages.map((m) => ({ url: MEDIA_URLS[m.id] ?? null, loading: false })),
  };
}

// ---------------------------------------------------------------------------
// Find first available real media URL for pure view demo sections
// ---------------------------------------------------------------------------

const firstPhotoUrl = photoMessages.length > 0 ? (MEDIA_URLS[photoMessages[0].id] ?? null) : null;
const firstVideoUrl = videoMessages.length > 0 ? (MEDIA_URLS[videoMessages[0].id] ?? null) : null;
const firstCircleVideoUrl =
  MESSAGES.find((m) => m.contentKind === 'videoNote' && MEDIA_URLS[m.id])?.id ?? null;
const firstVoiceUrl = voiceMessages.length > 0 ? (MEDIA_URLS[voiceMessages[0].id] ?? null) : null;

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatDialogTime(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 86_400_000;
  if (diffMs < dayMs && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffMs < 7 * dayMs) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Layout components
// ---------------------------------------------------------------------------

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-testid={`dev-${id}`} className="scroll-mt-8">
      <h2 className="mb-4 text-lg font-bold text-text-primary">{title}</h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Resizable({
  children,
  defaultWidth,
}: {
  children: React.ReactNode;
  defaultWidth?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="relative resize-x overflow-hidden rounded border border-dashed border-sand-7 p-3"
      style={{ width: defaultWidth ?? '100%', minWidth: 120 }}
    >
      {width !== null && (
        <span className="absolute top-1 right-1 text-[9px] tabular-nums text-text-quaternary">
          {width}px
        </span>
      )}
      {children}
    </div>
  );
}

function Case({
  text,
  children,
  defaultWidth,
}: {
  text: string;
  children: React.ReactNode;
  defaultWidth?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] leading-snug text-text-tertiary">{text}</p>
      <Resizable defaultWidth={defaultWidth}>{children}</Resizable>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DevPage
// ---------------------------------------------------------------------------

export default function DevPage() {
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0][0]);
  const contentRef = useRef<HTMLDivElement>(null);

  function scrollTo(anchor: string) {
    setActiveSection(anchor);
    window.location.hash = anchor;
    const el = document.getElementById(anchor);
    el?.scrollIntoView({ behavior: 'smooth' });
  }

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setActiveSection(hash);
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView();
      });
    }
  }, []);

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="flex h-screen bg-background">
      {import.meta.env.DEV && <Agentation />}
      {/* Nav sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r border-sand-6 bg-sand-2">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-text-primary">Component Dev</h1>
            <ThemeSwitcher />
          </div>
          <p className="text-[10px] text-text-tertiary">{MESSAGES.length} real messages</p>
        </div>
        <Separator />
        <nav className="flex-1 overflow-y-auto py-2">
          {SECTIONS.map(([anchor, label]) => (
            <button
              key={anchor}
              type="button"
              onClick={() => scrollTo(anchor)}
              className={cn(
                'block w-full px-4 py-1.5 text-left text-xs transition-colors',
                activeSection === anchor
                  ? 'bg-blue-3 font-medium text-blue-11'
                  : 'text-text-secondary hover:bg-sand-3',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <Separator />
        <div className="px-4 py-2">
          <a href="/" className="text-xs text-blue-11 hover:underline">
            Back to app
          </a>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 space-y-12 overflow-y-auto px-8 py-6">
        {/* --- UI Primitives --- */}
        <Section id="ui-primitives" title="UI Primitives">
          <Case text="Grid of all button variants and sizes. Each row is a variant, each column a size.">
            <div className="space-y-3">
              {(['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const).map(
                (variant) => (
                  <div key={variant} className="flex items-center gap-2">
                    <Button variant={variant} size="xs">
                      xs
                    </Button>
                    <Button variant={variant} size="sm">
                      sm
                    </Button>
                    <Button variant={variant}>default</Button>
                    <Button variant={variant} size="lg">
                      lg
                    </Button>
                  </div>
                ),
              )}
            </div>
          </Case>
          <Case text="All badge variants side by side. Verifies color and shape tokens across the set.">
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </Case>
          <Case text="Four avatars with real profile photos loaded from API. Checks image loading and circular clipping.">
            <div className="flex items-center gap-3">
              {CHATS.slice(0, 4).map((c) => (
                <UserAvatar
                  key={c.id}
                  name={c.title}
                  src={PROFILE_PHOTOS[c.userId || c.id]}
                  className="size-10 text-xs"
                />
              ))}
            </div>
          </Case>
          <Case text="Avatars with online presence dot. The green indicator should sit at bottom-right without clipping.">
            <div className="flex items-center gap-6">
              {CHATS.slice(0, 3).map((c) => (
                <div key={c.id} className="relative inline-block">
                  <UserAvatar
                    name={c.title}
                    src={PROFILE_PHOTOS[c.userId || c.id]}
                    className="size-10 text-xs"
                  />
                  <PureOnlineDot />
                </div>
              ))}
            </div>
          </Case>
          <Case text="Basic text input field. Checks placeholder styling and focus ring.">
            <div className="max-w-sm">
              <Input placeholder="Type something..." />
            </div>
          </Case>
          <Case text="Horizontal separator line. Should span full width with correct color token.">
            <Separator />
          </Case>
          <Case text="Message input with send button. Tests the compose area used at the bottom of chats.">
            <div className="max-w-md rounded border border-sand-6">
              <PureMessageInput onSend={async (text) => log.info('Send:', text)} />
            </div>
          </Case>
          <Case text="Incoming message timestamp. No read receipts shown.">
            <PureMessageTime date={now} out={false} read={false} />
          </Case>
          <Case text="Outgoing message currently sending. Clock icon indicates it has not reached the server yet.">
            <PureMessageTime date={now} out={true} read={false} sending />
          </Case>
          <Case text="Outgoing message delivered but unread. Single checkmark visible.">
            <PureMessageTime date={now} out={true} read={false} />
          </Case>
          <Case text="Outgoing message read by recipient. Double checkmark visible.">
            <PureMessageTime date={now} out={true} read={true} />
          </Case>
          <Case text="Incoming message that was edited. Shows edited prefix before the time.">
            <PureMessageTime date={now} out={false} read={false} edited />
          </Case>
        </Section>

        {/* --- Status & Presence --- */}
        <Section id="status-presence" title="Status & Presence">
          {HEADER_STATES.filter((hs) => !hs.status || hs.status.type !== 'label').map((hs) => (
            <Case
              key={hs.label}
              text={`${hs.label}. Status object: ${hs.status ? `${hs.status.type}${'text' in hs.status ? ` "${hs.status.text}"` : ''}` : 'null'}.`}
            >
              <div className="flex items-center gap-3 rounded bg-sand-2 px-3 py-2" />
            </Case>
          ))}
          <Case text="DM typing indicator. Single-user private chat scenario.">
            <PureTypingIndicator text="typing" />
          </Case>
          <Case text="Group typing indicator. One user typing in a group chat.">
            <PureTypingIndicator text="Alice is typing" />
          </Case>
          <Case text="Multi-user typing. Two users typing simultaneously in a group.">
            <PureTypingIndicator text="Alice, Bob are typing" />
          </Case>
          <Case text="Voice recording indicator. Shows when a user is recording audio.">
            <PureTypingIndicator text="recording voice" />
          </Case>
        </Section>

        {/* --- Chat Header States --- */}
        <Section id="chat-header-states" title="Chat Header States">
          {HEADER_STATES.map((hs) => (
            <Case
              key={hs.label}
              text={`Chat header: ${hs.label}. Avatar + name + subtitle rendered as a mini header bar.`}
            >
              <div className="flex items-center gap-3 rounded-lg border border-sand-6 bg-sand-2 px-4 py-3">
                <UserAvatar
                  name={CHATS[0]?.title ?? 'User'}
                  src={PROFILE_PHOTOS[CHATS[0]?.userId || CHATS[0]?.id || 0]}
                  className="size-9 text-xs"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {CHATS[0]?.title ?? 'User'}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {hs.status ? ('text' in hs.status ? hs.status.text : hs.status.type) : '\u00A0'}
                  </p>
                </div>
              </div>
            </Case>
          ))}
          <Case text="Emoji status icon with no custom URL. Falls back to a default star icon.">
            <PureEmojiStatusIcon url={null} />
          </Case>
          <Case text="Emoji status icon inline next to a username, as it appears in the chat header.">
            <span className="flex items-center gap-1 text-sm font-medium text-text-primary">
              {CHATS[0]?.title ?? 'User'}
              <PureEmojiStatusIcon url={null} />
            </span>
          </Case>
        </Section>

        {/* --- Text Messages --- */}
        <Section id="text-messages" title="Text Messages">
          {textIncoming.slice(0, 3).map((msg, i) => (
            <Case
              key={msg.id}
              text={`Incoming text message ${i + 1}. Peer bubble with sender name and avatar.`}
            >
              <div className="flex justify-start">
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={true}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
          {textOutgoing.slice(0, 2).map((msg, i) => (
            <Case
              key={msg.id}
              text={`Outgoing text message ${i + 1}. Own bubble aligned right with read checkmarks.`}
            >
              <div className="flex justify-end">
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={false}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Entities --- */}
        <Section id="entities" title="Entities">
          {entityMessages
            .filter((m) => !m.entities.some((e) => e.type === 'spoiler'))
            .slice(0, 4)
            .map((msg) => (
              <Case
                key={msg.id}
                text={`${msg.isOutgoing ? 'Outgoing' : 'Incoming'} message with entity formatting (${msg.entities
                  .map((e) => e.type)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .join(', ')}).`}
              >
                <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                  <PureMessageRow
                    input={{ kind: 'single', message: msg }}
                    showSender={!msg.isOutgoing}
                    senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                    onReact={() => {}}
                    {...devMediaProps(msg)}
                  />
                </div>
              </Case>
            ))}
          {spoilerMessages.length > 0 ? (
            spoilerMessages.map((msg) => (
              <Case
                key={msg.id}
                text="Message with spoiler entity. Text should be hidden behind a blur overlay until tapped."
              >
                <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                  <PureMessageRow
                    input={{ kind: 'single', message: msg }}
                    showSender={!msg.isOutgoing}
                    senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                    onReact={() => {}}
                    {...devMediaProps(msg)}
                  />
                </div>
              </Case>
            ))
          ) : (
            <Case text="Spoiler entity placeholder. No spoiler messages found in the fixture data.">
              <p className="text-xs italic text-text-quaternary">No spoiler messages in data</p>
            </Case>
          )}
        </Section>

        {/* --- Photos --- */}
        <Section id="photos" title="Photos">
          {photoMessages
            .filter((m) => !m.text)
            .slice(0, 2)
            .map((msg) => (
              <Case
                key={msg.id}
                text={`Photo-only bubble, ${msg.isOutgoing ? 'outgoing' : 'incoming'}. No caption text, timestamp overlays the image.`}
              >
                <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                  <PureMessageRow
                    input={{ kind: 'single', message: msg }}
                    showSender={!msg.isOutgoing}
                    senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                    onReact={() => {}}
                    {...devMediaProps(msg)}
                  />
                </div>
              </Case>
            ))}
          {photoCaptionMessages.slice(0, 3).map((msg) => (
            <Case
              key={msg.id}
              text={`Photo with caption, ${msg.isOutgoing ? 'outgoing' : 'incoming'}. Image above, text below, timestamp after text.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Videos --- */}
        <Section id="videos" title="Videos">
          {videoMessages.slice(0, 2).map((msg) => (
            <Case
              key={msg.id}
              text={`${msg.mediaLabel} bubble, ${msg.isOutgoing ? 'outgoing' : 'incoming'}. Tests video thumbnail, play button overlay, and timestamp.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- GIFs --- */}
        <Section id="gifs" title="GIFs">
          {gifMessages.length > 0 ? (
            gifMessages.slice(0, 3).map((msg) => (
              <Case
                key={msg.id}
                text={`GIF bubble, ${msg.isOutgoing ? 'outgoing' : 'incoming'}. Should autoplay silently with no play button.`}
              >
                <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                  <PureMessageRow
                    input={{ kind: 'single', message: msg }}
                    showSender={!msg.isOutgoing}
                    senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                    onReact={() => {}}
                    {...devMediaProps(msg)}
                  />
                </div>
              </Case>
            ))
          ) : (
            <Case text="GIF placeholder. No GIF messages found in fixture data.">
              <p className="text-xs italic text-text-quaternary">No GIFs in data</p>
            </Case>
          )}
        </Section>

        {/* --- Stickers --- */}
        <Section id="stickers" title="Stickers">
          {stickerMessages.slice(0, 2).map((msg) => (
            <Case
              key={msg.id}
              text={`Sticker, ${msg.isOutgoing ? 'outgoing' : 'incoming'}. Renders without a bubble background, with timestamp below.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Voice Messages --- */}
        <Section id="voice-messages" title="Voice Messages">
          {voiceMessages.slice(0, 2).map((msg) => (
            <Case
              key={msg.id}
              text={`Voice message, ${msg.isOutgoing ? 'outgoing' : 'incoming'}. Waveform visualization with play/pause button inside a bubble.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Link Previews --- */}
        <Section id="link-previews" title="Link Previews">
          {linkPreviewMessages.slice(0, 2).map((msg) => (
            <Case
              key={msg.id}
              text={`Link preview in ${msg.isOutgoing ? 'outgoing' : 'incoming'} bubble. Card with site name, title, description, and optional image.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Replies --- */}
        <Section id="replies" title="Replies">
          {replyMessages.slice(0, 3).map((msg) => (
            <Case
              key={msg.id}
              text={`Text reply, ${msg.isOutgoing ? 'outgoing' : 'incoming'}. Quoted message header above the reply body.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
          <Case text="Standalone reply header: text-only. Shows sender name and quoted text with a left color bar.">
            <div className="max-w-xs">
              <PureReplyHeader
                senderName="Validol"
                text="From the downsides - five floors with no elevator"
              />
            </div>
          </Case>
          <Case text="Standalone reply header: photo reply. Thumbnail appears on the right side of the header.">
            <div className="max-w-xs">
              <PureReplyHeader
                senderName="Validol"
                text=""
                mediaType="Photo"
                mediaUrl="/dev/media/98764.jpg"
              />
            </div>
          </Case>
          <Case text="Standalone reply header: voice message reply. Shows media type label instead of text.">
            <div className="max-w-xs">
              <PureReplyHeader senderName="Marusya" text="" mediaType="Voice message" />
            </div>
          </Case>
          <Case text="Standalone reply header: outgoing style. Uses the outgoing color accent for the left bar.">
            <div className="max-w-xs">
              <PureReplyHeader senderName="Andrey" text="Check this out" isOutgoing />
            </div>
          </Case>
          {replyMediaMessages.map((msg) => (
            <Case
              key={msg.id}
              text={`Reply to a media message, ${msg.isOutgoing ? 'outgoing' : 'incoming'}. Reply header includes a media thumbnail.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Media (Pure Views) --- */}
        <Section id="media" title="Media (Pure Views)">
          <Case text="Photo view while the image is still loading. Shows a shimmer/skeleton placeholder.">
            <PurePhotoView url={null} loading />
          </Case>
          <Case text="Photo view with no image URL available. Should show an empty or broken-image fallback.">
            <PurePhotoView url={null} />
          </Case>
          <Case text="Photo view with a fully loaded image. Verifies aspect ratio and rounded corners.">
            <PurePhotoView url={firstPhotoUrl} />
          </Case>
          <Case text="Video thumbnail loading. Shows skeleton with a play button overlay.">
            <PureVideoView url={null} loading />
          </Case>
          <Case text="Video with no URL available. Fallback state for when the video cannot be loaded.">
            <PureVideoView url={null} />
          </Case>
          <Case text="Video thumbnail loaded successfully. Shows the first frame with a centered play button.">
            <PureVideoView url={firstVideoUrl} />
          </Case>
          <Case text="Video message (circle) loading. Round-clipped skeleton placeholder.">
            <PureVideoView url={null} loading isCircle />
          </Case>
          <Case text="Video message (circle) loaded. Round-clipped video thumbnail with play overlay.">
            <PureVideoView
              url={firstCircleVideoUrl ? (MEDIA_URLS[firstCircleVideoUrl] ?? null) : null}
              isCircle
            />
          </Case>
          <Case text="Voice message loading. Waveform skeleton with a disabled play button.">
            <PureVoiceView url={null} loading />
          </Case>
          <Case text="Voice message with no audio URL. Unavailable or broken voice message fallback.">
            <PureVoiceView url={null} />
          </Case>
          <Case text="Voice message with audio loaded. Interactive waveform visualization with play/pause control.">
            <PureVoiceView url={firstVoiceUrl} />
          </Case>
          <Case text="Link preview card rendered outside a bubble. Shows site name, title, and description.">
            <div className="max-w-sm">
              {(() => {
                const preview =
                  linkPreviewMessages.length > 0 ? linkPreviewMessages[0].webPreview : null;
                return preview ? (
                  <PureLinkPreviewCard preview={preview} />
                ) : (
                  <PureLinkPreviewCard
                    preview={{
                      url: 'https://example.com',
                      siteName: 'Example',
                      title: 'Example Link Preview',
                      description: 'No real link preview found in messages.',
                    }}
                  />
                );
              })()}
            </div>
          </Case>
        </Section>

        {/* --- FormattedText --- */}
        <Section id="formatted-text" title="FormattedText">
          {entityMessages.slice(0, 8).map((msg) => (
            <Case
              key={msg.id}
              text={`FormattedText with entity types: ${
                msg.entities
                  .map((e) => e.type)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .join(', ') || 'plain text'
              }. Verifies inline formatting renders correctly.`}
            >
              <p className="text-[13px] leading-[18px] text-text-primary">
                <PureFormattedText text={msg.text} entities={msg.entities} />
              </p>
            </Case>
          ))}
        </Section>

        {/* --- Media Variants --- */}
        <Section id="media-variants" title="Media Variants">
          <Case text="Standalone Photo (no bubble). No caption, no reply, no forward — renders without a text bubble frame.">
            <div className="flex justify-start">
              <PureMessageRow
                input={{ kind: 'single', message: mediaVariantStandalone }}
                showSender={false}
                senderPhotoUrl={PROFILE_PHOTOS[mediaVariantStandalone.senderUserId]}
                onReact={() => {}}
                {...devMediaProps(mediaVariantStandalone)}
              />
            </div>
          </Case>
          <Case text="Portrait Photo (square cap). Tall 1080x1920 image — should get square-capped border radius at top/bottom.">
            <div className="flex justify-start">
              <PureMessageRow
                input={{ kind: 'single', message: mediaVariantPortrait }}
                showSender={false}
                senderPhotoUrl={PROFILE_PHOTOS[mediaVariantPortrait.senderUserId]}
                onReact={() => {}}
                {...devMediaProps(mediaVariantPortrait)}
              />
            </div>
          </Case>
          <Case text="Photo + Caption (framed). Image above, caption text below inside a bubble frame.">
            <div className="flex justify-start">
              <PureMessageRow
                input={{ kind: 'single', message: mediaVariantCaption }}
                showSender={true}
                senderPhotoUrl={PROFILE_PHOTOS[mediaVariantCaption.senderUserId]}
                onReact={() => {}}
                {...devMediaProps(mediaVariantCaption)}
              />
            </div>
          </Case>
          <Case text="Photo + Reply (framed). Reply header above the photo inside a bubble frame.">
            <div className="flex justify-start">
              <PureMessageRow
                input={{ kind: 'single', message: mediaVariantReply }}
                showSender={true}
                senderPhotoUrl={PROFILE_PHOTOS[mediaVariantReply.senderUserId]}
                onReact={() => {}}
                {...devMediaProps(mediaVariantReply)}
              />
            </div>
          </Case>
          <Case text="Outgoing Photo. Own standalone photo aligned right with read checkmarks.">
            <div className="flex justify-end">
              <PureMessageRow
                input={{ kind: 'single', message: mediaVariantOutgoing }}
                showSender={false}
                onReact={() => {}}
                {...devMediaProps(mediaVariantOutgoing)}
              />
            </div>
          </Case>
          <Case text="3-Photo Album (mixed ratios). Landscape + portrait + square grouped together.">
            <div className="flex justify-start">
              <PureMessageRow
                input={{ kind: 'album', messages: mediaVariant3Album }}
                showSender={false}
                onReact={() => {}}
                {...devAlbumMediaProps(mediaVariant3Album)}
              />
            </div>
          </Case>
          <Case text="4-Photo Album (all landscape). Four 1920x1080 photos in an outgoing album grid.">
            <div className="flex justify-end">
              <PureMessageRow
                input={{ kind: 'album', messages: mediaVariant4Album }}
                showSender={false}
                onReact={() => {}}
                {...devAlbumMediaProps(mediaVariant4Album)}
              />
            </div>
          </Case>
          <Case text="Existing 2-Photo Album. Original fixture album with two forwarded photos.">
            {albums.length > 0 ? (
              <PureMessageRow
                input={{ kind: 'album', messages: albums[0].messages }}
                showSender={false}
                onReact={() => {}}
                {...devAlbumMediaProps(albums[0].messages)}
              />
            ) : (
              <p className="text-xs italic text-text-quaternary">No albums in data</p>
            )}
          </Case>
        </Section>

        {/* --- Albums --- */}
        <Section id="albums" title="Albums">
          {albums.length > 0 ? (
            albums.slice(0, 4).map((album) => (
              <Case
                key={album.messages[0].id}
                text={`Album with ${album.messages.length} media items. Tests the grid layout algorithm for multi-photo/video groups.`}
              >
                <PureMessageRow
                  input={{ kind: 'album', messages: album.messages }}
                  showSender={false}
                  onReact={() => {}}
                  {...devAlbumMediaProps(album.messages)}
                />
              </Case>
            ))
          ) : (
            <Case text="Album placeholder. No grouped media albums found in fixture data.">
              <p className="text-xs italic text-text-quaternary">No albums in data</p>
            </Case>
          )}
        </Section>

        {/* --- Reactions --- */}
        <Section id="reactions" title="Reactions">
          <Case text="Reaction bar rendered standalone outside a bubble. Shows emoji pills with counts.">
            <div className="max-w-xs">
              {reactionMessages.length > 0 ? (
                <PureReactionBar
                  reactions={reactionMessages[0].reactions.map((r) => ({
                    emoticon: r.emoji,
                    count: r.count,
                    chosen: r.chosen,
                  }))}
                  onReact={() => {}}
                />
              ) : (
                <p className="text-xs italic text-text-quaternary">No reactions in data</p>
              )}
            </div>
          </Case>
          <Case text="Reaction picker floating panel. The emoji selector that appears on hover or long-press.">
            <div className="relative h-12 w-48">
              <PureReactionPicker onReact={() => {}} />
            </div>
          </Case>
          {reactionMessages.slice(0, 4).map((msg) => (
            <Case
              key={msg.id}
              text={`Reactions attached to ${msg.isOutgoing ? 'outgoing' : 'incoming'} bubble. Emoji pills render below the message text.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Forwards --- */}
        <Section id="forwards" title="Forwards">
          <Case text="Forward header standalone: personal name. 'Forwarded from' label with the original sender.">
            <PureForwardHeader fromName="Gleb Proidov" />
          </Case>
          <Case text="Forward header standalone: channel/group name. Tests longer forwarded-from labels.">
            <PureForwardHeader fromName="Telegram Engineers" />
          </Case>
          {forwardMessages.map((msg) => (
            <Case
              key={msg.id}
              text={`Forwarded message in ${msg.isOutgoing ? 'outgoing' : 'incoming'} bubble. Forward header sits above the message content.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Bot Keyboards --- */}
        <Section id="bot-keyboards" title="Bot Keyboards">
          <Case text="Standalone inline keyboard with action buttons. Two-row layout: 2 buttons, then 1 button.">
            <div className="max-w-xs">
              <PureBotKeyboard
                rows={[
                  { buttons: [{ text: 'View FAQ' }, { text: 'Contact Support' }] },
                  { buttons: [{ text: 'Settings' }] },
                ]}
              />
            </div>
          </Case>
          <Case text="Standalone inline keyboard with URL buttons. Each button opens an external link.">
            <div className="max-w-xs">
              <PureBotKeyboard
                rows={[
                  {
                    buttons: [
                      { text: 'Docs', url: 'https://core.telegram.org' },
                      { text: 'Chat', url: 'https://t.me/telegram' },
                    ],
                  },
                ]}
              />
            </div>
          </Case>
          {botKeyboardMessages.map((msg) => (
            <Case
              key={msg.id}
              text={`Bot keyboard attached to ${msg.isOutgoing ? 'outgoing' : 'incoming'} bubble. Buttons render below the message text.`}
            >
              <div className={cn('flex', msg.isOutgoing ? 'justify-end' : 'justify-start')}>
                <PureMessageRow
                  input={{ kind: 'single', message: msg }}
                  showSender={!msg.isOutgoing}
                  senderPhotoUrl={PROFILE_PHOTOS[msg.senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(msg)}
                />
              </div>
            </Case>
          ))}
        </Section>

        {/* --- Timestamps --- */}
        <Section id="timestamps" title="Timestamps">
          <Case text="Default displayType, incoming message. Plain text timestamp with no checkmarks.">
            <PureMessageTime date={now} out={false} read={false} />
          </Case>
          <Case text="Default displayType, incoming edited message. Shows edited prefix.">
            <PureMessageTime date={now} out={false} read={false} edited />
          </Case>
          <Case text="Default displayType, incoming channel post with 12.4K views.">
            <PureMessageTime date={now} out={false} read={false} views={12400} />
          </Case>
          <Case text="Default displayType, outgoing message being sent. Clock icon shown.">
            <PureMessageTime date={now} out={true} read={false} sending />
          </Case>
          <Case text="Default displayType, outgoing message delivered but unread. Single checkmark.">
            <PureMessageTime date={now} out={true} read={false} />
          </Case>
          <Case text="Default displayType, outgoing message read. Double checkmark.">
            <PureMessageTime date={now} out={true} read={true} />
          </Case>
          <Case text="Default displayType, outgoing edited message that has been read. Edited prefix plus double checkmark.">
            <PureMessageTime date={now} out={true} read={true} edited />
          </Case>
          <Case text="Timestamp inside an incoming bubble. Floats to the bottom-right of the message text.">
            <div className="flex justify-start">
              <div className="relative rounded-2xl bg-message-peer px-4 py-2.5">
                <p className="whitespace-pre-wrap text-[13px] leading-[18px] text-text-primary">
                  Good morning!
                  <span className="float-right h-[18px] w-14" aria-hidden="true" />
                </p>
                <span className="absolute bottom-1 right-2">
                  <PureMessageTime date={now} out={false} read={false} />
                </span>
              </div>
            </div>
          </Case>
          <Case text="Timestamp inside an outgoing read bubble. Double check marks should be visible.">
            <div className="flex justify-end">
              <div className="relative rounded-2xl bg-message-own px-4 py-2.5">
                <p className="whitespace-pre-wrap text-[13px] leading-[18px] text-text-primary">
                  Hey, good morning! How are you?
                  <span className="float-right h-[18px] w-14" aria-hidden="true" />
                </p>
                <span className="absolute bottom-1 right-2">
                  <PureMessageTime date={now} out={true} read={true} />
                </span>
              </div>
            </div>
          </Case>
          <Case text="Timestamp with 'edited' label inside an outgoing bubble. Shows 'edited' prefix before the time.">
            <div className="flex justify-end">
              <div className="relative rounded-2xl bg-message-own px-4 py-2.5">
                <p className="whitespace-pre-wrap text-[13px] leading-[18px] text-text-primary">
                  I updated the docs
                  <span className="float-right h-[18px] w-20" aria-hidden="true" />
                </p>
                <span className="absolute bottom-1 right-2">
                  <PureMessageTime date={now} out={true} read={false} edited />
                </span>
              </div>
            </div>
          </Case>
          <Case text="Timestamp in 'sending' state inside an outgoing bubble. Clock icon instead of checkmarks.">
            <div className="flex justify-end">
              <div className="relative rounded-2xl bg-message-own px-4 py-2.5">
                <p className="whitespace-pre-wrap text-[13px] leading-[18px] text-text-primary">
                  Uploading file...
                  <span className="float-right h-[18px] w-14" aria-hidden="true" />
                </p>
                <span className="absolute bottom-1 right-2">
                  <PureMessageTime date={now} out={true} read={false} sending />
                </span>
              </div>
            </div>
          </Case>
          <Case text="Image displayType, incoming. Semi-transparent dark pill for overlaying on photos.">
            <PureMessageTime date={now} out={false} read={false} displayType="image" />
          </Case>
          <Case text="Image displayType, outgoing message being sent. Clock icon on dark pill.">
            <PureMessageTime date={now} out={true} read={false} sending displayType="image" />
          </Case>
          <Case text="Image displayType, outgoing delivered. Single checkmark on dark pill.">
            <PureMessageTime date={now} out={true} read={false} displayType="image" />
          </Case>
          <Case text="Image displayType, outgoing read. Double checkmark on dark pill.">
            <PureMessageTime date={now} out={true} read={true} displayType="image" />
          </Case>
          <Case text="Image displayType, incoming edited. Edited prefix on dark pill.">
            <PureMessageTime date={now} out={false} read={false} edited displayType="image" />
          </Case>
          <Case text="Image displayType, incoming with 5.2K views. View count on dark pill.">
            <PureMessageTime date={now} out={false} read={false} views={5200} displayType="image" />
          </Case>
          <Case text="Incoming image timestamp overlaid on a cool-toned photo. Tests pill readability against blue gradient.">
            <div className="relative h-48 w-64 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600">
              <span className="absolute bottom-2 right-2">
                <PureMessageTime date={now} out={false} read={false} displayType="image" />
              </span>
            </div>
          </Case>
          <Case text="Outgoing read image timestamp overlaid on a warm-toned photo. Tests pill readability against amber gradient.">
            <div className="relative h-48 w-64 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500">
              <span className="absolute bottom-2 right-2">
                <PureMessageTime date={now} out={true} read={true} displayType="image" />
              </span>
            </div>
          </Case>
          <Case text="Image timestamp on a channel post with high view count. Tests number formatting (142K).">
            <div className="relative h-48 w-64 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600">
              <span className="absolute bottom-2 right-2">
                <PureMessageTime
                  date={now}
                  out={false}
                  read={false}
                  views={142000}
                  displayType="image"
                />
              </span>
            </div>
          </Case>
          <Case text="Background displayType, incoming. Used below stickers where no bubble exists.">
            <PureMessageTime date={now} out={false} read={false} displayType="background" />
          </Case>
          <Case text="Background displayType, outgoing being sent. Clock icon below sticker.">
            <PureMessageTime date={now} out={true} read={false} sending displayType="background" />
          </Case>
          <Case text="Background displayType, outgoing delivered. Single checkmark below sticker.">
            <PureMessageTime date={now} out={true} read={false} displayType="background" />
          </Case>
          <Case text="Background displayType, outgoing read. Double checkmark below sticker.">
            <PureMessageTime date={now} out={true} read={true} displayType="background" />
          </Case>
          <Case text="Incoming sticker with background timestamp below. Timestamp sits outside and beneath the sticker image.">
            <div>
              <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-sand-4 text-2xl">
                {'\uD83D\uDE0E'}
              </div>
              <div className="mt-0.5 flex justify-end">
                <PureMessageTime date={now} out={false} read={false} displayType="background" />
              </div>
            </div>
          </Case>
          <Case text="Outgoing read sticker with background timestamp below. Double checkmark beneath the sticker.">
            <div>
              <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-sand-4 text-2xl">
                {'\uD83D\uDC4D'}
              </div>
              <div className="mt-0.5 flex justify-end">
                <PureMessageTime date={now} out={true} read={true} displayType="background" />
              </div>
            </div>
          </Case>
          <Case text="Midnight timestamp rendering (00:00). Verifies epoch-boundary date formatting.">
            <PureMessageTime date={946684800} out={false} read={false} />
          </Case>
          <Case text="Outgoing read message with edited flag and 1.2M views. Tests combined flag rendering and large number formatting.">
            <PureMessageTime date={now} out={true} read={true} edited views={1200000} />
          </Case>
          <Case text="Image displayType with edited flag and 890 views. Combined flags on dark pill.">
            <PureMessageTime
              date={now}
              out={false}
              read={false}
              edited
              views={890}
              displayType="image"
            />
          </Case>
          <Case text="Background displayType while sending an edited message. Clock icon plus edited prefix below sticker.">
            <PureMessageTime
              date={now}
              out={true}
              read={false}
              sending
              edited
              displayType="background"
            />
          </Case>
          <Case text="Variant matrix of all three displayTypes (default, image, background) across five delivery states. Visual regression reference.">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <PureMessageTime date={now} out={false} read={false} displayType="default" />
                <br />
                <PureMessageTime date={now} out={true} read={false} displayType="default" />
                <br />
                <PureMessageTime date={now} out={true} read={true} displayType="default" />
                <br />
                <PureMessageTime date={now} out={true} read={false} sending displayType="default" />
                <br />
                <PureMessageTime date={now} out={true} read={true} edited displayType="default" />
              </div>
              <div className="space-y-2 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 p-3">
                <PureMessageTime date={now} out={false} read={false} displayType="image" />
                <br />
                <PureMessageTime date={now} out={true} read={false} displayType="image" />
                <br />
                <PureMessageTime date={now} out={true} read={true} displayType="image" />
                <br />
                <PureMessageTime date={now} out={true} read={false} sending displayType="image" />
                <br />
                <PureMessageTime date={now} out={true} read={true} edited displayType="image" />
              </div>
              <div className="space-y-2 rounded-lg bg-sand-5 p-3">
                <PureMessageTime date={now} out={false} read={false} displayType="background" />
                <br />
                <PureMessageTime date={now} out={true} read={false} displayType="background" />
                <br />
                <PureMessageTime date={now} out={true} read={true} displayType="background" />
                <br />
                <PureMessageTime
                  date={now}
                  out={true}
                  read={false}
                  sending
                  displayType="background"
                />
                <br />
                <PureMessageTime
                  date={now}
                  out={true}
                  read={true}
                  edited
                  displayType="background"
                />
              </div>
            </div>
          </Case>
        </Section>

        {/* --- Service Messages --- */}
        <Section id="service-messages" title="Service Messages">
          {serviceMessages.map((msg) => (
            <Case
              key={msg.id}
              text={`Service message: "${(msg.serviceText ?? '').slice(0, 50)}". Centered pill with muted text.`}
            >
              <PureServiceMessage text={msg.serviceText ?? ''} />
            </Case>
          ))}
          <Case text="Service messages mixed with regular bubbles. Tests vertical spacing and alignment in a realistic chat flow.">
            <div className="space-y-1 rounded-lg bg-sand-2 p-4">
              <div className="flex justify-start">
                <PureMessageRow
                  input={{ kind: 'single', message: MESSAGES[0] }}
                  showSender={true}
                  senderPhotoUrl={PROFILE_PHOTOS[MESSAGES[0].senderUserId]}
                  onReact={() => {}}
                  {...devMediaProps(MESSAGES[0])}
                />
              </div>
              <PureServiceMessage text="Andrey joined the group" />
              <div className="flex justify-end">
                <PureMessageRow
                  input={{ kind: 'single', message: MESSAGES[3] }}
                  showSender={false}
                  onReact={() => {}}
                  {...devMediaProps(MESSAGES[3])}
                />
              </div>
              <PureServiceMessage text="Marusya pinned a message" />
            </div>
          </Case>
        </Section>

        {/* --- Sidebar Dialog Rows --- */}
        <Section id="sidebar-dialog-rows" title="Sidebar Dialog Rows">
          {CHATS.map((chat) => (
            <Case
              key={chat.id}
              text={`Dialog row for "${chat.title}". Tests avatar, name truncation, last message preview, badges (unread${chat.isMuted ? ', muted' : ''}${chat.isPinned ? ', pinned' : ''}${chat.draftText ? ', draft' : ''}).`}
              defaultWidth="360px"
            >
              <div className="rounded-lg border border-sand-6 bg-background">
                <div className="flex items-start gap-3 px-4 py-3">
                  <UserAvatar
                    name={chat.title}
                    src={PROFILE_PHOTOS[chat.userId || chat.id]}
                    className="mt-0.5 size-10 shrink-0 text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1 truncate text-sm font-medium text-text-primary">
                        {chat.title}
                        {chat.isMuted && (
                          <BellOff size={12} className="shrink-0 text-text-quaternary" />
                        )}
                      </span>
                      {chat.lastMessageDate > 0 && (
                        <span className="shrink-0 text-[10px] text-text-quaternary">
                          {formatDialogTime(chat.lastMessageDate)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {chat.draftText ? (
                        <span className="truncate text-xs">
                          <span className="text-red-9">Draft: </span>
                          <span className="text-text-tertiary">{chat.draftText}</span>
                        </span>
                      ) : (
                        <span className="truncate text-xs text-text-tertiary">
                          {chat.lastMessagePreview || '\u00A0'}
                        </span>
                      )}
                      <div className="flex shrink-0 items-center gap-1">
                        {chat.isPinned && <Pin size={12} className="text-text-quaternary" />}
                        {chat.unreadMentionCount > 0 && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-9 px-1 text-[10px] font-medium leading-none text-white">
                            <AtSign size={10} />
                          </span>
                        )}
                        {chat.unreadCount > 0 && (
                          <span
                            className={cn(
                              'flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none text-white',
                              chat.isMuted ? 'bg-sand-8' : 'bg-blue-9',
                            )}
                          >
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Case>
          ))}
        </Section>
      </div>
    </div>
  );
}
