import { useEffect, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useMediaStore } from '../../stores/mediaStore';
import { motion } from 'framer-motion';

function MediaViewer() {
  const { selectedMedia, setSelectedMedia, mediaFiles } = useMediaStore();

  const navigateNext = useCallback(() => {
    if (!selectedMedia) return;
    const currentIndex = mediaFiles.findIndex((m) => m.id === selectedMedia.id);
    console.log('Navigate next:', { currentIndex, totalFiles: mediaFiles.length, currentId: selectedMedia.id });
    if (currentIndex < mediaFiles.length - 1) {
      setSelectedMedia(mediaFiles[currentIndex + 1]);
    }
  }, [selectedMedia, mediaFiles, setSelectedMedia]);

  const navigatePrevious = useCallback(() => {
    if (!selectedMedia) return;
    const currentIndex = mediaFiles.findIndex((m) => m.id === selectedMedia.id);
    console.log('Navigate previous:', { currentIndex, totalFiles: mediaFiles.length, currentId: selectedMedia.id });
    if (currentIndex > 0) {
      setSelectedMedia(mediaFiles[currentIndex - 1]);
    }
  }, [selectedMedia, mediaFiles, setSelectedMedia]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedMedia(null);
      } else if (e.key === 'ArrowRight') {
        navigateNext();
      } else if (e.key === 'ArrowLeft') {
        navigatePrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateNext, navigatePrevious, setSelectedMedia]);

  if (!selectedMedia) return null;

  const mediaSrc = convertFileSrc(selectedMedia.filePath);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center"
      onClick={() => setSelectedMedia(null)}
    >
      <div
        className="relative max-w-7xl max-h-screen p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {selectedMedia.mediaType === 'image' ? (
          <img
            src={mediaSrc}
            alt={selectedMedia.filePath}
            className="max-w-full max-h-screen object-contain"
          />
        ) : (
          <video
            src={mediaSrc}
            controls
            autoPlay
            className="max-w-full max-h-screen"
          />
        )}

        {/* Navigation buttons */}
        <button
          onClick={navigatePrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white p-3 rounded-full transition-all"
        >
          ←
        </button>
        <button
          onClick={navigateNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white p-3 rounded-full transition-all"
        >
          →
        </button>

        {/* Close button */}
        <button
          onClick={() => setSelectedMedia(null)}
          className="absolute top-4 right-4 bg-black bg-opacity-50 hover:bg-opacity-70 text-white px-4 py-2 rounded transition-all"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

export default MediaViewer;
