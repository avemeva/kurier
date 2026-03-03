import { PurePhotoView } from '@/components/ui/chat/PhotoView';
import { PureVideoView } from '@/components/ui/chat/VideoView';
import { useMedia } from '@/hooks/useMedia';
import type { UIMessage } from '@/lib/types';

export function getAlbumRows(count: number): number[][] {
  switch (count) {
    case 1:
      return [[1]];
    case 2:
      return [[2]];
    case 3:
      return [[2], [1]];
    case 4:
      return [[2], [2]];
    case 5:
      return [[2], [3]];
    case 6:
      return [[3], [3]];
    case 7:
      return [[3], [2], [2]];
    case 8:
      return [[2], [3], [3]];
    case 9:
      return [[2], [2], [2], [3]];
    default: {
      const rows: number[][] = [];
      let remaining = count;
      while (remaining > 0) {
        const take = Math.min(remaining, 3);
        rows.push([take]);
        remaining -= take;
      }
      return rows;
    }
  }
}

function AlbumCell({ chatId, msg }: { chatId: number; msg: UIMessage }) {
  const { url, loading, retry } = useMedia(chatId, msg.id);
  const ct = msg.contentKind;
  const isVideo = ct === 'video' || ct === 'videoNote' || ct === 'animation';

  if (isVideo) {
    return (
      <PureVideoView url={url} loading={loading} isGif={ct === 'animation'} cover onRetry={retry} />
    );
  }

  const isPhoto = ct === 'photo' || ct === 'sticker';
  if (isPhoto) {
    return <PurePhotoView url={url} loading={loading} cover onRetry={retry} />;
  }

  return (
    <div className="flex h-full items-center justify-center bg-accent text-xs italic text-text-tertiary">
      {msg.contentKind}
    </div>
  );
}

export function AlbumGrid({ messages, chatId }: { messages: UIMessage[]; chatId: number }) {
  const rows = getAlbumRows(messages.length);
  let idx = 0;

  return (
    <div className="flex max-w-sm flex-col gap-0.5 overflow-hidden rounded-lg">
      {rows.map((row) => {
        const cols = row[0];
        const rowMsgs = messages.slice(idx, idx + cols);
        idx += cols;
        return (
          <div key={rowMsgs[0].id} className="flex h-[180px] gap-0.5">
            {rowMsgs.map((msg) => (
              <div key={msg.id} className="min-w-0 flex-1 overflow-hidden">
                <AlbumCell chatId={chatId} msg={msg} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
