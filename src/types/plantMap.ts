// ============================================================================
// PLANT MAP MODULE TYPES
// ============================================================================
// The contaminant catalog, health scoring, hot-spot scoring, cohort sorting
// and move planner are dependency-free and live in shared/plantMap so the
// Netlify functions run the same code. They're re-exported here so existing
// imports keep working.

import type { StretchTrait } from '../../shared/plantMap/cohorts';
import type { CellScore } from '../../shared/plantMap/hotspots';
import type { MoveSuggestion, MovePlan } from '../../shared/plantMap/movePlanner';
import { CONTAMINANT_MAP } from '../../shared/plantMap/health';

export type { ContaminantInfo, ContaminantCategory } from '../../shared/plantMap/health';
export {
  CONTAMINANT_MAP,
  CONTAMINANT_KEYS,
  SPREADING_CONTAMINANTS,
  SEVERITY_LABELS,
  computeHealthFromIssues,
  normalizeContaminant,
  clampSeverity,
} from '../../shared/plantMap/health';
export type { CellScore, RiskLevel, HotspotEventInput } from '../../shared/plantMap/hotspots';
export { scoreHotspots, riskLevel, cellKey, indexCells, RISK_THRESHOLDS } from '../../shared/plantMap/hotspots';
export type { Cohort, CohortSortKey, CohortPlantInput, Placement, ProposedLayout } from '../../shared/plantMap/cohorts';
export { buildCohorts, comparePlantsByTraits, proposeLayout, DEFAULT_COHORT_ORDER } from '../../shared/plantMap/cohorts';
export type { MoveSuggestion, MovePlan, SuggestionKind, SuggestionPriority, CellRef } from '../../shared/plantMap/movePlanner';
export { floweringWeek, planMoves } from '../../shared/plantMap/movePlanner';
export type { ParsedRoomSheet, SheetTable, SheetScore, SheetGrid } from '../../shared/plantMap/roomSheet';
export { parseRoomWorkbook, ROT_SCORE_SCALE, rotScoreToSeverity, severityToRotScore, rotScoreLabel, defaultObservedAt, SHEET_DATE_TRUST_DAYS } from '../../shared/plantMap/roomSheet';

export type PlantPhase = 'nursery' | 'vegetative' | 'flowering';

export type PhaseTab = {
  key: PlantPhase;
  label: string;
  entity: 'plant_batches' | 'plants';
};

export const PHASE_TABS: PhaseTab[] = [
  { key: 'nursery', label: 'Nursery', entity: 'plant_batches' },
  { key: 'vegetative', label: 'Vegetative', entity: 'plants' },
  { key: 'flowering', label: 'Flowering', entity: 'plants' },
];

// ============================================================================
// API RESPONSE: Plant Map Overview (one entry per room)
// ============================================================================

export type PlantMapData = Record<string, LocationMeta>;

export type LocationMeta = {
  roomId: string;
  totalPlants: number;
  totalStrains: number;
  strains: string[];
  plantHealth: number;
  contaminants: string[];
  phaseDates: string[];
  harvestDates: string[];
  flipDates: string[];
};

// ============================================================================
// API RESPONSE: Per-room strain data (expanded room)
// ============================================================================

export type RoomMapData = Record<string, PlantGroup>;

export type PlantGroup = {
  totalPlants: number;
  plannedCount?: number;
  plantHealth: number;
  plants: string[];
  contamination: string[];
  plantedDate: string;
  phaseDate: string | null;
  harvestDate: string | null;
  flipDate: string | null;
  strain: string;
  type: 'plants' | 'plantbatches';
};

// ============================================================================
// HEALTH SYSTEM
// ============================================================================

export type HealthColor = 'green' | 'yellow' | 'red';

export const getHealthColor = (health: number): HealthColor => {
  if (health === 100) return 'green';
  if (health > 67) return 'yellow';
  return 'red';
};

export const HEALTH_COLOR_MAP: Record<HealthColor, string> = {
  green: '#3BB570',
  yellow: '#F0BF00',
  red: '#DF5B59',
};

/** @deprecated Use CONTAMINANT_MAP instead */
export const CONTAMINANT_ABBREVS: Record<string, string> = Object.fromEntries(
  Object.entries(CONTAMINANT_MAP).map(([key, { abbrev }]) => [key, abbrev]),
);

export const contaminantLabel = (key: string): string =>
  CONTAMINANT_MAP[key]?.label ?? key;

export const contaminantAbbrev = (key: string): string =>
  CONTAMINANT_MAP[key]?.abbrev ?? key;

export const abbreviateContaminants = (contaminants: string[]): string => {
  if (!contaminants.length) return 'N/A';
  const abbrevs = [...new Set(contaminants)]
    .map(c => contaminantAbbrev(c))
    .sort();
  return abbrevs.join(', ');
};

// ============================================================================
// WEEK RATIO
// ============================================================================

export const buildWeekRatioString = (startDate: string, endDate: string): string | undefined => {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  const msPerDay = 86400000;
  const week = Math.ceil((now.getTime() - start.getTime()) / msPerDay / 7);
  const totalWeeks = Math.ceil((end.getTime() - start.getTime()) / msPerDay / 7);

  if (!isNaN(week) && !isNaN(totalWeeks) && totalWeeks > 0) {
    return `Week ${week} of ${totalWeeks}`;
  }
  return undefined;
};

