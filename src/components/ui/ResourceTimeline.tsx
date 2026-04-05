import { useState, useMemo, useCallback, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Resource {
  id: string;
  name: string;
  group: string;
}

export interface ResourceBlock {
  id: string;
  resourceId: string;
  blockStart: Date;
  blockEnd: Date;
  label: string;
  sublabel?: string;
  status: 'planned' | 'active' | 'completed' | 'maintenance';
  color: string;
  isProjected?: boolean;
  linkTo?: { view: string; id: string };
}

export interface ResourceTimelineProps {
  resources: Resource[];
  blocks: ResourceBlock[];
  view?: 'day' | 'week' | 'month';
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

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function getMondayOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  return out;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatHourHeader(hour: number): string {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}

function formatDayHeader(d: Date): string {
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()}`;
}

function formatWeekHeader(start: Date): string {
  const end = addDays(start, 6);
  const m1 = SHORT_MONTHS[start.getMonth()];
  const m2 = SHORT_MONTHS[end.getMonth()];
  if (m1 === m2) {
    return `${m1} ${start.getDate()}\u2013${end.getDate()}`;
  }
  return `${m1} ${start.getDate()}\u2013${m2} ${end.getDate()}`;
}

function formatDateShort(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/* ------------------------------------------------------------------ */
/*  Visible range                                                      */
/* ------------------------------------------------------------------ */

interface VisibleRange {
  start: Date;
  end: Date;
  columns: Date[];  // start date of each column
  columnCount: number;
}

function getVisibleRange(anchorDate: Date, view: 'day' | 'week' | 'month'): VisibleRange {
  if (view === 'day') {
    const dayStart = startOfDay(anchorDate);
    const columns: Date[] = [];
    for (let h = 0; h < 24; h++) {
      const col = new Date(dayStart);
      col.setHours(h);
      columns.push(col);
    }
    return { start: dayStart, end: addDays(dayStart, 1), columns, columnCount: 24 };
  }
  const monday = getMondayOfWeek(anchorDate);
  if (view === 'week') {
    const columns: Date[] = [];
    for (let i = 0; i < 14; i++) {
      columns.push(addDays(monday, i));
    }
    return { start: monday, end: addDays(monday, 14), columns, columnCount: 14 };
  }
  // month: 4 week columns
  const columns: Date[] = [];
  for (let i = 0; i < 4; i++) {
    columns.push(addDays(monday, i * 7));
  }
  return { start: monday, end: addDays(monday, 28), columns, columnCount: 4 };
}

/* ------------------------------------------------------------------ */
/*  Block positioning                                                  */
/* ------------------------------------------------------------------ */

interface BlockPosition {
  left: string;
  width: string;
}

function getBlockPosition(
  block: ResourceBlock,
  rangeStart: Date,
  rangeEnd: Date,
): BlockPosition | null {
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
  if (rangeMs <= 0) return null;

  const blockStartMs = Math.max(block.blockStart.getTime(), rangeStart.getTime());
  const blockEndMs = Math.min(block.blockEnd.getTime(), rangeEnd.getTime());
  if (blockEndMs <= blockStartMs) return null;

  const leftPct = ((blockStartMs - rangeStart.getTime()) / rangeMs) * 100;
  const widthPct = ((blockEndMs - blockStartMs) / rangeMs) * 100;

  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 0.5)}%`, // min width so tiny blocks are visible
  };
}

/* ------------------------------------------------------------------ */
/*  Today marker position                                              */
/* ------------------------------------------------------------------ */

function getTodayPosition(rangeStart: Date, rangeEnd: Date): string | null {
  const now = new Date();
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
  const pct = ((now.getTime() - rangeStart.getTime()) / rangeMs) * 100;
  if (pct < 0 || pct > 100) return null;
  return `${pct}%`;
}

/* ------------------------------------------------------------------ */
/*  Overlap stacking                                                   */
/* ------------------------------------------------------------------ */

