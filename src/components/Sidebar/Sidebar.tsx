import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useMediaStore } from '../../stores/mediaStore';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface NavItem {
  id: 'home' | 'settings';
  label: string;
  icon: JSX.Element;
}

const BREAKPOINTS = {
  MOBILE: 768,
  DESKTOP: 1200,
} as const;

const navItems: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isHovered, setIsHovered] = useState(false);
  const { currentPage, setCurrentPage } = useAppStore();
  const { mediaFiles } = useMediaStore();

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < BREAKPOINTS.MOBILE;
  const isMini = windowWidth >= BREAKPOINTS.MOBILE && windowWidth < BREAKPOINTS.DESKTOP;
  const isFull = windowWidth >= BREAKPOINTS.DESKTOP;

  // Mobile mode
  if (isMobile) {
    return <MobileSidebar isOpen={isOpen} onToggle={onToggle} currentPage={currentPage} setCurrentPage={setCurrentPage} photoCount={mediaFiles.length} />;
  }

  // Desktop mode (mini & full with seamless transition)
  const showLabels = isFull || isHovered;

  return (
    <DesktopSidebar
      showLabels={showLabels}
      isMini={isMini}
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      photoCount={mediaFiles.length}
      onHoverChange={setIsHovered}
    />
  );
}

// Mobile Sidebar Component
interface MobileSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentPage: string;
  setCurrentPage: (page: 'home' | 'settings') => void;
  photoCount: number;
}

function MobileSidebar({ isOpen, onToggle, currentPage, setCurrentPage, photoCount }: MobileSidebarProps) {
  return (
    <>
      <button
        onClick={onToggle}
        className="fixed top-4 left-4 z-50 bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors shadow-lg"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onToggle} />
          <div className="fixed left-0 top-0 bottom-0 w-64 bg-gray-800 border-r border-gray-700 flex flex-col z-50">
            <SidebarHeader onClose={onToggle} />
            <SidebarNav currentPage={currentPage} setCurrentPage={setCurrentPage} onItemClick={onToggle} />
            <SidebarFooter photoCount={photoCount} />
          </div>
        </>
      )}
    </>
  );
}

// Desktop Sidebar Component
interface DesktopSidebarProps {
  showLabels: boolean;
  isMini: boolean;
  currentPage: string;
  setCurrentPage: (page: 'home' | 'settings') => void;
  photoCount: number;
  onHoverChange: (isHovered: boolean) => void;
}

function DesktopSidebar({ showLabels, isMini, currentPage, setCurrentPage, photoCount, onHoverChange }: DesktopSidebarProps) {
  const sidebarWidth = showLabels ? 'w-64' : 'w-16';

  return (
    <div
      className={`${sidebarWidth} bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-200 ease-in-out`}
      onMouseEnter={() => isMini && onHoverChange(true)}
      onMouseLeave={() => isMini && onHoverChange(false)}
    >
      <div className="p-4 border-b border-gray-700 flex items-center overflow-hidden">
        {showLabels ? (
          <h1 className="text-xl font-bold whitespace-nowrap">Pengler</h1>
        ) : (
          <div className="text-2xl mx-auto">📷</div>
        )}
      </div>

      <SidebarNav currentPage={currentPage} setCurrentPage={setCurrentPage} showLabels={showLabels} />

      <div className="px-4 py-3 border-t border-gray-700 overflow-hidden">
        {showLabels && <div className="text-xs text-gray-400 whitespace-nowrap">{photoCount} photos</div>}
      </div>
    </div>
  );
}

// Sidebar Header Component
interface SidebarHeaderProps {
  onClose?: () => void;
}

function SidebarHeader({ onClose }: SidebarHeaderProps) {
  return (
    <div className="p-4 border-b border-gray-700 flex items-center justify-between">
      <h1 className="text-xl font-bold">Pengler</h1>
      {onClose && (
        <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close menu">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Sidebar Navigation Component
interface SidebarNavProps {
  currentPage: string;
  setCurrentPage: (page: 'home' | 'settings') => void;
  showLabels?: boolean;
  onItemClick?: () => void;
}

function SidebarNav({ currentPage, setCurrentPage, showLabels = true, onItemClick }: SidebarNavProps) {
  const handleClick = (pageId: 'home' | 'settings') => {
    setCurrentPage(pageId);
    onItemClick?.();
  };

  return (
    <nav className="flex-1 p-3">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => handleClick(item.id)}
          className={`w-full flex items-center ${showLabels ? 'gap-3 px-4' : 'justify-center px-0'} py-3 rounded-lg transition-colors mb-2 overflow-hidden ${
            currentPage === item.id
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
          }`}
          title={!showLabels ? item.label : undefined}
        >
          <span className="flex-shrink-0">{item.icon}</span>
          {showLabels && <span className="font-medium whitespace-nowrap">{item.label}</span>}
        </button>
      ))}
    </nav>
  );
}

// Sidebar Footer Component
interface SidebarFooterProps {
  photoCount: number;
}

function SidebarFooter({ photoCount }: SidebarFooterProps) {
  return (
    <div className="px-4 py-3 border-t border-gray-700">
      <div className="text-xs text-gray-400">{photoCount} photos</div>
    </div>
  );
}

export default Sidebar;
