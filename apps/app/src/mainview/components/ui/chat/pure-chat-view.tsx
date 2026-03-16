import type { ChatKind, TGMessage } from '@/data';
import { cn } from '@/lib/utils';
import { UserAvatar } from '../user-avatar';
import type { GroupPosition } from './pure-message-row';
import { PureMessageRow } from './pure-message-row';

export type PureChatViewProps = {
  messages: TGMessage[];
  chatKind: ChatKind;
  /** Map message key → semantic name. Used for id, data-testid, and data-element on wrappers. */
  messageLabels?: Map<string | number, string>;
  onReact: (messageId: number, emoticon: string, chosen: boolean) => void;
  onReplyClick?: (messageId: number) => void;
  onTranscribe?: (chatId: number, msgId: number) => void;
};

function getKey(msg: TGMessage): string | number {
  if (msg.kind === 'pending') return msg.localId;
  return msg.id;
}

function getIsOutgoing(msg: TGMessage, chatKind: ChatKind): boolean {
  if (chatKind === 'channel') return false;
  if (msg.kind === 'pending') return true;
  if (msg.kind === 'service') return false;
  return msg.isOutgoing;
}

function getSenderId(msg: TGMessage): number | string {
  if (msg.kind === 'pending') return `pending-${msg.localId}`;
  return msg.sender.userId;
}

function getGroupPosition(messages: TGMessage[], index: number, chatKind: ChatKind): GroupPosition {
  const cur = getSenderId(messages[index]);
  const curOut = getIsOutgoing(messages[index], chatKind);
  const prev = index > 0 ? getSenderId(messages[index - 1]) : null;
  const prevOut = index > 0 ? getIsOutgoing(messages[index - 1], chatKind) : null;
  const next = index < messages.length - 1 ? getSenderId(messages[index + 1]) : null;
  const nextOut = index < messages.length - 1 ? getIsOutgoing(messages[index + 1], chatKind) : null;
  const samePrev = prev === cur && prevOut === curOut;
  const sameNext = next === cur && nextOut === curOut;
  if (samePrev && sameNext) return 'middle';
  if (samePrev) return 'last';
  if (sameNext) return 'first';
  return 'single';
}

export function PureChatView({
  messages,
  chatKind,
  messageLabels,
  onReact,
  onReplyClick,
  onTranscribe,
}: PureChatViewProps) {
  const isGroup = chatKind === 'basicGroup' || chatKind === 'supergroup';
  const showSender = isGroup;

  return (
    <div className="space-y-1">
      {messages.map((msg, index) => {
        const isOut = getIsOutgoing(msg, chatKind);
        const isService = msg.kind === 'service';
        const key = getKey(msg);
        const label = messageLabels?.get(key);

        const groupPosition = getGroupPosition(messages, index, chatKind);
        // Show user avatar on outgoing messages only in wide layout (@5xl)
        const showOutAvatar =
          isOut &&
          !isService &&
          msg.kind === 'message' &&
          (groupPosition === 'last' || groupPosition === 'single');
        const showOutSpacer = isOut && !isService && !showOutAvatar;

        return (
          <div
            key={key}
            id={`msg-${label ?? key}`}
            data-testid={label ? `msg-${label}` : undefined}
            data-element={label ?? undefined}
            className={cn(
              'flex items-end gap-2',
              isService
                ? 'justify-center'
                : isOut
                  ? 'justify-end @5xl:justify-start'
                  : 'justify-start',
            )}
          >
            {showOutAvatar && (
              <UserAvatar
                name={msg.sender.name}
                src={msg.sender.photoUrl}
                className="hidden size-7 shrink-0 text-xs @5xl:block"
              />
            )}
            {showOutSpacer && <div className="hidden size-7 shrink-0 @5xl:block" />}
            <PureMessageRow
              msg={msg}
              showSender={showSender}
              groupPosition={groupPosition}
              onReact={onReact}
              onReplyClick={onReplyClick}
              onTranscribe={onTranscribe}
            />
          </div>
        );
      })}
    </div>
  );
}
