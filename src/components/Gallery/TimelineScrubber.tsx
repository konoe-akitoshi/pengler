import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';

interface TimelineSegment {
  year: number;
  month: string;
  dateFormatted: string;
  height: number;
  count: number;
  hasLabel: boolean;
  hasDot: boolean;
}

interface TimelineScrubberProps {
  groupedByDate: {
    year: string;
    months: {
      month: string;
      days: { day: string; files: any[] }[];
    }[];
  }[];
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  currentYear: string;
  currentMonth: string;
}

const PADDING_TOP = 32;
const PADDING_BOTTOM = 10;
const MIN_YEAR_LABEL_DISTANCE = 16;
const MIN_DOT_DISTANCE = 8;
const SCRUBBER_WIDTH = 60;

function TimelineScrubber({
  groupedByDate,
  scrollContainerRef,
  currentYear,
  currentMonth,
}: TimelineScrubberProps) {
  const [isHover, setIsHover] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [hoverY, setHoverY] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [hoverLabel, setHoverLabel] = useState('');
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [scrubberHeight, setScrubberHeight] = useState(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate timeline segments
  const segments = useMemo((): TimelineSegment[] => {
    const result: TimelineSegment[] = [];
    const container = scrollContainerRef.current;
    if (!container) return result;

    const totalScrollHeight = container.scrollHeight - container.clientHeight;
    const availableHeight = scrubberHeight - (PADDING_TOP + PADDING_BOTTOM);

    let heightAccumulator = 0;
    let dotHeightAccumulator = 0;
    let previousLabeledYear: number | null = null;

    groupedByDate.forEach((yearGroup) => {
      yearGroup.months.forEach((monthGroup, monthIndex) => {
        const totalFiles = monthGroup.days.reduce((sum, day) => sum + day.files.length, 0);

        // Estimate height based on file count (rough approximation)
        const estimatedContentHeight = Math.ceil(totalFiles / 5) * 200 + 100;
        const heightPercentage = estimatedContentHeight / (container.scrollHeight || 1);
        const segmentHeight = heightPercentage * availableHeight;

        const segment: TimelineSegment = {
          year: parseInt(yearGroup.year),
          month: monthGroup.month,
          dateFormatted: dayjs(monthGroup.month).format('MMM YYYY'),
          height: Math.max(segmentHeight, 1),
          count: totalFiles,
          hasLabel: false,
          hasDot: false,
        };

        // Determine if this segment should have a year label
        if (monthIndex === 0 && heightAccumulator > MIN_YEAR_LABEL_DISTANCE) {
          segment.hasLabel = true;
          previousLabeledYear = segment.year;
          heightAccumulator = 0;
        } else if (previousLabeledYear !== segment.year && heightAccumulator > MIN_YEAR_LABEL_DISTANCE) {
          segment.hasLabel = true;
          previousLabeledYear = segment.year;
          heightAccumulator = 0;
        }

        // Determine if this segment should have a dot marker
        if (segment.height > 5 && dotHeightAccumulator > MIN_DOT_DISTANCE) {
          segment.hasDot = true;
          dotHeightAccumulator = 0;
        }

        heightAccumulator += segment.height;
        dotHeightAccumulator += segment.height;
        result.push(segment);
      });
    });

    return result;
  }, [groupedByDate, scrubberHeight, scrollContainerRef]);

  // Update scrubber height
  useEffect(() => {
    const updateHeight = () => {
      if (scrubberRef.current) {
        setScrubberHeight(scrubberRef.current.clientHeight);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Track scroll position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const maxScroll = scrollHeight - clientHeight;
      const scrollPercentage = maxScroll > 0 ? scrollTop / maxScroll : 0;
      const availableHeight = scrubberHeight - (PADDING_TOP + PADDING_BOTTOM);
      setScrollY(scrollPercentage * availableHeight);

      // Show scrollbar during scroll
      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 1000);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [scrollContainerRef, scrubberHeight]);

  // Get segment at Y position
  const getSegmentAtY = useCallback(
    (y: number) => {
      let accumulatedHeight = PADDING_TOP;
      for (const segment of segments) {
        if (y >= accumulatedHeight && y < accumulatedHeight + segment.height) {
          return {
            segment,
            offsetInSegment: y - accumulatedHeight,
            percentInSegment: (y - accumulatedHeight) / segment.height,
          };
        }
        accumulatedHeight += segment.height;
      }
      return null;
    },
    [segments]
  );

  // Handle mouse/drag events (with clamp like Immich)
  const handleMouseMove = useCallback(
    (clientY: number, shouldScroll: boolean = false) => {
      if (!scrubberRef.current) return;

      const rect = scrubberRef.current.getBoundingClientRect();
      const relativeY = clientY - rect.top - PADDING_TOP;
      const lower = 0;
      const upper = rect.height - (PADDING_TOP + PADDING_BOTTOM);
      const clampedY = Math.max(lower, Math.min(upper, relativeY));

      setHoverY(clampedY);

      const segmentInfo = getSegmentAtY(clampedY + PADDING_TOP);
      if (segmentInfo) {
        setHoverLabel(segmentInfo.segment.dateFormatted);
      }

      // Update scroll position when dragging or when explicitly requested
      if ((isDragging || shouldScroll) && scrollContainerRef.current) {
        // Calculate scroll position
        const { scrollHeight, clientHeight } = scrollContainerRef.current;
        const maxScroll = scrollHeight - clientHeight;
        const availableHeight = rect.height - (PADDING_TOP + PADDING_BOTTOM);
        const scrollPercentage = clampedY / availableHeight;
        scrollContainerRef.current.scrollTop = scrollPercentage * maxScroll;
      }
    },
    [isDragging, getSegmentAtY, scrollContainerRef]
  );

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse handlers when dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => handleMouseMove(e.clientY);
    const handleUp = () => handleMouseUp();

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Get current scroll label
  const scrollLabel = useMemo(() => {
    const segmentInfo = getSegmentAtY(scrollY + PADDING_TOP);
    return segmentInfo?.segment.dateFormatted || '';
  }, [scrollY, getSegmentAtY]);

  // Dynamic width (expand to full width when dragging like Immich)
  const scrubberWidth = isDragging ? '100vw' : `${SCRUBBER_WIDTH}px`;

  return (
    <div
      ref={scrubberRef}
      className="fixed right-0 top-0 bottom-0 z-50 select-none hover:cursor-row-resize transition-all"
      style={{
        width: scrubberWidth,
        paddingTop: PADDING_TOP,
        paddingBottom: PADDING_BOTTOM,
        backgroundColor: isDragging ? 'transparent' : 'transparent'
      }}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      onMouseDown={(e) => {
        e.preventDefault();
        setIsDragging(true);
        handleMouseMove(e.clientY, true); // true = should scroll immediately
      }}
      onMouseMove={(e) => {
        if (isHover || isDragging) {
          handleMouseMove(e.clientY, false); // false = only scroll when dragging
        }
      }}
    >
      {/* Hover label and thumb */}
      <AnimatePresence>
        {(isHover || isDragging) && hoverLabel && (
          <>
            {/* Hover thumb (bar that follows cursor) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute right-0 w-10 h-0.5 bg-blue-500 pointer-events-none"
              style={{ top: hoverY + PADDING_TOP }}
            />
            {/* Hover label */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="absolute right-14 bg-gray-900 bg-opacity-90 backdrop-blur-sm px-3 py-1 rounded-l-md border-b-2 border-blue-500 shadow-lg text-sm font-medium text-white whitespace-nowrap pointer-events-none z-10"
              style={{ top: hoverY + PADDING_TOP }}
            >
              {hoverLabel}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Scroll position indicator */}
      {!isDragging && (
        <div
          className="absolute right-0 h-0.5 w-10 bg-blue-500 transition-all duration-200"
          style={{ top: scrollY + PADDING_TOP }}
        >
          {isScrolling && scrollLabel && !isHover && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 bottom-0 bg-gray-900 bg-opacity-90 backdrop-blur-sm px-2 py-1 rounded-tl-md border-b-2 border-blue-500 text-xs font-medium text-white whitespace-nowrap pointer-events-none shadow-lg"
            >
              {scrollLabel}
            </motion.div>
          )}
        </div>
      )}

      {/* Timeline segments */}
      <div className="relative h-full">
        {segments.map((segment, index) => {
          let accumulatedHeight = 0;
          for (let i = 0; i < index; i++) {
            accumulatedHeight += segments[i].height;
          }

          return (
            <div
              key={`${segment.year}-${segment.month}`}
              className="absolute right-0"
              style={{
                top: accumulatedHeight,
                height: segment.height,
              }}
            >
              {/* Year label */}
              {segment.hasLabel && (
                <div className="absolute right-5 -top-4 text-xs text-gray-400 font-mono">
                  {segment.year}
                </div>
              )}

              {/* Dot marker */}
              {segment.hasDot && (
                <div className="absolute right-3 bottom-0 w-1 h-1 rounded-full bg-gray-500" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TimelineScrubber;
