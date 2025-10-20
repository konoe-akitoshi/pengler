import { useMemo, useState, useRef, useEffect } from 'react';
import { useMediaStore } from '../../stores/mediaStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import TimelineScrubber from './TimelineScrubber';
import dayjs from 'dayjs';

function Gallery() {
  const { mediaFiles, isScanning, scanProgress } = useMediaStore();
  const [currentMonth, setCurrentMonth] = useState<string>('');
  const [currentYear, setCurrentYear] = useState<string>('');
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
                  <div className="flex flex-wrap gap-1 px-4">
                    {dayGroup.files.map((file) => {
                      const thumbnailSrc = file.thumbnailPath
                        ? convertFileSrc(file.thumbnailPath)
                        : convertFileSrc(file.filePath);

                      return (
                        <div
                          key={file.id}
                          className="flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                          style={{ height: '200px', width: 'auto' }}
                          onClick={() => useMediaStore.getState().setSelectedMedia(file)}
                        >
                          <img
                            src={thumbnailSrc}
                            alt={file.filePath}
                            className="h-full w-auto object-cover rounded"
                            loading="lazy"
                          />
                        </div>
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