interface PositionedBlock {
  block: ResourceBlock;
  position: BlockPosition;
  lane: number;
}

function computeLanes(blocks: PositionedBlock[]): number {
  if (blocks.length === 0) return 1;

  // Sort by start position (parse percentage)
  const sorted = [...blocks].sort(
    (a, b) => parseFloat(a.position.left) - parseFloat(b.position.left),
  );

  // Greedy lane assignment
  const laneEnds: number[] = [];
  for (const pb of sorted) {
    const start = parseFloat(pb.position.left);
    let placed = false;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= start) {
        pb.lane = i;
        laneEnds[i] = start + parseFloat(pb.position.width);
        placed = true;
        break;
      }
    }
    if (!placed) {
      pb.lane = laneEnds.length;
      laneEnds.push(start + parseFloat(pb.position.width));
    }
  }

  return Math.max(laneEnds.length, 1);
}

/* ------------------------------------------------------------------ */
/*  Tooltip                                                            */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<ResourceBlock['status'], string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
  maintenance: 'Maintenance',
};

interface TooltipData {
  block: ResourceBlock;
  x: number;
  y: number;
}

function Tooltip({ data }: { data: TooltipData }) {
  const { block, x, y } = data;
  return (
    <div
      className="resource-timeline__tooltip"
      style={{ left: x, top: y }}
      role="tooltip"
    >
      <div className="resource-timeline__tooltip-label">{block.label}</div>
      {block.sublabel && (
        <div className="resource-timeline__tooltip-sublabel">{block.sublabel}</div>
      )}
      <div className="resource-timeline__tooltip-meta">
        {formatDateShort(block.blockStart)} &ndash; {formatDateShort(block.blockEnd)}
      </div>
      <div className="resource-timeline__tooltip-status">
        {STATUS_LABELS[block.status]}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chevron icons (inline SVG)                                         */
/* ------------------------------------------------------------------ */

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ResourceTimeline({
  resources,
  blocks,
  view: viewProp,
  onBlockClick,
}: ResourceTimelineProps) {
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(viewProp ?? 'week');
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => getVisibleRange(anchor, viewMode), [anchor, viewMode]);
  const today = useMemo(() => startOfDay(new Date()), []);

  // Group resources
  const grouped = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const r of resources) {
      const list = map.get(r.group) ?? [];
      list.push(r);
      map.set(r.group, list);
    }
    return map;
  }, [resources]);

  // Build positioned blocks per resource
  const positionedByResource = useMemo(() => {
    const result = new Map<string, { positioned: PositionedBlock[]; laneCount: number }>();

    for (const r of resources) {
      const rblocks = blocks.filter((b) => b.resourceId === r.id);
      const positioned: PositionedBlock[] = [];
      for (const b of rblocks) {
        const pos = getBlockPosition(b, range.start, range.end);
        if (pos) positioned.push({ block: b, position: pos, lane: 0 });
      }
      const laneCount = computeLanes(positioned);
      result.set(r.id, { positioned, laneCount });
    }
    return result;
  }, [resources, blocks, range]);

  // Today marker
  const todayLeft = useMemo(() => getTodayPosition(range.start, range.end), [range]);

  // Navigation
  const step = viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : 28;

  const goBack = useCallback(() => {
    setAnchor((prev) => addDays(prev, -step));
  }, [step]);

  const goForward = useCallback(() => {
    setAnchor((prev) => addDays(prev, step));
  }, [step]);

  const goToday = useCallback(() => {
    setAnchor(startOfDay(new Date()));
  }, []);

  const switchView = useCallback((v: 'day' | 'week' | 'month') => {
    setViewMode(v);
  }, []);

  // Tooltip handlers
  const handleBlockMouseEnter = useCallback(
    (e: React.MouseEvent, block: ResourceBlock) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        block,
        x: e.clientX - rect.left + 8,
        y: e.clientY - rect.top - 40,
      });
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

  // Legend items
  const legendItems = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of blocks) {
      if (!seen.has(b.label.split(' — ')[0])) {
        seen.set(b.label.split(' — ')[0], b.color);
      }
    }
    // Dedupe by color — group items with same color
    const byColor = new Map<string, string[]>();
    for (const [label, color] of seen) {
      const existing = byColor.get(color) || [];
      existing.push(label);
      byColor.set(color, existing);
    }
    return Array.from(byColor.entries()).map(([color, labels]) => ({
      color,
      label: labels.length <= 2 ? labels.join(', ') : `${labels[0]} +${labels.length - 1}`,
    }));
  }, [blocks]);

  // Check for visible blocks in current range
  const hasVisibleBlocks = useMemo(() => {
    for (const [, data] of positionedByResource) {
      if (data.positioned.length > 0) return true;
    }
    return false;
  }, [positionedByResource]);

  // Build ordered rows (group headers + resource rows)
  const rows = useMemo(() => {
    const result: Array<
      | { type: 'group'; group: string }
      | { type: 'resource'; resource: Resource; laneCount: number }
    > = [];
    for (const [group, list] of grouped) {
      result.push({ type: 'group', group });
      for (const r of list) {
        const data = positionedByResource.get(r.id);
        result.push({ type: 'resource', resource: r, laneCount: data?.laneCount ?? 1 });
      }
    }
    return result;
  }, [grouped, positionedByResource]);

  const LANE_HEIGHT = 28; // 24px block + 4px gap
  const ROW_PADDING = 4;

  return (
    <div className="resource-timeline" ref={containerRef}>
      {/* Toolbar */}
      <div className="resource-timeline__toolbar">
        <div className="resource-timeline__nav">
          <button
            className="resource-timeline__nav-btn"
            onClick={goBack}
            aria-label="Previous period"
          >
            <ChevronLeft />
          </button>
          <button
            className="resource-timeline__today-btn"
            onClick={goToday}
          >
            Today
          </button>
          <button
            className="resource-timeline__nav-btn"
            onClick={goForward}
            aria-label="Next period"
          >
            <ChevronRight />
          </button>
        </div>
        <div className="resource-timeline__view-toggle">
          <button
            className={`resource-timeline__view-pill ${viewMode === 'day' ? 'resource-timeline__view-pill--active' : ''}`}
            onClick={() => switchView('day')}
          >
            Day
          </button>
          <button
            className={`resource-timeline__view-pill ${viewMode === 'week' ? 'resource-timeline__view-pill--active' : ''}`}
            onClick={() => switchView('week')}
          >
            Week
          </button>
          <button
            className={`resource-timeline__view-pill ${viewMode === 'month' ? 'resource-timeline__view-pill--active' : ''}`}
            onClick={() => switchView('month')}
          >
            Month
          </button>
        </div>
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

      {/* Chart */}
      <div className="resource-timeline__chart">
        {/* Left labels */}
        <div className="resource-timeline__labels">
          {/* Header spacer */}
          <div className="resource-timeline__labels-header" />
          {rows.map((row, i) => {
            if (row.type === 'group') {
              return (
                <div key={`g-${row.group}`} className="resource-timeline__group-header">
                  {row.group}
                </div>
              );
            }
            const height = row.laneCount * LANE_HEIGHT + ROW_PADDING * 2;
            return (
              <div
                key={row.resource.id}
                className={`resource-timeline__label-row ${i % 2 === 0 ? 'resource-timeline__label-row--alt' : ''}`}
                style={{ height }}
              >
                {row.resource.name}
              </div>
            );
          })}
        </div>

        {/* Time area (scrollable) */}
        <div className="resource-timeline__time-area">
          {/* Column headers */}
          <div
            className="resource-timeline__column-headers"
            style={{
              gridTemplateColumns: `repeat(${range.columnCount}, 1fr)`,
            }}
          >
            {viewMode === 'day' && (
              <div className="resource-timeline__day-label">
                {SHORT_DAYS[range.start.getDay()]} {SHORT_MONTHS[range.start.getMonth()]} {range.start.getDate()}
              </div>
            )}
            {range.columns.map((col) => {
              const isToday = viewMode === 'week' && isSameDay(col, today);
              const weekend = viewMode === 'week' && isWeekend(col);
              const isNowHour = viewMode === 'day' && isSameDay(col, today) && col.getHours() === new Date().getHours();
              const classes = [
                'resource-timeline__col-header',
                isToday ? 'resource-timeline__col-header--today' : '',
                weekend ? 'resource-timeline__col-header--weekend' : '',
                isNowHour ? 'resource-timeline__col-header--today' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={col.toISOString()} className={classes}>
                  {viewMode === 'day' ? formatHourHeader(col.getHours()) : viewMode === 'week' ? formatDayHeader(col) : formatWeekHeader(col)}
                </div>
              );
            })}
          </div>

          {/* Empty state */}
          {!hasVisibleBlocks && (
            <div className="schedule-empty">
              <p className="schedule-empty__title">No items in this period</p>
              <p className="schedule-empty__desc">Navigate forward or back to find scheduled items.</p>
            </div>
          )}

          {/* Rows with blocks */}
          {rows.map((row, i) => {
            if (row.type === 'group') {
              return (
                <div
                  key={`tg-${row.group}`}
                  className="resource-timeline__time-group-spacer"
                />
              );
            }

            const data = positionedByResource.get(row.resource.id);
            const laneCount = data?.laneCount ?? 1;
            const positioned = data?.positioned ?? [];
            const height = laneCount * LANE_HEIGHT + ROW_PADDING * 2;

            return (
              <div
                key={`tr-${row.resource.id}`}
                className={`resource-timeline__time-row ${i % 2 === 0 ? 'resource-timeline__time-row--alt' : ''}`}
                style={{ height, position: 'relative' }}
              >
                {/* Grid lines */}
                <div
                  className="resource-timeline__grid-lines"
                  style={{
                    gridTemplateColumns: `repeat(${range.columnCount}, 1fr)`,
                  }}
                >
                  {range.columns.map((col) => {
                    const isToday = viewMode === 'week' && isSameDay(col, today);
                    const isNowHour = viewMode === 'day' && isSameDay(col, today) && col.getHours() === new Date().getHours();
                    const weekend = viewMode === 'week' && isWeekend(col);
                    return (
                      <div
                        key={col.toISOString()}
                        className={[
                          'resource-timeline__grid-cell',
                          (isToday || isNowHour) ? 'resource-timeline__grid-cell--today' : '',
                          weekend ? 'resource-timeline__grid-cell--weekend' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      />
                    );
                  })}
                </div>

                {/* Blocks */}
                {positioned.map(({ block, position, lane }) => {
                  const blockClasses = [
                    'resource-timeline__block',
                    `resource-timeline__block--${block.status}`,
                    block.isProjected ? 'resource-timeline__block--projected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div
                      key={block.id}
                      className={blockClasses}
                      style={{
                        left: position.left,
                        width: position.width,
                        top: ROW_PADDING + lane * LANE_HEIGHT,
                        height: LANE_HEIGHT - 4,
                        backgroundColor: `${block.color}26`, // 15% opacity hex
                        borderLeftColor: block.color,
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${block.label}${block.sublabel ? ` — ${block.sublabel}` : ''}, ${formatDateShort(block.blockStart)} to ${formatDateShort(block.blockEnd)}, ${STATUS_LABELS[block.status]}`}
                      onClick={() => handleBlockClick(block)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleBlockClick(block);
                        }
                      }}
                      onMouseEnter={(e) => handleBlockMouseEnter(e, block)}
                      onMouseLeave={handleBlockMouseLeave}
                    >
                      <span className="resource-timeline__block-label">
                        {block.label}
                      </span>
                    </div>
                  );
                })}

                {/* Today marker */}
                {todayLeft && (
                  <div
                    className="resource-timeline__today-line"
                    style={{ left: todayLeft }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
}
