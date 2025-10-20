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

  const currentIndex = mediaFiles.findIndex((m) => m.id === selectedMedia.id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < mediaFiles.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black z-50 flex items-center justify-center"
      onClick={() => setSelectedMedia(null)}
    >
      {/* Close button - top left */}
      <button
        onClick={() => setSelectedMedia(null)}
        className="absolute top-6 left-6 z-10 text-white hover:text-gray-300 transition-colors"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image counter - top center */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 bg-black bg-opacity-60 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm font-medium">
        {currentIndex + 1} / {mediaFiles.length}
      </div>

      {/* Main content */}
      <div
        className="relative w-full h-full flex items-center justify-center p-20"
        onClick={(e) => e.stopPropagation()}
      >
        {selectedMedia.mediaType === 'image' ? (
          <img
            key={selectedMedia.id}
            src={mediaSrc}
            alt={selectedMedia.filePath}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video
            key={selectedMedia.id}
            src={mediaSrc}
            controls
            autoPlay
            className="max-w-full max-h-full"
          />
        )}
      </div>

      {/* Navigation buttons */}
      {hasPrevious && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigatePrevious();
          }}
          className="absolute left-6 top-1/2 -translate-y-1/2 z-10 bg-white bg-opacity-10 backdrop-blur-sm hover:bg-opacity-20 text-white p-4 rounded-full transition-all shadow-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigateNext();
          }}
          className="absolute right-6 top-1/2 -translate-y-1/2 z-10 bg-white bg-opacity-10 backdrop-blur-sm hover:bg-opacity-20 text-white p-4 rounded-full transition-all shadow-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}

export default MediaViewer;
