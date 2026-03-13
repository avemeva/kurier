import { PurePhotoView } from '@/components/ui/chat/photo-view';
import { PureVideoView } from '@/components/ui/chat/video-view';
import type { TGAlbumItem } from '@/data';
import {
  ALBUM_SPACING,
  type Corners,
  computeAlbumLayout,
  cornersFromSides,
  MIN_MEDIA_SIZE,
  type Rect,
} from '@/lib/media-sizing';

type PureAlbumGridProps = {
  items: TGAlbumItem[];
  maxWidth: number;
};

type PureAlbumCellProps = {
  item: TGAlbumItem;
  geometry: Rect;
  corners: Corners;
};

function PureAlbumCell({ item, geometry, corners }: PureAlbumCellProps) {
  const lg = '12px';
  const none = '0px';
  const borderRadius = `${corners.topLeft ? lg : none} ${corners.topRight ? lg : none} ${corners.bottomRight ? lg : none} ${corners.bottomLeft ? lg : none}`;

  const isVideo = item.contentKind === 'video' || item.contentKind === 'animation';

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
          url={item.url ?? null}
          loading={item.url === undefined}
          isGif={item.contentKind === 'animation'}
          cover
        />
      ) : (
        <PurePhotoView
          url={item.url ?? null}
          loading={item.url === undefined}
          cover
          minithumbnail={item.minithumbnail}
        />
      )}
    </div>
  );
}

export function PureAlbumGrid({ items, maxWidth }: PureAlbumGridProps) {
  const sizes = items.map((item) => ({
    width: item.width || 100,
    height: item.height || 100,
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
      {items.map((item, i) => {
        const layoutItem = layout[i];
        if (!layoutItem) return null;
        const corners = cornersFromSides(layoutItem.sides);
        return (
          <PureAlbumCell
            key={item.messageId}
            item={item}
            geometry={layoutItem.geometry}
            corners={corners}
          />
        );
      })}
    </div>
  );
}
