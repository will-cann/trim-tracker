// Hot-spot scoring: turns the plant_health_events log into a per-cell risk
// surface for a room grid. Pure function — the server runs it for the map
// endpoint and the client can re-run it when the user changes filters.

import { SPREADING_CONTAMINANTS } from './health';

export interface HotspotEventInput {
  row: number | null;
  col: number | null;
  contaminant: string;
  /** 1–5 */
  severity: number;
  observedAt: string | number | Date;
  status: 'active' | 'resolved';
}

export interface HotspotOptions {
  rows: number;
  cols: number;
  /** Reference time in ms. Defaults to Date.now(). */
  now?: number;
  /** Days for a resolved event's weight to halve. Default 45. */
  halfLifeDays?: number;
  /** Only count these contaminants. Default: every spreading contaminant. */
  contaminants?: readonly string[] | null;
  /** Fraction of a cell's own weight that bleeds into orthogonal neighbours. Default 0.35. */
  neighborSpread?: number;
  /** Only count events observed within the last N days. Default: all. */
  windowDays?: number | null;
}

export interface CellScore {
  row: number;
  col: number;
  /** 0–1 risk after neighbour bleed; drives the heat colour. */
  score: number;
  /** Unbounded weighted sum before squashing. */
  raw: number;
  /** Events observed in this exact cell (after filters). */
  events: number;
  activeEvents: number;
  lastObservedAt: string | null;
  /** Event count per contaminant key in this cell. */
  contaminants: Record<string, number>;
}

export interface HotspotResult {
  cells: CellScore[];
  /** Events counted (passed the filters), including ones without a position. */
  eventsCounted: number;
  /** Events that passed the filters but had no grid position. */
  unplacedEvents: number;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export const RISK_THRESHOLDS = { low: 0.15, medium: 0.4, high: 0.6 } as const;

export function riskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.medium) return 'medium';
  if (score >= RISK_THRESHOLDS.low) return 'low';
  return 'none';
}

export const cellKey = (row: number, col: number): string => `${row}:${col}`;

const MS_PER_DAY = 86_400_000;

/** Weight of one event: severity scaled by recency. Active events never decay below 0.6× their severity weight. */
export function eventWeight(e: HotspotEventInput, now: number, halfLifeDays: number): number {
  const sev = Math.min(5, Math.max(1, e.severity)) / 5;
  const t = toMs(e.observedAt);
  const ageDays = Number.isFinite(t) ? Math.max(0, (now - t) / MS_PER_DAY) : 0;
  const decay = Math.pow(0.5, ageDays / halfLifeDays);
  const floor = e.status === 'active' ? 0.6 : 0;
  return sev * Math.max(decay, floor);
}

export function scoreHotspots(events: readonly HotspotEventInput[], opts: HotspotOptions): HotspotResult {
  const now = opts.now ?? Date.now();
  const halfLife = opts.halfLifeDays ?? 45;
  const spread = opts.neighborSpread ?? 0.35;
  const allowed = new Set(opts.contaminants && opts.contaminants.length ? opts.contaminants : SPREADING_CONTAMINANTS);
  const windowMs = opts.windowDays ? opts.windowDays * MS_PER_DAY : null;

  const own = new Map<string, CellScore>();
  let counted = 0;
  let unplaced = 0;

  for (const e of events) {
    if (!allowed.has(e.contaminant)) continue;
    if (windowMs != null) {
      const t = toMs(e.observedAt);
      if (Number.isFinite(t) && now - t > windowMs) continue;
    }
    counted++;
    if (e.row == null || e.col == null || e.row < 0 || e.col < 0 || e.row >= opts.rows || e.col >= opts.cols) {
      unplaced++;
      continue;
    }
    const key = cellKey(e.row, e.col);
    let cell = own.get(key);
    if (!cell) {
      cell = { row: e.row, col: e.col, score: 0, raw: 0, events: 0, activeEvents: 0, lastObservedAt: null, contaminants: {} };
      own.set(key, cell);
    }
    cell.raw += eventWeight(e, now, halfLife);
    cell.events++;
    if (e.status === 'active') cell.activeEvents++;
    cell.contaminants[e.contaminant] = (cell.contaminants[e.contaminant] ?? 0) + 1;
    const iso = toIso(e.observedAt);
    if (iso && (!cell.lastObservedAt || iso > cell.lastObservedAt)) cell.lastObservedAt = iso;
  }

  // Neighbour bleed: orthogonal neighbours get `spread`, diagonals half that.
  const cells: CellScore[] = [];
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const self = own.get(cellKey(r, c));
      let raw = self?.raw ?? 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const n = own.get(cellKey(r + dr, c + dc));
          if (!n) continue;
          const factor = dr !== 0 && dc !== 0 ? spread / 2 : spread;
          raw += n.raw * factor;
        }
      }
      cells.push({
        row: r,
        col: c,
        raw,
        score: raw > 0 ? 1 - Math.exp(-raw) : 0,
        events: self?.events ?? 0,
        activeEvents: self?.activeEvents ?? 0,
        lastObservedAt: self?.lastObservedAt ?? null,
        contaminants: self?.contaminants ?? {},
      });
    }
  }

  return { cells, eventsCounted: counted, unplacedEvents: unplaced };
}

/** Index cells by "row:col" for O(1) lookups. */
export function indexCells(cells: readonly CellScore[]): Map<string, CellScore> {
  const m = new Map<string, CellScore>();
  for (const c of cells) m.set(cellKey(c.row, c.col), c);
  return m;
}

function toMs(v: string | number | Date): number {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  return Date.parse(v);
}

function toIso(v: string | number | Date): string | null {
  const t = toMs(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
