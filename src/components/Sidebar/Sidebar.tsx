import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useMediaStore } from '../../stores/mediaStore';
import { MediaFile } from '../../types/media';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

function Sidebar({ isOpen }: SidebarProps) {
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

  if (!isOpen) return null;

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
          <div className="text-sm truncate" title={selectedFolder}>
            {selectedFolder}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            {mediaFiles.length} items
          </div>
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
