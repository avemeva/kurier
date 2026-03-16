import { MessageContextMenu } from '@/components/ui/chat/message-context-menu';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import type { TGMessage } from '@/data';

const noop = () => {};

const mockMessage: TGMessage = {
  kind: 'message',
  id: 999001,
  chatId: 6098406782,
  date: 1772464607,
  isOutgoing: false,
  isRead: true,
  editDate: 0,
  sender: {
    userId: 6098406782,
    name: 'Andrey',
    photoUrl: '/dev/photos/6098406782.jpg',
  },
  reactions: [{ emoji: '❤️', count: 1, chosen: false }],
  viewCount: 0,
  forward: null,
  replyTo: null,
  inlineKeyboard: null,
  content: {
    kind: 'text',
    text: 'Right-click this message to see the context menu',
    entities: [],
    customEmojiUrls: {},
    webPreview: null,
  },
};

const mockAttributions = [
  {
    emoji: '❤️',
    count: 2,
    users: [
      { name: 'Andrey', photoUrl: '/dev/photos/6098406782.jpg' },
      { name: 'Alice', photoUrl: '/dev/photos/6098406782.jpg' },
    ],
  },
];

export function ContextMenuPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background px-6 py-3">
        <div className="flex items-center">
          <h1 className="text-lg font-bold text-text-primary">Context Menu Comparison</h1>
          <div className="ml-auto">
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      <div className="flex gap-8 p-8">
        {/* Reference image */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">
            Reference (Telegram Desktop)
          </h2>
          <img
            src="/dev/context-menu-reference.png"
            alt="Reference context menu"
            className="w-[300px] rounded-lg border border-border"
          />
        </div>

        {/* Our implementation */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">
            Our Implementation (right-click below)
          </h2>
          <div className="rounded-lg border border-border bg-chat-bg p-8">
            <MessageContextMenu
              msg={mockMessage}
              onReact={noop}
              onReply={noop}
              onCopyText={noop}
              onCopyLink={noop}
              onPin={noop}
              onForward={noop}
              onSelect={noop}
              reactionAttributions={mockAttributions}
            >
              <div className="max-w-xs cursor-context-menu rounded-xl bg-message-peer p-3">
                <p className="tg-text-chat text-text-primary">
                  Right-click this message to see the context menu
                </p>
              </div>
            </MessageContextMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
