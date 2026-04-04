import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Resource, ResourceBlock } from './ResourceTimeline';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ResourceCalendarProps {
  resources: Resource[];
  blocks: ResourceBlock[];
  onBlockClick?: (block: ResourceBlock) => void;
}

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, month: number, year: number): boolean {
  return a.getFullYear() === year && a.getMonth() === month;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDate(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/* ------------------------------------------------------------------ */
/*  getMonthGrid — returns 35 or 42 day Date objects for the grid     */
/* ------------------------------------------------------------------ */

function getMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const gridStart = new Date(year, month, 1 - startOffset);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = startOffset + daysInMonth > 35 ? 42 : 35;

  const days: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

/* ------------------------------------------------------------------ */
/*  Block-to-day mapping                                               */
/* ------------------------------------------------------------------ */

interface DayBlock {
  block: ResourceBlock;
  isFirstInWeek: boolean;
}

function getBlocksForDay(
  day: Date,
  blocks: ResourceBlock[],
  weekStartDay: Date,
): DayBlock[] {
  const dayStart = startOfDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const results: DayBlock[] = [];
  for (const block of blocks) {
    const bStart = startOfDay(block.blockStart);
    const bEnd = startOfDay(block.blockEnd);
    if (bStart <= dayEnd && bEnd >= dayStart) {
      const isFirstInWeek =
        isSameDay(dayStart, bStart) || isSameDay(dayStart, weekStartDay);
      results.push({ block, isFirstInWeek });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Status labels                                                      */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
  maintenance: 'Maintenance',
};

/* ------------------------------------------------------------------ */
/*  Tooltip                                                            */
/* ------------------------------------------------------------------ */

interface TooltipState {
  block: ResourceBlock;
  x: number;
  y: number;
}

function CalendarTooltip({ block, x, y }: TooltipState) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let left = x;
    let top = y - rect.height - 8;
    if (top < 4) top = y + 20;
    if (left + rect.width > window.innerWidth - 8) {
      left = window.innerWidth - rect.width - 8;
    }
    setPos({ left, top });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="resource-calendar__tooltip"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="resource-calendar__tooltip-label">{block.label}</div>
      {block.sublabel && (
        <div className="resource-calendar__tooltip-sublabel">{block.sublabel}</div>
      )}
      <div className="resource-calendar__tooltip-meta">
        {formatDate(block.blockStart)} — {formatDate(block.blockEnd)}
      </div>
      <div className="resource-calendar__tooltip-status">{STATUS_LABELS[block.status] || block.status}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Max visible blocks per day                                         */
/* ------------------------------------------------------------------ */

const MAX_VISIBLE = 3;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ResourceCalendar({
  resources,
  blocks,
  onBlockClick,
}: ResourceCalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  /* Navigation */
  const goToday = useCallback(() => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  }, []);

  const goPrev = useCallback(() => {
    setCurrentMonth((m) => {
      if (m === 0) {
        setCurrentYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goNext = useCallback(() => {
    setCurrentMonth((m) => {
      if (m === 11) {
        setCurrentYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  /* Grid days */
  const gridDays = useMemo(
    () => getMonthGrid(currentYear, currentMonth),
    [currentYear, currentMonth],
  );

  /* Week rows */
  const weekRows = useMemo(() => {
    const rows: Date[][] = [];
    for (let i = 0; i < gridDays.length; i += 7) {
      rows.push(gridDays.slice(i, i + 7));
    }
    return rows;
  }, [gridDays]);

  /* Block lookup per day key */
  const dayBlocksMap = useMemo(() => {
    const map = new Map<string, DayBlock[]>();
    for (const week of weekRows) {
      const weekStart = week[0];
      for (const day of week) {
        const key = day.toISOString().slice(0, 10);
        map.set(key, getBlocksForDay(day, blocks, weekStart));
      }
    }
    return map;
  }, [blocks, weekRows]);

  /* Legend items */
  const legendItems = useMemo(() => {
    const colorToLabels = new Map<string, Set<string>>();
    const resourceById = new Map(resources.map(r => [r.id, r]));

    for (const block of blocks) {
      const resource = resourceById.get(block.resourceId);
      const label = resource?.name || block.label.split(' — ')[0];
      const labels = colorToLabels.get(block.color) || new Set();
      labels.add(label);
      colorToLabels.set(block.color, labels);
    }

    return Array.from(colorToLabels.entries()).map(([color, labels]) => {
      const arr = Array.from(labels);
      return {
        color,
        label: arr.length <= 3 ? arr.join(', ') : `${arr[0]} +${arr.length - 1} more`,
      };
    });
  }, [blocks, resources]);

  /* Handlers */
  const handleBlockMouseEnter = useCallback(
    (e: React.MouseEvent, block: ResourceBlock) => {
      setTooltip({ block, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleBlockMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleBlockClick = useCallback(
    (block: ResourceBlock) => {
      onBlockClick?.(block);
    },
    [onBlockClick],
  );

  const handleBlockKeyDown = useCallback(
    (e: React.KeyboardEvent, block: ResourceBlock) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onBlockClick?.(block);
      }
    },
    [onBlockClick],
  );

  const toggleExpandDay = useCallback((dayKey: string) => {
    setExpandedDay((prev) => (prev === dayKey ? null : dayKey));
  }, []);

  return (
    <div className="resource-calendar">
      {/* Header / Navigation */}
      <div className="resource-calendar__header">
        <button
          className="resource-calendar__nav-btn"
          onClick={goPrev}
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="resource-calendar__title">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </div>

        <button
          className="resource-calendar__nav-btn"
          onClick={goNext}
          aria-label="Next month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button className="resource-calendar__today-btn" onClick={goToday}>
          Today
        </button>
      </div>

      {/* Legend */}
      {legendItems.length > 0 && (
        <div className="schedule-legend">
          {legendItems.map(item => (
            <div key={item.label} className="schedule-legend__item">
              <div className="schedule-legend__dot" style={{ background: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      )}

      {/* Day-of-week headers */}
      <div className="resource-calendar__day-headers">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="resource-calendar__day-header">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="resource-calendar__grid">
        {blocks.length === 0 && (
          <div className="schedule-empty" style={{ gridColumn: '1 / -1' }}>
            <p className="schedule-empty__title">No items this month</p>
            <p className="schedule-empty__desc">Navigate to a different month or create new items to see them here.</p>
          </div>
        )}
        {gridDays.map((day) => {
          const dayKey = day.toISOString().slice(0, 10);
          const isCurrentMonth = isSameMonth(day, currentMonth, currentYear);
          const isToday = isSameDay(day, today);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const dayBlocks = dayBlocksMap.get(dayKey) || [];
          const isExpanded = expandedDay === dayKey;
          const visibleBlocks = isExpanded
            ? dayBlocks
            : dayBlocks.slice(0, MAX_VISIBLE);
          const overflowCount = dayBlocks.length - MAX_VISIBLE;

          let cellClass = 'resource-calendar__cell';
          if (!isCurrentMonth) cellClass += ' resource-calendar__cell--overflow';
          if (isToday) cellClass += ' resource-calendar__cell--today';
          if (isWeekend) cellClass += ' resource-calendar__cell--weekend';

          return (
            <div key={dayKey} className={cellClass}>
              <div
                className={
                  'resource-calendar__day-number' +
                  (isToday ? ' resource-calendar__day-number--today' : '')
                }
              >
                {day.getDate()}
              </div>
              <div className="resource-calendar__blocks">
                {visibleBlocks.map(({ block, isFirstInWeek }) => {
                  let pillClass = 'resource-calendar__pill';
                  if (block.status === 'completed')
                    pillClass += ' resource-calendar__pill--completed';
                  if (block.isProjected)
                    pillClass += ' resource-calendar__pill--projected';
                  if (!isFirstInWeek)
                    pillClass += ' resource-calendar__pill--continuation';

                  return (
                    <div
                      key={block.id}
                      className={pillClass}
                      style={{
                        backgroundColor: block.color + '26', // ~15% opacity
                        borderLeftColor: block.color,
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${block.label}, ${formatDate(block.blockStart)} to ${formatDate(block.blockEnd)}, ${block.status}`}
                      onClick={() => handleBlockClick(block)}
                      onKeyDown={(e) => handleBlockKeyDown(e, block)}
                      onMouseEnter={(e) => handleBlockMouseEnter(e, block)}
                      onMouseLeave={handleBlockMouseLeave}
                    >
                      {isFirstInWeek && (
                        <span className="resource-calendar__pill-label">
                          {block.label}
                        </span>
                      )}
                    </div>
                  );
                })}
                {!isExpanded && overflowCount > 0 && (
                  <button
                    className="resource-calendar__more-btn"
                    onClick={() => toggleExpandDay(dayKey)}
                    aria-label={`Show ${overflowCount} more blocks`}
                  >
                    +{overflowCount} more
                  </button>
                )}
                {isExpanded && overflowCount > 0 && (
                  <button
                    className="resource-calendar__more-btn"
                    onClick={() => toggleExpandDay(dayKey)}
                    aria-label="Show fewer blocks"
                  >
                    show less
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <CalendarTooltip
          block={tooltip.block}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}
    </div>
  );
}
