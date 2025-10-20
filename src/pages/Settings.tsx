import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useMediaStore } from '../stores/mediaStore';
import { MediaFile } from '../types/media';

function Settings() {
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
          return dateB - dateA;
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

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        {/* Library Location */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-400 mb-3">LIBRARY LOCATION</h2>

          {selectedFolder ? (
            <div className="mb-3">
              <div className="bg-gray-800 rounded p-4 border border-gray-700">
                <div className="text-xs text-gray-400 mb-1">Current folder</div>
                <div className="text-sm text-gray-200 font-mono break-all">{selectedFolder}</div>
                <div className="text-xs text-gray-400 mt-2">{mediaFiles.length} photos</div>
              </div>
            </div>
          ) : (
            <div className="mb-3">
              <div className="bg-gray-800 rounded p-4 border border-gray-700">
                <div className="text-sm text-gray-400">No folder selected</div>
              </div>
            </div>
          )}

          <button
            onClick={handleSelectFolder}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            {selectedFolder ? 'Change Folder' : 'Select Folder'}
          </button>

          <div className="mt-3 text-xs text-gray-400">
            Pengler will scan this folder and all subfolders for photos and videos. Your files are never moved or modified.
          </div>
        </div>

        {/* About */}
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">ABOUT</h2>
          <div className="bg-gray-800 rounded p-4 border border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-2xl">📷</div>
              <div>
                <div className="font-semibold">Pengler</div>
                <div className="text-xs text-gray-400">Version 0.1.0</div>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Ultra-lightweight photo library application
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
