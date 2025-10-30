import { useMemo, useState, useRef, useEffect } from 'react';
import { useMediaStore } from '../../stores/mediaStore';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import TimelineScrubber from './TimelineScrubber';
import dayjs from 'dayjs';
import { MediaFile } from '../../types/media';

function Gallery() {
  const { mediaFiles, isScanning, scanProgress, lastViewedMediaId, showBorder, setSelectedMedia, setShowBorder, setMediaFiles } = useMediaStore();
  const [currentMonth, setCurrentMonth] = useState<string>('');
  const [currentYear, setCurrentYear] = useState<string>('');
  const [_isScrolling, setIsScrolling] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const borderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group by year -> month -> day hierarchy
  const groupedByDate = useMemo(() => {
    const yearGroups = new Map<string, Map<string, Map<string, typeof mediaFiles>>>();

    mediaFiles.forEach((file) => {
      const date = file.takenAt || file.modifiedAt;
      const year = dayjs(date).format('YYYY');
      const month = dayjs(date).format('YYYY-MM');
      const day = dayjs(date).format('YYYY-MM-DD');

      // Initialize year if not exists
      if (!yearGroups.has(year)) {
        yearGroups.set(year, new Map());
      }
      const yearGroup = yearGroups.get(year)!;

      // Initialize month if not exists
      if (!yearGroup.has(month)) {
        yearGroup.set(month, new Map());
      }
      const monthGroup = yearGroup.get(month)!;

      // Initialize day if not exists
      if (!monthGroup.has(day)) {
        monthGroup.set(day, []);
      }
      monthGroup.get(day)!.push(file);
    });

    // Convert to sorted arrays
    return Array.from(yearGroups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, months]) => ({
        year,
        months: Array.from(months.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([month, days]) => ({
            month,
            days: Array.from(days.entries())
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([day, files]) => ({ day, files }))
          }))
      }));
  }, [mediaFiles]);

  // Note: Background optimization is now handled by Settings.tsx when loading library folders
  // This component just displays the media files

  // Handle arrow key navigation in gallery (when modal is closed)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keys when modal is closed and border is visible
      if (!showBorder || !lastViewedMediaId) return;

      if (e.key === 'Enter') {
        // Open the currently selected media
        const currentMedia = mediaFiles.find(m => m.id === lastViewedMediaId);
        if (currentMedia) {
          setSelectedMedia(currentMedia);
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const currentIndex = mediaFiles.findIndex(m => m.id === lastViewedMediaId);
        if (currentIndex === -1) return;

        let nextIndex = currentIndex;
        if (e.key === 'ArrowRight' && currentIndex < mediaFiles.length - 1) {
          nextIndex = currentIndex + 1;
        } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
          nextIndex = currentIndex - 1;
        }

        if (nextIndex !== currentIndex) {
          const nextMedia = mediaFiles[nextIndex];
          // Update lastViewedMediaId without opening modal
          useMediaStore.setState({ lastViewedMediaId: nextMedia.id });

          // Scroll to the new element
          setTimeout(() => {
            const element = document.getElementById(`media-${nextMedia.id}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 0);

          // Reset border timeout
          if (borderTimeoutRef.current) {
            clearTimeout(borderTimeoutRef.current);
          }
          setShowBorder(true);
          borderTimeoutRef.current = setTimeout(() => {
            setShowBorder(false);
          }, 3000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (borderTimeoutRef.current) {
        clearTimeout(borderTimeoutRef.current);
      }
    };
  }, [showBorder, lastViewedMediaId, mediaFiles, setShowBorder]);

  // Handle scroll to update current year/month indicator and detect fast scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current) return;

      // Detect fast scrolling
      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);

      const containerRect = scrollContainerRef.current.getBoundingClientRect();

      // Find which year/month section is currently visible
      for (const yearGroup of groupedByDate) {
        const yearElement = document.getElementById(`year-${yearGroup.year}`);
        if (yearElement) {
          const yearRect = yearElement.getBoundingClientRect();

          // Check if this year section is in view
          if (yearRect.top <= containerRect.top + 100 && yearRect.bottom > containerRect.top) {
            setCurrentYear(yearGroup.year);

            // Find current month within this year
            for (const monthGroup of yearGroup.months) {
              const monthElement = document.getElementById(`month-${monthGroup.month}`);
              if (monthElement) {
                const monthRect = monthElement.getBoundingClientRect();
                if (monthRect.top <= containerRect.top + 100 && monthRect.bottom > containerRect.top) {
                  setCurrentMonth(monthGroup.month);
                  break;
                }
              }
            }
            break;
          }
        }
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // Set initial year/month
      if (groupedByDate.length > 0) {
        setCurrentYear(groupedByDate[0].year);
        if (groupedByDate[0].months.length > 0) {
          setCurrentMonth(groupedByDate[0].months[0].month);
        }
      }
      return () => {
        container.removeEventListener('scroll', handleScroll);
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }
  }, [groupedByDate]);

  // Listen for file system events from watcher
  useEffect(() => {
    if (mediaFiles.length === 0) return; // Don't listen if no library loaded

    let isProcessing = false;
    const pendingChanges = { added: new Set<string>(), removed: new Set<string>() };
    let debounceTimer: NodeJS.Timeout | null = null;

    const processChanges = async () => {
      if (isProcessing || (pendingChanges.added.size === 0 && pendingChanges.removed.size === 0)) {
        return;
      }

      isProcessing = true;
      const added = Array.from(pendingChanges.added);
      const removed = Array.from(pendingChanges.removed);
      pendingChanges.added.clear();
      pendingChanges.removed.clear();

      console.log(`Processing changes: +${added.length} added, -${removed.length} removed`);

      try {
        const config = await invoke<{library_folders: string[]}>('get_config');
        if (!config || config.library_folders.length === 0) return;

        // Rescan to get current state
        const currentFiles: MediaFile[] = [];
        for (const folder of config.library_folders) {
          try {
            const files = await invoke<MediaFile[]>('scan_folder', { path: folder });
            currentFiles.push(...files);
          } catch (error) {
            console.error(`Failed to scan folder ${folder}:`, error);
          }
        }

        // Update media files list
        const updatedFiles = currentFiles.sort((a, b) => {
          const dateA = new Date(a.takenAt || a.modifiedAt).getTime();
          const dateB = new Date(b.takenAt || b.modifiedAt).getTime();
          return dateB - dateA;
        });
        setMediaFiles(updatedFiles);

        // Find and optimize newly added files
        const existingPaths = new Set(mediaFiles.map(f => f.filePath));
        const newFiles = currentFiles.filter(f => !existingPaths.has(f.filePath));

        for (const newFile of newFiles) {
          const libraryFolder = config.library_folders.find(folder => {
            const folderNormalized = folder.replace(/\\/g, '/').replace(/\/$/, '');
            const fileNormalized = newFile.filePath.replace(/\\/g, '/');
            return fileNormalized.startsWith(folderNormalized);
          });

          if (libraryFolder) {
            invoke('optimize_media_file', {
              folderPath: libraryFolder,
              filePath: newFile.filePath,
              fileHash: newFile.fileHash,
              mediaType: newFile.mediaType,
            }).catch(error => {
              console.error(`Failed to optimize ${newFile.filePath}:`, error);
            });
          }
        }
      } catch (error) {
        console.error('Failed to process file changes:', error);
      } finally {
        isProcessing = false;
      }
    };

    const scheduleProcessing = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(processChanges, 1000); // 1 second debounce
    };

    // Listen for file-added events
    const unlistenAdded = listen<string>('file-added', (event) => {
      const filePath = event.payload;
      console.log('File added:', filePath);
      pendingChanges.added.add(filePath);
      scheduleProcessing();
    });

    // Listen for file-removed events
    const unlistenRemoved = listen<string>('file-removed', (event) => {
      const filePath = event.payload;
      console.log('File removed:', filePath);
      pendingChanges.removed.add(filePath);
      scheduleProcessing();
    });

    return () => {
      unlistenAdded.then(f => f());
      unlistenRemoved.then(f => f());
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [mediaFiles, setMediaFiles]);

  if (isScanning) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg mb-2">Scanning folder...</div>
          <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (mediaFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-6xl mb-4">📷</div>
          <div className="text-xl">No photos yet</div>
          <div className="text-sm mt-2">Select a folder to get started</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto relative timeline-scrollbar" ref={scrollContainerRef}>
      {/* Timeline Scrubber (Immich-inspired) */}
      <TimelineScrubber
        groupedByDate={groupedByDate}
        scrollContainerRef={scrollContainerRef}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />

      {/* Hierarchical Year -> Month -> Day Grid */}
      {groupedByDate.map((yearGroup) => (
        <div key={yearGroup.year} id={`year-${yearGroup.year}`} className="mb-12">
          {/* Year Header (Sticky Level 1) */}
          <div className="sticky top-0 bg-gray-900 z-20 px-4 py-3 border-b-2 border-blue-600">
            <h1 className="text-2xl font-bold text-white">{yearGroup.year}</h1>
          </div>

          {yearGroup.months.map((monthGroup) => (
            <div key={monthGroup.month} id={`month-${monthGroup.month}`} className="mb-8">
              {/* Month Header (Sticky Level 2) */}
              <div className="sticky top-12 bg-gray-800 z-10 px-4 py-2 border-b border-gray-700">
                <h2 className="text-lg font-semibold">
                  {dayjs(monthGroup.month).format('MMMM')}
                </h2>
                <div className="text-sm text-gray-400">
                  {monthGroup.days.reduce((sum, day) => sum + day.files.length, 0)} items
                </div>
              </div>

              {monthGroup.days.map((dayGroup) => (
                <div key={dayGroup.day} className="mb-6">
                  {/* Day Header (smaller, inline) */}
                  <div className="px-4 py-2 bg-gray-800 bg-opacity-50">
                    <h3 className="text-sm font-medium text-gray-300">
                      {dayjs(dayGroup.day).format('dddd, MMMM D')}
                    </h3>
                  </div>

                  {/* Flexbox grid for this day */}
                  <div className="flex flex-wrap gap-1 px-4 items-start">
                    {dayGroup.files.map((file) => {
                      // For videos, don't use thumbnail if it fails - just show file path
                      // For images, use the image file directly as fallback
                      const isVideo = file.mediaType === 'video';
                      const thumbnailSrc = file.thumbnailPath
                        ? convertFileSrc(file.thumbnailPath)
                        : (isVideo ? '' : convertFileSrc(file.filePath));

                      const isLastViewed = file.id === lastViewedMediaId;
                      const borderStyle = (isLastViewed && showBorder)
                        ? {
                            outline: '4px solid #3b82f6',
                            outlineOffset: '2px',
                            boxShadow: '0 0 0 6px rgba(59, 130, 246, 0.3)'
                          }
                        : {};

                      if (isVideo && !file.thumbnailPath) {
                        // Video without thumbnail - show placeholder
                        return (
                          <div
                            key={file.id}
                            id={`media-${file.id}`}
                            className="h-[200px] w-[200px] bg-gray-800 rounded cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0 flex items-center justify-center"
                            style={borderStyle}
                            onClick={() => useMediaStore.getState().setSelectedMedia(file)}
                          >
                            <div className="text-center text-gray-400">
                              <div className="text-4xl mb-2">🎬</div>
                              <div className="text-xs px-2">Video</div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <img
                          key={file.id}
                          id={`media-${file.id}`}
                          src={thumbnailSrc}
                          alt={file.filePath}
                          className="h-[200px] w-auto object-cover rounded cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0"
                          style={borderStyle}
                          loading="lazy"
                          onClick={() => useMediaStore.getState().setSelectedMedia(file)}
                          onError={(e) => {
                            // For images, fallback to original file
                            // For videos with failed thumbnails, hide the image
                            if (!isVideo && file.thumbnailPath && e.currentTarget.src !== convertFileSrc(file.filePath)) {
                              e.currentTarget.src = convertFileSrc(file.filePath);
                            } else if (isVideo) {
                              // Hide broken video thumbnail
                              e.currentTarget.style.display = 'none';
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default Gallery;
