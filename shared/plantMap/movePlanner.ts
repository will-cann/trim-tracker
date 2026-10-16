// Proactive movement planner: reads a room's grid, its hot-spot surface and
// each plant's active issues, and proposes what to move, isolate, cull or
// just watch — before the wet corner takes the whole bench.

import type { CellScore } from './hotspots';
import { RISK_THRESHOLDS, cellKey, indexCells } from './hotspots';
import type { StretchTrait } from './cohorts';
import { botrytisSusceptibility } from './cohorts';
import { CONTAMINANT_MAP } from './health';

export interface PlannerIssue {
  contaminant: string;
  severity: number;
}

export interface PlannerPlant {
  id: string;
  label: string;
  strainName: string;
  row: number | null;
  col: number | null;
  growthPhase: string;
  floweringDate: string | null;
  floweringDays: number | null;
  stretchTrait: StretchTrait | null;
  feedProfile: string | null;
  /** Active (unresolved) issues on this plant. */
  activeIssues: PlannerIssue[];
}

export interface PlannerRoom {
  id: string;
  name: string;
  rows: number;
  cols: number;
  plants: PlannerPlant[];
  /** Risk surface from scoreHotspots over the spreading contaminants. */
  cells: CellScore[];
}

export interface CellRef {
  roomId: string;
  roomName: string;
  row: number;
  col: number;
}

export type SuggestionKind = 'cull' | 'isolate' | 'relocate' | 'inspect';
export type SuggestionPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface MoveSuggestion {
  kind: SuggestionKind;
  priority: SuggestionPriority;
  plantId: string;
  plantLabel: string;
  strainName: string;
  from: CellRef | null;
  to: CellRef | null;
  reason: string;
  /** 0–1 exposure that triggered the suggestion. */
  exposure: number;
}

export interface MovePlan {
  roomId: string;
  suggestions: MoveSuggestion[];
  /** Empty hot cells: don't fill these at the next flip. */
  avoidCells: Array<{ row: number; col: number; score: number }>;
  summary: {
    plantsWithActiveSpread: number;
    plantsAtRisk: number;
    emptySafeCells: number;
    emptyHotCells: number;
  };
}

export interface PlanMovesOptions {
  now?: number;
  /** Exposure at or above this triggers a relocate/inspect. Default: medium risk. */
  riskThreshold?: number;
  /** Severity at or above which an actively rotting plant is culled rather than moved. Default 4. */
  cullSeverity?: number;
  /** Other rooms whose empty cells may receive relocated plants (same phase). */
  otherRooms?: PlannerRoom[];
  /** Bud rot risk climbs from this flowering week on. Default 5. */
  lateFlowerWeek?: number;
}

const MS_PER_DAY = 86_400_000;
const ADJACENT_ACTIVE_EXPOSURE = 0.5;

export function floweringWeek(floweringDate: string | null, now: number): number | null {
  if (!floweringDate) return null;
  const t = Date.parse(floweringDate);
  if (!Number.isFinite(t)) return null;
  return Math.max(1, Math.floor((now - t) / MS_PER_DAY / 7) + 1);
}

function spreadingIssues(p: PlannerPlant): PlannerIssue[] {
  return p.activeIssues.filter(i => CONTAMINANT_MAP[i.contaminant]?.spreads);
}

function issueLabel(key: string): string {
  return CONTAMINANT_MAP[key]?.label ?? key;
}

interface EmptyCell {
  roomId: string;
  roomName: string;
  row: number;
  col: number;
  score: number;
  /** Distance (cells) to the nearest plant carrying an active spreading issue. */
  distToActive: number;
}

function emptyCells(room: PlannerRoom, activePositions: Array<{ row: number; col: number }>): EmptyCell[] {
  const occupied = new Set<string>();
  for (const p of room.plants) {
    if (p.row != null && p.col != null) occupied.add(cellKey(p.row, p.col));
  }
  const byKey = indexCells(room.cells);
  const out: EmptyCell[] = [];
  for (let r = 0; r < room.rows; r++) {
    for (let c = 0; c < room.cols; c++) {
      const key = cellKey(r, c);
      if (occupied.has(key)) continue;
      let dist = Infinity;
      for (const a of activePositions) {
        dist = Math.min(dist, Math.max(Math.abs(a.row - r), Math.abs(a.col - c)));
      }
      out.push({ roomId: room.id, roomName: room.name, row: r, col: c, score: byKey.get(key)?.score ?? 0, distToActive: dist });
    }
  }
  return out;
}

