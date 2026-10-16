// Cohort sorting: group plants by the traits that decide where they should
// sit in a room — feed program (irrigation zoning), flower length (a bench
// that finishes together) and stretch (even canopy under the lights).

import type { CellScore } from './hotspots';
import { RISK_THRESHOLDS, cellKey } from './hotspots';

export type StretchTrait = 'low' | 'medium' | 'high';

export interface CohortPlantInput {
  id: string;
  label: string;
  strainName: string;
  feedProfile: string | null;
  floweringDays: number | null;
  stretchTrait: StretchTrait | null;
}

export type CohortSortKey = 'feed' | 'flower' | 'stretch';

export const DEFAULT_COHORT_ORDER: readonly CohortSortKey[] = ['feed', 'flower', 'stretch'];

const STRETCH_RANK: Record<StretchTrait, number> = { low: 0, medium: 1, high: 2 };

export const cohortKey = (p: CohortPlantInput): string =>
  `${p.feedProfile ?? '?'}|${p.floweringDays ?? '?'}|${p.stretchTrait ?? '?'}`;

/** Compare two plants trait by trait. Unknown values sort last within each trait. */
export function comparePlantsByTraits(
  a: CohortPlantInput,
  b: CohortPlantInput,
  order: readonly CohortSortKey[] = DEFAULT_COHORT_ORDER,
): number {
  for (const key of order) {
    let cmp = 0;
    if (key === 'feed') cmp = compareNullable(a.feedProfile, b.feedProfile, (x, y) => x.localeCompare(y));
    else if (key === 'flower') cmp = compareNullable(a.floweringDays, b.floweringDays, (x, y) => x - y);
    else cmp = compareNullable(a.stretchTrait, b.stretchTrait, (x, y) => STRETCH_RANK[x] - STRETCH_RANK[y]);
    if (cmp !== 0) return cmp;
  }
  return a.strainName.localeCompare(b.strainName) || a.label.localeCompare(b.label);
}

function compareNullable<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmp(a, b);
}

export interface Cohort {
  key: string;
  feedProfile: string | null;
  floweringDays: number | null;
  stretchTrait: StretchTrait | null;
  strains: string[];
  plants: CohortPlantInput[];
}

/** Group plants into cohorts sharing all three traits, ordered by `order`. */
export function buildCohorts(
  plants: readonly CohortPlantInput[],
  order: readonly CohortSortKey[] = DEFAULT_COHORT_ORDER,
): Cohort[] {
  const sorted = [...plants].sort((a, b) => comparePlantsByTraits(a, b, order));
  const cohorts: Cohort[] = [];
  let current: Cohort | null = null;
  for (const p of sorted) {
    const key = cohortKey(p);
    if (!current || current.key !== key) {
      current = { key, feedProfile: p.feedProfile, floweringDays: p.floweringDays, stretchTrait: p.stretchTrait, strains: [], plants: [] };
      cohorts.push(current);
    }
    current.plants.push(p);
    if (!current.strains.includes(p.strainName)) current.strains.push(p.strainName);
  }
  return cohorts;
}

/**
 * How much a plant has to lose from a wet, still corner: long flower cycles
 * and tall, dense canopies are the classic bud-rot victims.
 */
export function botrytisSusceptibility(p: Pick<CohortPlantInput, 'floweringDays' | 'stretchTrait'>): number {
  const days = p.floweringDays ?? 56;
  const stretchBonus = p.stretchTrait === 'high' ? 7 : p.stretchTrait === 'medium' ? 3 : 0;
  return days + stretchBonus;
}

export interface Placement {
  plantId: string;
  row: number;
  col: number;
}

export interface ProposeLayoutOptions {
  rows: number;
  cols: number;
  /** Cell risk surface (from scoreHotspots). Cells missing from the list count as risk 0. */
  cells?: readonly CellScore[];
  /** Cells at or above this score are filled last, with the least susceptible plants. Default: medium risk. */
  riskThreshold?: number;
  /** "row:col" keys that are taken by plants not in `plants`. */
  occupied?: ReadonlySet<string>;
  order?: readonly CohortSortKey[];
}

export interface ProposedLayout {
  placements: Placement[];
  /** Plants that did not fit. */
  unplaced: string[];
  /** Hot cells left empty because there was room to do so. */
  avoidedCells: Array<{ row: number; col: number; score: number }>;
  cohorts: Cohort[];
}

/**
 * Lay plants out row-major by cohort so each bench holds one feed program
 * and finishes on one date. Hot cells are skipped while the room has spare
 * capacity; when it doesn't, they receive the shortest-flowering, lowest-stretch
 * plants, which have the least time to rot.
 */
export function proposeLayout(plants: readonly CohortPlantInput[], opts: ProposeLayoutOptions): ProposedLayout {
  const threshold = opts.riskThreshold ?? RISK_THRESHOLDS.medium;
  const order = opts.order ?? DEFAULT_COHORT_ORDER;
  const risk = new Map<string, number>();
  for (const c of opts.cells ?? []) risk.set(cellKey(c.row, c.col), c.score);

  const safe: Array<{ row: number; col: number }> = [];
  const risky: Array<{ row: number; col: number; score: number }> = [];
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const key = cellKey(r, c);
      if (opts.occupied?.has(key)) continue;
      const s = risk.get(key) ?? 0;
      if (s >= threshold) risky.push({ row: r, col: c, score: s });
      else safe.push({ row: r, col: c });
    }
  }
  risky.sort((a, b) => a.score - b.score);

  const cohorts = buildCohorts(plants, order);
  const ordered = cohorts.flatMap(c => c.plants);

  const placements: Placement[] = [];
  const unplaced: string[] = [];
  // Only pull plants into hot cells when there are hot cells to put them in;
  // anything beyond that simply doesn't fit.
  const overflow = Math.min(Math.max(0, ordered.length - safe.length), risky.length);

  let intoSafe = ordered;
  let intoRisky: CohortPlantInput[] = [];
  if (overflow > 0) {
    // Pull the `overflow` least-susceptible plants out, preserving cohort order for the rest.
    const bySusceptibility = [...ordered].sort((a, b) => botrytisSusceptibility(a) - botrytisSusceptibility(b));
    const pulled = new Set(bySusceptibility.slice(0, overflow).map(p => p.id));
    intoSafe = ordered.filter(p => !pulled.has(p.id));
    intoRisky = bySusceptibility.slice(0, overflow);
  }

  intoSafe.forEach((p, i) => {
    const cell = safe[i];
    if (cell) placements.push({ plantId: p.id, row: cell.row, col: cell.col });
    else unplaced.push(p.id);
  });
  intoRisky.forEach((p, i) => {
    const cell = risky[i];
    if (cell) placements.push({ plantId: p.id, row: cell.row, col: cell.col });
    else unplaced.push(p.id);
  });

  const usedRisky = Math.min(intoRisky.length, risky.length);
  const avoidedCells = risky.slice(usedRisky);

  return { placements, unplaced, avoidedCells, cohorts };
}
