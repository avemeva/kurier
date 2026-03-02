import { useEffect, useState } from 'react';
import { getCustomEmojiUrl } from '@/lib/telegram';
import type { UITextEntity } from '@/lib/types';

function CustomEmoji({ documentId, fallback }: { documentId: string; fallback: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomEmojiUrl(documentId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (!url) {
    return <span className="inline-block align-text-bottom">{fallback}</span>;
  }
  return (
    <img
      src={url}
      alt={fallback}
      className="inline-block size-[1.2em] align-text-bottom object-contain"
    />
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

export function FormattedText({ text, entities }: { text: string; entities: UITextEntity[] }) {
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
      case 'textEntityTypeBold':
        parts.push(<strong key={key}>{slice}</strong>);
        break;
      case 'textEntityTypeItalic':
        parts.push(<em key={key}>{slice}</em>);
        break;
      case 'textEntityTypeCode':
        parts.push(
          <code key={key} className="rounded bg-code-bg px-1 font-mono text-[13px]">
            {slice}
          </code>,
        );
        break;
      case 'textEntityTypePre':
      case 'textEntityTypePreCode':
        parts.push(
          <pre
            key={key}
            className="my-1 overflow-x-auto rounded bg-code-bg p-2 font-mono text-[13px]"
          >
            {slice}
          </pre>,
        );
        break;
      case 'textEntityTypeUrl':
      case 'textEntityTypeEmailAddress':
        parts.push(
          <a
            key={key}
            href={entityType === 'textEntityTypeEmailAddress' ? `mailto:${slice}` : slice}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-accent-blue underline"
          >
            {slice}
          </a>,
        );
        break;
      case 'textEntityTypeTextUrl':
        parts.push(
          <a
            key={key}
            href={entity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue underline"
          >
            {slice}
          </a>,
        );
        break;
      case 'textEntityTypeStrikethrough':
        parts.push(<s key={key}>{slice}</s>);
        break;
      case 'textEntityTypeUnderline':
        parts.push(<u key={key}>{slice}</u>);
        break;
      case 'textEntityTypeMention':
      case 'textEntityTypeHashtag':
      case 'textEntityTypeBotCommand':
        parts.push(
          <span key={key} className="text-accent-blue">
            {slice}
          </span>,
        );
        break;
      case 'textEntityTypeSpoiler':
        parts.push(<SpoilerText key={key}>{slice}</SpoilerText>);
        break;
      case 'textEntityTypeCustomEmoji': {
        const customEmojiId = entity.customEmojiId;
        parts.push(
          customEmojiId ? (
            <CustomEmoji key={key} documentId={customEmojiId} fallback={slice} />
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
