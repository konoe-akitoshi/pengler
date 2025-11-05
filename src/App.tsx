import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from './stores/appStore';
import { useMediaStore } from './stores/mediaStore';
import { useConfigStore } from './stores/configStore';
import { MediaFile } from './types/media';
import Gallery from './components/Gallery/Gallery';
import Sidebar from './components/Sidebar/Sidebar';
import MediaViewer from './components/Lightbox/MediaViewer';
import Settings from './pages/Settings';
import Tasks from './pages/Tasks';
import Import from './pages/Import';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentPage, setCurrentPage } = useAppStore();
  const selectedMedia = useMediaStore((state) => state.selectedMedia);
  const { setMediaFiles, setIsScanning } = useMediaStore();
  const { config, loadConfig } = useConfigStore();

  // Auto-load library on startup from database
  useEffect(() => {
    const autoLoadLibrary = async () => {
      console.log('Loading library from database...');
      setIsScanning(true);

      try {
        // Load media files from database
        const files = await invoke<MediaFile[]>('load_media_files_from_db');

        if (files.length > 0) {
          setMediaFiles(files);
          console.log(`Loaded ${files.length} files from database`);

          // Load config to start watching folders
          await loadConfig();
          const currentConfig = useConfigStore.getState().config;

          if (currentConfig && currentConfig.library_folders.length > 0) {
            // Start watching folders for changes
            try {
              await invoke('start_watching_folders', {
                folderPaths: currentConfig.library_folders,
              });
              console.log('Started watching folders for changes');
            } catch (error) {
              console.error('Failed to start file watcher:', error);
            }
          }
        } else {
          console.log('No files in database, library may not be loaded yet');
        }
      } catch (error) {
        console.error('Failed to load library from database:', error);
      } finally {
        setIsScanning(false);
      }
    };

    autoLoadLibrary();
  }, []); // Empty deps - only run once on mount

  useEffect(() => {
    // Listen for SD card insertion events
    const unlistenInserted = listen<string>('sd-card-inserted', (event) => {
      console.log('SD card inserted:', event.payload);
      // Automatically navigate to import page
      setCurrentPage('import');
    });

    const unlistenRemoved = listen<string>('sd-card-removed', (event) => {
      console.log('SD card removed:', event.payload);
    });

    return () => {
      unlistenInserted.then(fn => fn());
      unlistenRemoved.then(fn => fn());
    };
  }, [setCurrentPage]);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentPage === 'home' && <Gallery />}
        {currentPage === 'import' && <Import />}
        {currentPage === 'settings' && <Settings />}
        {currentPage === 'tasks' && <Tasks />}
      </div>

      {/* Lightbox */}
      <AnimatePresence mode="wait">
        {selectedMedia && <MediaViewer key="media-viewer" />}
      </AnimatePresence>
    </div>
  );
}

export default App;
