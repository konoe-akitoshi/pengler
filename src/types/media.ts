export type MediaType = 'image' | 'video';

export interface MediaFile {
  id: number;
  filePath: string;
  fileHash: string;
  fileSize: number;
  width: number;
  height: number;
  takenAt: string | null;
  modifiedAt: string;
  thumbnailPath: string | null;
  mediaType: MediaType;
  createdAt: string;
}

export interface ScanProgress {
  current: number;
  total: number;
  currentFile: string;
}

export interface CacheStats {
  totalSize: number;
  fileCount: number;
  maxSize: number;
}