export function planMoves(room: PlannerRoom, opts: PlanMovesOptions = {}): MovePlan {
  const now = opts.now ?? Date.now();
  const threshold = opts.riskThreshold ?? RISK_THRESHOLDS.medium;
  const cullSeverity = opts.cullSeverity ?? 4;
  const lateWeek = opts.lateFlowerWeek ?? 5;
  const cellsByKey = indexCells(room.cells);

  const placed = room.plants.filter(p => p.row != null && p.col != null) as Array<PlannerPlant & { row: number; col: number }>;
  const activeCarriers = placed.filter(p => spreadingIssues(p).length > 0);
  const activePositions = activeCarriers.map(p => ({ row: p.row, col: p.col }));

  // Destination pool: this room first, then other rooms. Cells are claimed as they're assigned.
  const pool: EmptyCell[] = [
    ...emptyCells(room, activePositions),
    ...(opts.otherRooms ?? []).flatMap(r => emptyCells(r, r.plants
      .filter(p => p.row != null && p.col != null && spreadingIssues(p).length > 0)
      .map(p => ({ row: p.row as number, col: p.col as number })))),
  ];
  const claimed = new Set<string>();
  const claim = (c: EmptyCell) => claimed.add(`${c.roomId}:${c.row}:${c.col}`);
  const free = (c: EmptyCell) => !claimed.has(`${c.roomId}:${c.row}:${c.col}`);
  const inThisRoom = (c: EmptyCell) => c.roomId === room.id;

  const suggestions: MoveSuggestion[] = [];
  const ref = (p: { row: number; col: number }): CellRef => ({ roomId: room.id, roomName: room.name, row: p.row, col: p.col });
  const toRef = (c: EmptyCell): CellRef => ({ roomId: c.roomId, roomName: c.roomName, row: c.row, col: c.col });

  // 1. Plants that are actively spreading something: cull or isolate.
  for (const p of activeCarriers) {
    const issues = spreadingIssues(p);
    const worst = issues.reduce((m, i) => (i.severity > m.severity ? i : m), issues[0]);
    const fungal = CONTAMINANT_MAP[worst.contaminant]?.category === 'fungus';
    if (fungal && worst.severity >= cullSeverity) {
      suggestions.push({
        kind: 'cull',
        priority: 'urgent',
        plantId: p.id,
        plantLabel: p.label,
        strainName: p.strainName,
        from: ref(p),
        to: null,
        reason: `${issueLabel(worst.contaminant)} at severity ${worst.severity}/5 keeps sporulating onto its neighbours. Bag it in place and remove it from the room.`,
        exposure: 1,
      });
      continue;
    }
    // Isolate: farthest free cell from other carriers, lowest risk, prefer another room if it has space.
    const candidates = pool.filter(free).filter(c => !(inThisRoom(c) && c.distToActive <= 1));
    candidates.sort((a, b) =>
      (inThisRoom(a) ? 1 : 0) - (inThisRoom(b) ? 1 : 0)
      || b.distToActive - a.distToActive
      || a.score - b.score);
    const dest = candidates[0] ?? null;
    if (dest) claim(dest);
    suggestions.push({
      kind: 'isolate',
      priority: fungal ? 'urgent' : 'high',
      plantId: p.id,
      plantLabel: p.label,
      strainName: p.strainName,
      from: ref(p),
      to: dest ? toRef(dest) : null,
      reason: dest
        ? `Active ${issueLabel(worst.contaminant)} (severity ${worst.severity}/5). Move it away from the bench${dest.roomId !== room.id ? ` into ${dest.roomName}` : ''} so it stops seeding the plants around it.`
        : `Active ${issueLabel(worst.contaminant)} (severity ${worst.severity}/5) and no free cell to isolate into. Treat in place and keep neighbours under daily inspection.`,
      exposure: 1,
    });
  }

  // 2. Healthy plants sitting in the blast radius.
  let plantsAtRisk = 0;
  for (const p of placed) {
    if (spreadingIssues(p).length > 0) continue;
    const cellRisk = cellsByKey.get(cellKey(p.row, p.col))?.score ?? 0;
    const adjacentCarriers = activeCarriers.filter(a => a.id !== p.id && Math.max(Math.abs(a.row - p.row), Math.abs(a.col - p.col)) <= 1);
    const exposure = Math.min(1, cellRisk + (adjacentCarriers.length > 0 ? ADJACENT_ACTIVE_EXPOSURE : 0));
    if (exposure < threshold) continue;
    plantsAtRisk++;

    const week = floweringWeek(p.floweringDate, now);
    const lateFlower = p.growthPhase === 'flowering' && week != null && week >= lateWeek;
    // A flowering plant on a recurring hot cell will reach late flower in that
    // cell, so it's worth moving now; adjacency-only exposure needs a
    // susceptible plant to justify the move.
    const onHotCell = cellRisk >= threshold && p.growthPhase === 'flowering';
    const susceptible = onHotCell || lateFlower || botrytisSusceptibility(p) >= 63 || p.stretchTrait === 'high';

    const why: string[] = [];
    if (adjacentCarriers.length > 0) {
      why.push(`next to ${adjacentCarriers.map(a => a.label).join(', ')} (active ${[...new Set(adjacentCarriers.flatMap(a => spreadingIssues(a).map(i => issueLabel(i.contaminant))))].join(', ')})`);
    }
    if (cellRisk >= threshold) why.push(`this cell is a recurring hot spot (risk ${Math.round(cellRisk * 100)}%)`);
    if (lateFlower) why.push(`week ${week} of flower, when bud rot sets in`);
    else if (p.stretchTrait === 'high') why.push('high-stretch strain with a dense canopy');
    else if ((p.floweringDays ?? 0) >= 63) why.push(`${p.floweringDays}-day flower cycle`);

    if (susceptible) {
      const candidates = pool.filter(free).filter(c => c.score < threshold && c.distToActive > 1);
      candidates.sort((a, b) =>
        (inThisRoom(a) ? 0 : 1) - (inThisRoom(b) ? 0 : 1)
        || a.score - b.score
        || b.distToActive - a.distToActive
        || (inThisRoom(a) && inThisRoom(b) ? cellDistance(p, a) - cellDistance(p, b) : 0));
      const dest = candidates[0] ?? null;
      if (dest) {
        claim(dest);
        suggestions.push({
          kind: 'relocate',
          priority: adjacentCarriers.length > 0 ? 'high' : 'medium',
          plantId: p.id,
          plantLabel: p.label,
          strainName: p.strainName,
          from: ref(p),
          to: toRef(dest),
          reason: `${capitalize(why.join('; '))}. Move it to a dry cell${dest.roomId !== room.id ? ` in ${dest.roomName}` : ''} before it goes.`,
          exposure,
        });
        continue;
      }
    }
    suggestions.push({
      kind: 'inspect',
      priority: adjacentCarriers.length > 0 ? 'high' : susceptible ? 'medium' : 'low',
      plantId: p.id,
      plantLabel: p.label,
      strainName: p.strainName,
      from: ref(p),
      to: null,
      reason: `${capitalize(why.join('; '))}. ${susceptible ? 'No dry cell is free, so' : 'Low susceptibility, so'} inspect daily, strip fan leaves around the colas and point airflow at it.`,
      exposure,
    });
  }

  // 3. Empty hot cells to keep empty at the next flip.
  const avoidCells = pool
    .filter(c => inThisRoom(c) && free(c) && c.score >= threshold)
    .map(c => ({ row: c.row, col: c.col, score: c.score }))
    .sort((a, b) => b.score - a.score);
  const emptyHere = pool.filter(inThisRoom);

  const rank: Record<SuggestionPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  suggestions.sort((a, b) => rank[a.priority] - rank[b.priority] || b.exposure - a.exposure || a.plantLabel.localeCompare(b.plantLabel));

  return {
    roomId: room.id,
    suggestions,
    avoidCells,
    summary: {
      plantsWithActiveSpread: activeCarriers.length,
      plantsAtRisk,
      emptySafeCells: emptyHere.filter(c => c.score < threshold).length,
      emptyHotCells: emptyHere.filter(c => c.score >= threshold).length,
    },
  };
}

function cellDistance(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
