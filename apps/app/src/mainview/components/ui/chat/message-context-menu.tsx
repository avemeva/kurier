import {
  CheckCircle,
  ChevronDown,
  ClipboardCopy,
  CornerUpLeft,
  Forward,
  Link,
  OctagonAlert,
  Pin,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { TGMessage } from '@/data';

const MENU_REACTIONS = ['❤️', '👍', '🔥', '😁', '😎'];

export type ReactionAttribution = {
  emoji: string;
  count: number;
  users: { name: string; photoUrl?: string }[];
};

export type MessageContextMenuProps = {
  msg: TGMessage;
  onReact: (emoticon: string, chosen: boolean) => void;
  onReply?: () => void;
  onCopyText?: () => void;
  onCopyLink?: () => void;
  onPin?: () => void;
  onForward?: () => void;
  onSelect?: () => void;
  reactionAttributions?: ReactionAttribution[];
  children: ReactNode;
};

function getPlainText(msg: TGMessage): string | null {
  if (msg.kind !== 'message') return null;
  const c = msg.content;
  if (c.kind === 'text') return c.text;
  if ('caption' in c && c.caption) return c.caption.text;
  return null;
}

export function MessageContextMenu({
  msg,
  onReact,
  onReply,
  onCopyText,
  onCopyLink,
  onPin,
  onForward,
  onSelect,
  reactionAttributions,
  children,
}: MessageContextMenuProps) {
  const hasText = getPlainText(msg) !== null;
  const isRegularMessage = msg.kind === 'message';

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[240px] rounded-xl p-0">
        {/* Quick reactions */}
        {isRegularMessage && (
          <div className="flex items-center justify-between rounded-t-xl bg-accent/50 px-2 py-1.5">
            {MENU_REACTIONS.map((emoji) => {
              const chosen =
                isRegularMessage && msg.reactions.some((r) => r.emoji === emoji && r.chosen);
              return (
                <ContextMenuItem
                  key={emoji}
                  onClick={() => onReact(emoji, chosen)}
                  className="flex size-8 items-center justify-center rounded-full !p-0 text-xl transition-transform hover:scale-125"
                >
                  {emoji}
                </ContextMenuItem>
              );
            })}
            <ContextMenuItem className="flex size-8 items-center justify-center rounded-full !p-0 text-muted-foreground">
              <ChevronDown className="size-4" />
            </ContextMenuItem>
          </div>
        )}

        {isRegularMessage && <ContextMenuSeparator className="my-0" />}

        {/* Menu items */}
        <div className="py-1">
          {onReply && isRegularMessage && (
            <ContextMenuItem onClick={onReply} className="gap-3 px-3 py-1.5">
              <CornerUpLeft className="size-4 text-muted-foreground" />
              <span className="text-sm">Reply</span>
            </ContextMenuItem>
          )}

          {onPin && isRegularMessage && (
            <ContextMenuItem onClick={onPin} className="gap-3 px-3 py-1.5">
              <Pin className="size-4 text-muted-foreground" />
              <span className="text-sm">Pin</span>
            </ContextMenuItem>
          )}

          {hasText && onCopyText && (
            <ContextMenuItem onClick={onCopyText} className="gap-3 px-3 py-1.5">
              <ClipboardCopy className="size-4 text-muted-foreground" />
              <span className="text-sm">Copy Text</span>
            </ContextMenuItem>
          )}

          {onCopyLink && isRegularMessage && (
            <ContextMenuItem onClick={onCopyLink} className="gap-3 px-3 py-1.5">
              <Link className="size-4 text-muted-foreground" />
              <span className="text-sm">Copy Message Link</span>
            </ContextMenuItem>
          )}

          {onForward && isRegularMessage && (
            <ContextMenuItem onClick={onForward} className="gap-3 px-3 py-1.5">
              <Forward className="size-4 text-muted-foreground" />
              <span className="text-sm">Forward</span>
            </ContextMenuItem>
          )}

          {isRegularMessage && (
            <>
              <ContextMenuSeparator className="my-0.5" />
              <ContextMenuItem disabled className="gap-3 px-3 py-1.5">
                <OctagonAlert className="size-4 text-muted-foreground" />
                <span className="text-sm">Report</span>
              </ContextMenuItem>
            </>
          )}

          {onSelect && (
            <ContextMenuItem onClick={onSelect} className="gap-3 px-3 py-1.5">
              <CheckCircle className="size-4 text-muted-foreground" />
              <span className="text-sm">Select</span>
            </ContextMenuItem>
          )}
        </div>

        {/* Reaction attributions footer */}
        {reactionAttributions && reactionAttributions.length > 0 && (
          <>
            <ContextMenuSeparator className="my-0" />
            <div className="py-1">
              {reactionAttributions.map((attr) => (
                <div key={attr.emoji} className="flex items-center gap-2.5 px-3 py-1.5">
                  <span className="text-lg leading-none">{attr.emoji}</span>
                  <span className="flex-1 text-sm text-foreground">
                    {attr.count === 1 ? attr.users[0]?.name : `${attr.count} Reactions`}
                  </span>
                  <div className="flex -space-x-1.5">
                    {attr.users.slice(0, 3).map((user) =>
                      user.photoUrl ? (
                        <img
                          key={user.name}
                          src={user.photoUrl}
                          alt={user.name}
                          className="size-6 rounded-full border-2 border-popover object-cover"
                        />
                      ) : (
                        <div
                          key={user.name}
                          className="flex size-6 items-center justify-center rounded-full border-2 border-popover bg-muted text-[10px] font-medium text-muted-foreground"
                        >
                          {user.name[0]}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
