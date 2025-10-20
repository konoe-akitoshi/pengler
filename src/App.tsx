import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useMediaStore } from './stores/mediaStore';
import Gallery from './components/Gallery/Gallery';
import Sidebar from './components/Sidebar/Sidebar';
import MediaViewer from './components/Lightbox/MediaViewer';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const selectedMedia = useMediaStore((state) => state.selectedMedia);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Gallery />
      </div>

      {/* Lightbox */}
      <AnimatePresence mode="wait">
        {selectedMedia && <MediaViewer key="media-viewer" />}
      </AnimatePresence>
    </div>
  );
}

export default App;
