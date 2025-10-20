import { CSSProperties } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useMediaStore } from '../../stores/mediaStore';
import { MediaFile } from '../../types/media';

interface ThumbnailCellProps {
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
  data: MediaFile[];
}

function ThumbnailCell({ columnIndex, rowIndex, style, data }: ThumbnailCellProps) {
  const COLUMN_COUNT = 5;
  const index = rowIndex * COLUMN_COUNT + columnIndex;
  const setSelectedMedia = useMediaStore((state) => state.setSelectedMedia);

  if (index >= data.length) {
    return null;
  }

  const media = data[index];
  const thumbnailSrc = media.thumbnailPath
    ? convertFileSrc(media.thumbnailPath)
    : convertFileSrc(media.filePath);

  return (
    <div
      style={style}
      className="p-1"
      onClick={() => setSelectedMedia(media)}
    >
      <div className="relative w-full h-full bg-gray-700 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all">
        <img
          src={thumbnailSrc}
          alt={media.filePath}
          className="w-full h-full object-contain"
          loading="lazy"
        />
        {media.mediaType === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black bg-opacity-60 rounded-full p-3">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ThumbnailCell;
