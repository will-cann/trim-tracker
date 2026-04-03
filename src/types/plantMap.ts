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

// ============================================================================
// CONTAMINATION CONSTANTS
// ============================================================================

export type ContaminantInfo = { label: string; abbrev: string };

export const CONTAMINANT_MAP: Record<string, ContaminantInfo> = {
  spider_mites:        { label: 'Spider mites',        abbrev: 'SM'  },
  thrips:              { label: 'Thrips',               abbrev: 'TH'  },
  whiteflies:          { label: 'Whiteflies',           abbrev: 'WF'  },
  aphids:              { label: 'Aphids',               abbrev: 'AP'  },
  fungus_gnats:        { label: 'Fungus gnats',         abbrev: 'FG'  },
  powdery_mildew:      { label: 'Powdery mildew',       abbrev: 'PM'  },
  botrytis:            { label: 'Botrytis',             abbrev: 'BO'  },
  fusarium:            { label: 'Fusarium',             abbrev: 'FU'  },
  verticillium:        { label: 'Verticillium',         abbrev: 'VE'  },
  tobacco_mosaic_virus:{ label: 'Tobacco mosaic virus',  abbrev: 'TMV' },
  root_aphids:         { label: 'Root aphids',          abbrev: 'RA'  },
  hops_latent_viroid:  { label: 'Hops latent viroid',   abbrev: 'HLV' },
  nutrient_deficiency: { label: 'Nutrient deficiency',  abbrev: 'ND'  },
  other:               { label: 'Other',                abbrev: 'O'   },
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
  equipment?: RoomEquipment[];
};

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
