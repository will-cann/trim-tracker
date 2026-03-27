// ============================================================================
// PLANT MAP MODULE TYPES
// ============================================================================

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
};

// ============================================================================
// API RESPONSE: Per-room strain data (expanded room)
// ============================================================================

export type RoomMapData = Record<string, PlantGroup>;

export type PlantGroup = {
  totalPlants: number;
  plantHealth: number;
  plants: string[];
  contamination: string[];
  plantedDate: string;
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
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
};

// ============================================================================
// CONTAMINATION CONSTANTS
// ============================================================================

export const CONTAMINANT_ABBREVS: Record<string, string> = {
  'Spider mites': 'SM',
  'Thrips': 'TH',
  'Whiteflies': 'WF',
  'Aphids': 'AP',
  'Fungus gnats': 'FG',
  'Powdery mildew': 'PM',
  'Botrytis': 'BO',
  'Fusarium': 'FU',
  'Verticillium': 'VE',
  'Tobacco mosaic virus': 'TMV',
  'Root aphids': 'RA',
  'Hops latent viroid': 'HLV',
  'Other': 'O',
};

export const abbreviateContaminants = (contaminants: string[]): string => {
  if (!contaminants.length) return 'N/A';
  const abbrevs = [...new Set(contaminants)]
    .map(c => CONTAMINANT_ABBREVS[c] || c)
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

// ============================================================================
// ROOM ENTITY
// ============================================================================

export type Room = {
  id: string;
  name: string;
  roomType?: string;
  capacity?: number;
};
