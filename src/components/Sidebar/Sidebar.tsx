import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useMediaStore } from '../../stores/mediaStore';
import { MediaFile } from '../../types/media';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const {
    selectedFolder,
    setSelectedFolder,
    setMediaFiles,
    setIsScanning,
    setScanProgress,
    clearMediaFiles,
    mediaFiles,
  } = useMediaStore();

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select photo folder',
      });

      if (selected && typeof selected === 'string') {
        setSelectedFolder(selected);
        setIsScanning(true);
        setScanProgress(0);
        clearMediaFiles();

        // Call Rust backend to scan folder
        const files = await invoke<MediaFile[]>('scan_folder', {
          path: selected
        });

        // Sort files by date (newest first)
        const sortedFiles = files.sort((a, b) => {
          const dateA = new Date(a.takenAt || a.modifiedAt).getTime();
          const dateB = new Date(b.takenAt || b.modifiedAt).getTime();
          return dateB - dateA; // Descending order (newest first)
        });

        setMediaFiles(sortedFiles);
        setIsScanning(false);
        setScanProgress(100);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
      setIsScanning(false);
    }
  };

  // Determine sidebar mode based on window width
  const isMobile = windowWidth < 768; // < md breakpoint
  const isMini = windowWidth >= 768 && windowWidth < 1200; // md to xl
  const isFull = windowWidth >= 1200; // >= xl

  // Mobile: hamburger menu (overlay)
  if (isMobile) {
    return (
      <>
        {/* Hamburger button */}
        <button
          onClick={onToggle}
          className="fixed top-4 left-4 z-50 bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Overlay sidebar */}
        {isOpen && (
          <>
            <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onToggle} />
            <div className="fixed left-0 top-0 bottom-0 w-64 bg-gray-800 border-r border-gray-700 flex flex-col z-50">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h1 className="text-xl font-bold">Pengler</h1>
                <button onClick={onToggle} className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <button
                  onClick={handleSelectFolder}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                  Select Folder
                </button>
              </div>
              {selectedFolder && (
                <div className="px-4 py-2">
                  <div className="text-xs text-gray-400 mb-1">Current Folder</div>
                  <div className="text-sm truncate" title={selectedFolder}>{selectedFolder}</div>
                  <div className="text-xs text-gray-400 mt-2">{mediaFiles.length} items</div>
                </div>
              )}
              <div className="flex-1" />
              <div className="p-4 border-t border-gray-700 text-xs text-gray-400">
                <div>Pengler v0.1.0</div>
                <div>Ultra-lightweight photo library</div>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // Mini sidebar (icons only)
  if (isMini) {
    return (
      <div className="w-16 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-4">
        <div className="text-2xl mb-6">📷</div>
        <button
          onClick={handleSelectFolder}
          className="w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center mb-4"
          title="Select Folder"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>
        {selectedFolder && (
          <div className="w-2 h-2 rounded-full bg-green-500" title={`${mediaFiles.length} items`} />
        )}
      </div>
    );
  }

  // Full sidebar
  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Pengler</h1>
      </div>
      <div className="p-4">
        <button
          onClick={handleSelectFolder}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Select Folder
        </button>
      </div>
      {selectedFolder && (
        <div className="px-4 py-2">
          <div className="text-xs text-gray-400 mb-1">Current Folder</div>
          <div className="text-sm truncate" title={selectedFolder}>{selectedFolder}</div>
          <div className="text-xs text-gray-400 mt-2">{mediaFiles.length} items</div>
        </div>
      )}
      <div className="flex-1" />
      <div className="p-4 border-t border-gray-700 text-xs text-gray-400">
        <div>Pengler v0.1.0</div>
        <div>Ultra-lightweight photo library</div>
      </div>
    </div>
  );
}

export default Sidebar;
