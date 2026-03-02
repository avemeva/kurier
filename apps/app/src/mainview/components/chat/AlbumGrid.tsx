import { PurePhotoView } from '@/components/ui/chat/PhotoView';
import { PureVideoView } from '@/components/ui/chat/VideoView';
import type { UIMessage } from '@/lib/types';
import { MessagePhoto } from './MessagePhoto';
import { MessageVideo } from './MessageVideo';

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

export function AlbumGrid({
  messages,
  chatId,
  resolveUrl,
}: {
  messages: UIMessage[];
  chatId: number;
  resolveUrl?: (messageId: number) => string | null;
}) {
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
            {rowMsgs.map((msg) => {
              const ct = msg.contentKind;
              const isPhoto = ct === 'photo' || ct === 'sticker';
              const isVideo = ct === 'video' || ct === 'videoNote' || ct === 'animation';
              return (
                <div key={msg.id} className="min-w-0 flex-1 overflow-hidden">
                  {resolveUrl ? (
                    isVideo ? (
                      <PureVideoView url={resolveUrl(msg.id)} isGif={ct === 'animation'} cover />
                    ) : (
                      <PurePhotoView url={resolveUrl(msg.id)} cover />
                    )
                  ) : isPhoto ? (
                    <MessagePhoto chatId={chatId} messageId={msg.id} cover />
                  ) : isVideo ? (
                    <MessageVideo
                      chatId={chatId}
                      messageId={msg.id}
                      isGif={ct === 'animation'}
                      cover
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-accent text-xs italic text-text-tertiary">
                      {msg.contentKind}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
