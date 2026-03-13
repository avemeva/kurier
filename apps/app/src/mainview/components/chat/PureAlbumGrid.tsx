import { PurePhotoView } from '@/components/ui/chat/PhotoView';
import { PureVideoView } from '@/components/ui/chat/VideoView';
import {
  ALBUM_SPACING,
  type Corners,
  computeAlbumLayout,
  cornersFromSides,
  MIN_MEDIA_SIZE,
  type Rect,
} from '@/lib/media-sizing';
import type { UIMessage } from '@/lib/types';

type PureAlbumGridProps = {
  messages: UIMessage[];
  albumMedia?: Array<{ url: string | null; loading: boolean }>;
  maxWidth: number;
};

type PureAlbumCellProps = {
  msg: UIMessage;
  url: string | null;
  loading: boolean;
  geometry: Rect;
  corners: Corners;
};

function PureAlbumCell({ msg, url, loading, geometry, corners }: PureAlbumCellProps) {
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
        <PureVideoView url={url} loading={loading} isGif={msg.contentKind === 'animation'} cover />
      ) : (
        <PurePhotoView url={url} loading={loading} cover minithumbnail={msg.minithumbnail} />
      )}
    </div>
  );
}

export function PureAlbumGrid({ messages, albumMedia, maxWidth }: PureAlbumGridProps) {
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
          <PureAlbumCell
            key={msg.id}
            msg={msg}
            url={albumMedia?.[i]?.url ?? null}
            loading={albumMedia?.[i]?.loading ?? false}
            geometry={item.geometry}
            corners={corners}
          />
        );
      })}
    </div>
  );
}
