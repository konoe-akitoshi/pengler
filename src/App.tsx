import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore } from './stores/appStore';
import { useMediaStore } from './stores/mediaStore';
import Gallery from './components/Gallery/Gallery';
import Sidebar from './components/Sidebar/Sidebar';
import MediaViewer from './components/Lightbox/MediaViewer';
import Settings from './pages/Settings';
import Tasks from './pages/Tasks';
import Import from './pages/Import';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentPage = useAppStore((state) => state.currentPage);
  const selectedMedia = useMediaStore((state) => state.selectedMedia);

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