/** Returns 0–100 progress through a phase given start and end dates. */
export const buildPhaseProgress = (startDate: string, endDate: string): number | undefined => {
  const now = Date.now();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const total = end - start;
  if (isNaN(total) || total <= 0) return undefined;
  const elapsed = now - start;
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
};

// ============================================================================
// ROOM ENTITY
// ============================================================================

export type EquipmentType = 'light' | 'hvac' | 'dehumidifier' | 'fan' | 'co2_generator' | 'other';

export type RoomEquipment = {
  id: string;
  equipmentType: EquipmentType;
  name: string;
  quantity: number;
  specs: Record<string, any>;
};

export type Room = {
  id: string;
  name: string;
  roomType?: string;
  capacity?: number;
  squareFootage?: number;
  notes?: string;
  /** Bench/row grid for the map view. Both unset = room has no layout yet. */
  layoutRows?: number | null;
  layoutCols?: number | null;
  equipment?: RoomEquipment[];
};

// ============================================================================
// ROOM LAYOUT (map view): GET get-room-layout
// ============================================================================

export type MapPlant = {
  id: string;
  label: string;
  strainName: string;
  growthPhase: 'vegetative' | 'flowering';
  row: number | null;
  col: number | null;
  plantHealth: number;
  contaminants: string[];
  floweringDate: string | null;
  targetHarvestDate: string | null;
  vegetativeDate: string | null;
  tag: string | null;
  feedProfile: string | null;
  floweringDays: number | null;
  stretchTrait: StretchTrait | null;
  activeIssues: Array<{ contaminant: string; severity: number; observedAt: string }>;
};

export type PlantHealthEvent = {
  id: string;
  plantId: string | null;
  plantLabel: string | null;
  strainName: string | null;
  roomId: string | null;
  roomName: string | null;
  row: number | null;
  col: number | null;
  contaminant: string;
  severity: number;
  note: string | null;
  growthPhase: string | null;
  floweringDay: number | null;
  status: 'active' | 'resolved';
  /** Operator's bud-rot scale (0.5–3) when the event was scored that way. */
  rotScore: number | null;
  source: 'app' | 'ai' | 'sheet';
  observedAt: string;
  resolvedAt: string | null;
};

/** A tray of plants on one grid cell (rooms tracked at table granularity). */
export type RoomTable = {
  id: string;
  row: number;
  col: number;
  section: string | null;
  strains: Array<{ strain: string; count: number | null }>;
  plantCount: number;
};

export type RoomLayoutMeta = {
  sections?: Array<{ name: string; rowStart: number; rowCount: number }>;
  colStartLabel?: string | null;
  colEndLabel?: string | null;
};

export type RoomLayout = {
  room: {
    id: string;
    name: string;
    roomType: string | null;
    capacity: number | null;
    layoutRows: number | null;
    layoutCols: number | null;
    layoutMeta: RoomLayoutMeta | null;
  };
  plants: MapPlant[];
  tables: RoomTable[];
  events: PlantHealthEvent[];
  /** Risk surface over every spreading contaminant, all history. */
  cells: CellScore[];
  plan: MovePlan;
  /** Other rooms of the same phase that have a layout, for cross-room moves. */
  otherRooms: Array<{ id: string; name: string; emptyCells: number }>;
};

export type HotspotRoomSummary = {
  roomId: string;
  roomName: string;
  roomType: string | null;
  hasLayout: boolean;
  activeEvents: number;
  eventsInWindow: number;
  activePlants: number;
  contaminants: Record<string, number>;
  hottestCells: Array<{ row: number; col: number; score: number; events: number }>;
};

export type HotspotStrainSummary = {
  strainName: string;
  events: number;
  activeEvents: number;
  /** Distinct plants that have ever carried the contaminant. */
  plantsAffected: number;
  /** Plants of this strain that have flowered in the window (denominator). */
  plantsFlowered: number;
  /** plantsAffected / plantsFlowered, 0–1, null when no denominator. */
  incidence: number | null;
};

export type HotspotSummary = {
  windowDays: number | null;
  contaminant: string | null;
  rooms: HotspotRoomSummary[];
  strains: HotspotStrainSummary[];
  totals: { active: number; inWindow: number; plantsWithActive: number };
};

export type { MoveSuggestion as PlantMoveSuggestion };

// ============================================================================
// CREATE PLANTING PAYLOADS
// ============================================================================

export type CreateBatchPayload = {
  type: 'batch';
  name: string;
  batchType: 'clone' | 'seed' | 'tissue_culture';
  strainId: string;
  strainName: string;
  roomId: string;
  untrackedCount: number;
  plantedDate?: string;
};

export type CreatePlantsPayload = {
  type: 'plant';
  plants: Array<{ label: string; strainId: string; strainName: string; roomId: string }>;
  growthPhase?: 'vegetative' | 'flowering';
  plantedDate?: string;
  plantBatchId?: string;
};

export type CreatePlantingPayload = CreateBatchPayload | CreatePlantsPayload;
