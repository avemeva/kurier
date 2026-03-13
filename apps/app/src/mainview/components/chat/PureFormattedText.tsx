import { useState } from 'react';
import { PureStickerView } from '@/components/ui/chat/StickerView';
import type { UITextEntity } from '@/lib/types';

function CustomEmoji({
  documentId,
  fallback,
  customEmojiUrls,
}: {
  documentId: string;
  fallback: string;
  customEmojiUrls?: Record<string, { url: string; format: 'webp' | 'tgs' | 'webm' } | null>;
}) {
  const info = customEmojiUrls?.[documentId] ?? null;

  if (!info) {
    return <span className="inline-block align-text-bottom">{fallback}</span>;
  }
  return (
    <span className="inline-block size-[1.2em] align-text-bottom">
      <PureStickerView
        url={info.url}
        format={info.format}
        emoji={fallback}
        className="size-full !max-w-none"
      />
    </span>
  );
}

function SpoilerText({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setRevealed((r) => !r)}
      className={`inline appearance-none border-none p-0 font-inherit text-[length:inherit] leading-inherit transition-all duration-200 rounded px-0.5 ${
        revealed
          ? 'bg-transparent text-inherit'
          : 'bg-text-tertiary text-text-tertiary cursor-pointer select-none'
      }`}
    >
      {children}
    </button>
  );
}

export function PureFormattedText({
  text,
  entities,
  customEmojiUrls,
}: {
  text: string;
  entities: UITextEntity[];
  customEmojiUrls?: Record<string, { url: string; format: 'webp' | 'tgs' | 'webm' } | null>;
}) {
  if (!entities || entities.length === 0) {
    return <>{text}</>;
  }

  const sorted = [...entities].sort((a, b) => a.offset - b.offset);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    const entity = sorted[i];

    // Skip entities that overlap with already-rendered text
    if (entity.offset < lastIndex) continue;

    // Gap text between entities — render as plain text
    if (entity.offset > lastIndex) {
      parts.push(text.slice(lastIndex, entity.offset));
    }

    const slice = text.slice(entity.offset, entity.offset + entity.length);
    const key = `${entity.offset}-${i}`;
    const entityType = entity.type;

    switch (entityType) {
      case 'bold':
        parts.push(<strong key={key}>{slice}</strong>);
        break;
      case 'italic':
        parts.push(<em key={key}>{slice}</em>);
        break;
      case 'code':
        parts.push(
          <code key={key} className="rounded bg-code-bg px-1 font-mono tg-text-chat">
            {slice}
          </code>,
        );
        break;
      case 'pre':
      case 'preCode':
        parts.push(
          <pre
            key={key}
            className="my-1 overflow-x-auto rounded bg-code-bg p-2 font-mono tg-text-chat"
          >
            {slice}
          </pre>,
        );
        break;
      case 'url':
      case 'email':
        parts.push(
          <a
            key={key}
            href={entityType === 'email' ? `mailto:${slice}` : slice}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-accent-brand underline"
          >
            {slice}
          </a>,
        );
        break;
      case 'textUrl':
        parts.push(
          <a
            key={key}
            href={entity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-brand underline"
          >
            {slice}
          </a>,
        );
        break;
      case 'strikethrough':
        parts.push(<s key={key}>{slice}</s>);
        break;
      case 'underline':
        parts.push(<u key={key}>{slice}</u>);
        break;
      case 'mention':
      case 'hashtag':
      case 'botCommand':
        parts.push(
          <span key={key} className="text-accent-brand">
            {slice}
          </span>,
        );
        break;
      case 'spoiler':
        parts.push(<SpoilerText key={key}>{slice}</SpoilerText>);
        break;
      case 'customEmoji': {
        const customEmojiId = entity.customEmojiId;
        parts.push(
          customEmojiId ? (
            <CustomEmoji
              key={key}
              documentId={customEmojiId}
              fallback={slice}
              customEmojiUrls={customEmojiUrls}
            />
          ) : (
            <span key={key} className="inline-block align-text-bottom">
              {slice}
            </span>
          ),
        );
        break;
      }
      default:
        parts.push(slice);
    }

    lastIndex = entity.offset + entity.length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
