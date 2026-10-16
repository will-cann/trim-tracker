// Contaminant catalog and health scoring shared by the app, the Netlify
// functions and the plant-map planner. Keys are the snake_case values stored
// in plants.contaminants and plant_health_events.contaminant.

export type ContaminantCategory = 'pest' | 'fungus' | 'virus' | 'general';

export type ContaminantInfo = {
  label: string;
  abbrev: string;
  /** Health points subtracted per active issue (0–100 scale). */
  impact: number;
  category: ContaminantCategory;
  /** True when the issue moves plant-to-plant, so neighbours are at risk. */
  spreads: boolean;
  /** Short names people use in speech/notes ("bud rot" → botrytis). */
  aliases?: readonly string[];
};

export const CONTAMINANT_MAP: Record<string, ContaminantInfo> = {
  // Pests — treatable, moderate impact
  spider_mites:        { label: 'Spider mites',          abbrev: 'SM',  impact: 15, category: 'pest',    spreads: true,  aliases: ['mites'] },
  thrips:              { label: 'Thrips',                abbrev: 'TH',  impact: 10, category: 'pest',    spreads: true },
  whiteflies:          { label: 'Whiteflies',            abbrev: 'WF',  impact: 10, category: 'pest',    spreads: true },
  aphids:              { label: 'Aphids',                abbrev: 'AP',  impact: 10, category: 'pest',    spreads: true },
  fungus_gnats:        { label: 'Fungus gnats',          abbrev: 'FG',  impact: 5,  category: 'pest',    spreads: true,  aliases: ['gnats'] },
  root_aphids:         { label: 'Root aphids',           abbrev: 'RA',  impact: 20, category: 'pest',    spreads: true },

  // Fungi — serious, can spread fast
  powdery_mildew:      { label: 'Powdery mildew',        abbrev: 'PM',  impact: 25, category: 'fungus',  spreads: true,  aliases: ['pm', 'mildew'] },
  botrytis:            { label: 'Botrytis (bud rot)',    abbrev: 'BO',  impact: 30, category: 'fungus',  spreads: true,  aliases: ['bud rot', 'budrot', 'grey mold', 'gray mold', 'mold'] },
  fusarium:            { label: 'Fusarium',              abbrev: 'FU',  impact: 35, category: 'fungus',  spreads: true },
  verticillium:        { label: 'Verticillium',          abbrev: 'VE',  impact: 30, category: 'fungus',  spreads: true },

  // Viruses — severe, often terminal
  tobacco_mosaic_virus:{ label: 'Tobacco mosaic virus',  abbrev: 'TMV', impact: 40, category: 'virus',   spreads: true,  aliases: ['tmv'] },
  hops_latent_viroid:  { label: 'Hops latent viroid',    abbrev: 'HLV', impact: 35, category: 'virus',   spreads: true,  aliases: ['hlvd', 'hop latent viroid', 'dudding'] },

  // General
  nutrient_deficiency: { label: 'Nutrient deficiency',   abbrev: 'ND',  impact: 10, category: 'general', spreads: false, aliases: ['deficiency'] },
  other:               { label: 'Other',                 abbrev: 'O',   impact: 5,  category: 'general', spreads: false },
};

export const CONTAMINANT_KEYS = Object.keys(CONTAMINANT_MAP);

/** Contaminants that move between neighbouring plants — what hot spots track. */
export const SPREADING_CONTAMINANTS: readonly string[] = CONTAMINANT_KEYS.filter(k => CONTAMINANT_MAP[k].spreads);

/** Resolve a key, label, abbreviation or alias ("bud rot") to a catalog key. */
export function normalizeContaminant(input: string): string | null {
  const q = input.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (CONTAMINANT_MAP[q]) return q;
  const spaced = input.trim().toLowerCase();
  for (const [key, info] of Object.entries(CONTAMINANT_MAP)) {
    if (info.label.toLowerCase() === spaced) return key;
    if (info.abbrev.toLowerCase() === spaced) return key;
    if (info.aliases?.some(a => a === spaced)) return key;
  }
  return null;
}

/** Band half-width: operator can adjust ±BAND from computed score */
export const HEALTH_BAND = 15;

/** Compute health score from active contaminants. Returns { score, min, max }. */
export function computeHealthFromIssues(contaminants: Iterable<string>): { score: number; min: number; max: number } {
  let totalImpact = 0;
  for (const key of contaminants) {
    totalImpact += CONTAMINANT_MAP[key]?.impact ?? 0;
  }
  const score = Math.max(0, 100 - totalImpact);
  return {
    score,
    min: Math.max(0, score - HEALTH_BAND),
    max: Math.min(100, score + HEALTH_BAND),
  };
}

export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Trace',
  2: 'Minor',
  3: 'Moderate',
  4: 'Severe',
  5: 'Critical',
};

export function clampSeverity(value: unknown, fallback = 3): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, Math.round(n)));
}
