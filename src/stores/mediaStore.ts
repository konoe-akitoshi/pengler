import { create } from 'zustand';
import { MediaFile } from '../types/media';

interface MediaStore {
  mediaFiles: MediaFile[];
  selectedFolder: string | null;
  isScanning: boolean;
  scanProgress: number;
  selectedMedia: MediaFile | null;

  setMediaFiles: (files: MediaFile[]) => void;
  setSelectedFolder: (folder: string | null) => void;
  setIsScanning: (scanning: boolean) => void;
  setScanProgress: (progress: number) => void;
  setSelectedMedia: (media: MediaFile | null) => void;
  clearMediaFiles: () => void;
  removeMediaFromFolder: (folderPath: string) => void;
}

export const useMediaStore = create<MediaStore>((set) => ({
  mediaFiles: [],
  selectedFolder: null,
  isScanning: false,
  scanProgress: 0,
  selectedMedia: null,

  setMediaFiles: (files) => set({ mediaFiles: files }),
  setSelectedFolder: (folder) => set({ selectedFolder: folder }),
  setIsScanning: (scanning) => set({ isScanning: scanning }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  setSelectedMedia: (media) => set({ selectedMedia: media }),
  clearMediaFiles: () => set({ mediaFiles: [], selectedMedia: null }),
  removeMediaFromFolder: (folderPath: string) => set((state) => {
    const folderNormalized = folderPath.replace(/\\/g, '/');
    const filteredFiles = state.mediaFiles.filter(file => {
      const fileNormalized = file.filePath.replace(/\\/g, '/');
      return !fileNormalized.startsWith(folderNormalized);
    });
    return {
      mediaFiles: filteredFiles,
      selectedMedia: state.selectedMedia &&
        state.selectedMedia.filePath.replace(/\\/g, '/').startsWith(folderNormalized)
        ? null
        : state.selectedMedia
    };
  }),
}));
