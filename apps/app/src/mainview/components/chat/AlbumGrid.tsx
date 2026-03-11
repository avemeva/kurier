import { PurePhotoView } from '@/components/ui/chat/PhotoView';
import { PureVideoView } from '@/components/ui/chat/VideoView';
import { useMedia } from '@/hooks/useMedia';
import {
  ALBUM_SPACING,
  type Corners,
  computeAlbumLayout,
  cornersFromSides,
  MIN_MEDIA_SIZE,
  type Rect,
} from '@/lib/media-sizing';
import type { UIMessage } from '@/lib/types';

type AlbumGridProps = {
  messages: UIMessage[];
  chatId: number;
  maxWidth: number;
};

type AlbumCellProps = {
  msg: UIMessage;
  chatId: number;
  geometry: Rect;
  corners: Corners;
};

function AlbumCell({ msg, chatId, geometry, corners }: AlbumCellProps) {
  const { url, loading, retry } = useMedia(chatId, msg.id);
  const lg = '12px';
  const none = '0px';
  const borderRadius = `${corners.topLeft ? lg : none} ${corners.topRight ? lg : none} ${corners.bottomRight ? lg : none} ${corners.bottomLeft ? lg : none}`;

  const isVideo = msg.contentKind === 'video' || msg.contentKind === 'animation';

  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left: geometry.x,
        top: geometry.y,
        width: geometry.width,
        height: geometry.height,
        borderRadius,
      }}
    >
      {isVideo ? (
        <PureVideoView
          url={url}
          loading={loading}
          isGif={msg.contentKind === 'animation'}
          cover
          onRetry={retry}
        />
      ) : (
        <PurePhotoView
          url={url}
          loading={loading}
          cover
          onRetry={retry}
          minithumbnail={msg.minithumbnail}
        />
      )}
    </div>
  );
}

export function AlbumGrid({ messages, chatId, maxWidth }: AlbumGridProps) {
  const sizes = messages.map((m) => ({
    width: m.mediaWidth || 100,
    height: m.mediaHeight || 100,
  }));
  const layout = computeAlbumLayout(sizes, maxWidth, MIN_MEDIA_SIZE, ALBUM_SPACING);

  const containerWidth = maxWidth;
  const containerHeight = layout.reduce(
    (max, item) => Math.max(max, item.geometry.y + item.geometry.height),
    0,
  );

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {messages.map((msg, i) => {
        const item = layout[i];
        if (!item) return null;
        const corners = cornersFromSides(item.sides);
        return (
          <AlbumCell
            key={msg.id}
            msg={msg}
            chatId={chatId}
            geometry={item.geometry}
            corners={corners}
          />
        );
      })}
    </div>
  );
}
