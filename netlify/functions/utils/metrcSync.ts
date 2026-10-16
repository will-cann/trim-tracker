import type { T3Harvest, T3Item, T3Location, T3Package, T3Plant, T3PlantBatch, T3Strain } from './t3';
import { splitLabels } from './t3Transfer';
import type { MetrcSyncConflict, MetrcSyncList } from '../../../shared/manifest/metrcSync';

/**
 * Pure rules for mirroring Metrc into NeuroCann through T3 (phase 1: items,
 * strains, locations, packages — docs/briefs/t3-metrc-sync-brief.md). No I/O:
 * which lists to pull and since when, how a Metrc row becomes a NeuroCann row,
 * and which columns Metrc owns. The runner (metrcSyncRunner.ts) and the store
 * (metrcSyncStore.ts) do the fetching and writing.
 */

// ── Which company ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SyncCompany = { ok: true; companyId: string } | { ok: false; reason: string };

/**
 * Phase 1 syncs into exactly the one company on this deploy's manifest
 * allowlist. Zero or several ids means this deploy is not a per-customer
 * site, and the sync refuses to guess.
 */
export function resolveSyncCompany(allowlist: string | undefined): SyncCompany {
    const ids = (allowlist ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (ids.length === 0) return { ok: false, reason: 'MANIFEST_COMPANY_IDS is unset on this deploy, so there is no company to sync into.' };
    if (ids.length > 1) return { ok: false, reason: `MANIFEST_COMPANY_IDS lists ${ids.length} companies; the Metrc sync needs exactly one.` };
    if (!UUID_RE.test(ids[0])) return { ok: false, reason: `MANIFEST_COMPANY_IDS is not a company id: ${ids[0]}` };
    return { ok: true, companyId: ids[0] };
}

// ── Which lists, since when ────────────────────────────────────────────────

/**
 * Dependency order: reference lists first, then packages, then cultivation —
 * batches before harvests before plants, because a plant links to its batch
 * and to the harvest it went into.
 */
export const SYNC_LISTS: readonly MetrcSyncList[] = [
    'items', 'strains', 'locations',
    'packages/active', 'packages/intransit', 'packages/inactive',
    'plantbatches/active', 'plantbatches/inactive',
    'harvests/active', 'harvests/inactive',
    'plants/vegetative', 'plants/flowering', 'plants/inactive',
];

export const T3_LIST_PATH: Record<MetrcSyncList, string> = {
    items: '/v2/items',
    strains: '/v2/strains',
    locations: '/v2/locations/active',
    'packages/active': '/v2/packages/active',
    'packages/intransit': '/v2/packages/intransit',
    'packages/inactive': '/v2/packages/inactive',
    'plantbatches/active': '/v2/plantbatches/active',
    'plantbatches/inactive': '/v2/plantbatches/inactive',
    'harvests/active': '/v2/harvests/active',
    'harvests/inactive': '/v2/harvests/inactive',
    'plants/vegetative': '/v2/plants/vegetative',
    'plants/flowering': '/v2/plants/flowering',
    'plants/inactive': '/v2/plants/inactive',
};

/** Re-read this much before the cursor; upserts make the overlap harmless. */
export const CURSOR_OVERLAP_MS = 10 * 60 * 1000;
/** A first run only needs recently finished packages. */
export const FIRST_RUN_INACTIVE_DAYS = 90;

/** Everything but strains and locations carries lastModified in T3. */
const FULL_ONLY: ReadonlySet<MetrcSyncList> = new Set(['strains', 'locations']);

/**
 * The `lastModified >= since` bound for one list, or undefined for a full pull.
 * Strains and locations have no lastModified in T3, so they are always full.
 * Inactive lists (finished packages, destroyed/harvested plants, finished
 * harvests and batches) go back 90 days on a first run instead of forever.
 */
export function sinceFor(list: MetrcSyncList, cursor: Date | null, now: Date): Date | undefined {
    if (FULL_ONLY.has(list)) return undefined;
    if (cursor) return new Date(cursor.getTime() - CURSOR_OVERLAP_MS);
    if (list.endsWith('/inactive')) return new Date(now.getTime() - FIRST_RUN_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
    return undefined;
}

// ── Value maps ─────────────────────────────────────────────────────────────

export type LabState = 'not_submitted' | 'submitted' | 'passed' | 'failed';

/**
 * Metrc's lab states collapse to the four the UI knows. NotRequired reads as
 * passed for transfer purposes, matching the picker's reconcile.ts.
 */
export function mapLabState(raw: string | null | undefined): LabState {
    const s = (raw ?? '').trim();
    if (!s || /^NotSubmitted$/i.test(s)) return 'not_submitted';
    if (/^(TestPassed|RetestPassed|NotRequired|ProcessValidated|RemediationPassed|DecontaminationPassed)$/i.test(s)) return 'passed';
    if (/Failed$|^TestFailed|Recall/i.test(s)) return 'failed';
    if (/^(SubmittedForTesting|TestingInProgress|AwaitingConfirmation|ResultsPending|SelectedForRandomTesting|InTesting)$/i.test(s)) return 'submitted';
    if (/pass/i.test(s)) return 'passed';
    if (/fail/i.test(s)) return 'failed';
    return 'submitted';
}

export type PackageStatus = 'active' | 'on_hold' | 'in_transit' | 'finished';

export function mapPackageStatus(p: T3Package, list: MetrcSyncList): PackageStatus {
    if (p.isFinished || list === 'packages/inactive') return 'finished';
    if (p.isInTransit || list === 'packages/intransit') return 'in_transit';
    if (p.isOnHold) return 'on_hold';
    return 'active';
}

export interface ProductTypeSpec {
    /** product_types.name — snake_case machine name packages.package_type points at */
    name: string;
    displayName: string;
    category: 'biomass' | 'intermediate' | 'finished' | 'additive';
    defaultUnit: string;
}

const CATEGORY_RULES: Array<[RegExp, ProductTypeSpec]> = [
    [/pre-?roll.*infus|infus.*pre-?roll/i, { name: 'preroll_infused', displayName: 'Infused Pre-Roll', category: 'finished', defaultUnit: 'each' }],
    [/pre-?roll/i, { name: 'preroll', displayName: 'Pre-Roll', category: 'finished', defaultUnit: 'each' }],
    [/vape|cartridge|cart\b|pen\b/i, { name: 'vape_cartridge', displayName: 'Vape Cartridge', category: 'finished', defaultUnit: 'each' }],
    [/topical|infused \(non-edible\)|salve|lotion/i, { name: 'topical', displayName: 'Topical', category: 'finished', defaultUnit: 'each' }],
    [/edible|infused \(edible\)|gumm|chocolate|beverage|drink/i, { name: 'edible', displayName: 'Edible', category: 'finished', defaultUnit: 'each' }],
    [/tincture/i, { name: 'tincture', displayName: 'Tincture', category: 'finished', defaultUnit: 'each' }],
    [/capsule|tablet|pill/i, { name: 'capsule', displayName: 'Capsule', category: 'finished', defaultUnit: 'each' }],
    [/kief/i, { name: 'kief', displayName: 'Kief', category: 'biomass', defaultUnit: 'g' }],
    [/fresh ?frozen/i, { name: 'fresh_frozen', displayName: 'Fresh Frozen', category: 'biomass', defaultUnit: 'g' }],
    [/shake|trim/i, { name: 'trim', displayName: 'Trim', category: 'biomass', defaultUnit: 'g' }],
    [/bud|flower/i, { name: 'flower', displayName: 'Flower', category: 'biomass', defaultUnit: 'g' }],
    [/concentrate \(each\)|concentrate.*each/i, { name: 'concentrate_each', displayName: 'Concentrate (each)', category: 'finished', defaultUnit: 'each' }],
    [/rosin/i, { name: 'rosin', displayName: 'Rosin', category: 'intermediate', defaultUnit: 'g' }],
    [/distillate/i, { name: 'distillate', displayName: 'Distillate', category: 'intermediate', defaultUnit: 'g' }],
    [/live resin/i, { name: 'live_resin', displayName: 'Live Resin', category: 'intermediate', defaultUnit: 'g' }],
    [/hash/i, { name: 'bubble_hash', displayName: 'Bubble Hash', category: 'intermediate', defaultUnit: 'g' }],
    [/concentrate|extract|oil/i, { name: 'concentrate', displayName: 'Concentrate', category: 'intermediate', defaultUnit: 'g' }],
    [/seed/i, { name: 'seeds', displayName: 'Seeds', category: 'biomass', defaultUnit: 'each' }],
    [/clone|immature|plant/i, { name: 'immature_plants', displayName: 'Immature Plants', category: 'biomass', defaultUnit: 'each' }],
    [/waste/i, { name: 'waste', displayName: 'Waste', category: 'biomass', defaultUnit: 'g' }],
];

export function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'other';
}

/**
 * Metrc product category → NeuroCann product_types row. Known categories land
 * on the catalog's existing names; anything else becomes its own catalog row,
 * finished when Metrc counts it, intermediate when it weighs it.
 */
export function productTypeForCategory(category: string | null | undefined, quantityType?: string | null): ProductTypeSpec {
    const c = (category ?? '').trim();
    for (const [re, spec] of CATEGORY_RULES) if (re.test(c)) return spec;
    const counted = /count/i.test(quantityType ?? '');
    return {
        name: slugify(c || 'other'),
        displayName: c || 'Other',
        category: counted ? 'finished' : 'intermediate',
        defaultUnit: counted ? 'each' : 'g',
    };
}

const toDate = (iso: string | null | undefined): Date | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
};

/** Most text columns the sync writes are VARCHAR(255); Metrc names can run longer. */
export const VARCHAR_MAX = 255;
export const fit = (s: string, max = VARCHAR_MAX): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const clean = (s: string | null | undefined): string | null => {
    const t = (s ?? '').trim();
    return t ? fit(t) : null;
};

/**
 * A harvest's strain column holds one name, or "A, B, C" for a multi-strain
 * harvest; when that would not fit, name the first and count the rest.
 */
export function harvestStrainLabel(names: string[]): string {
    const list = names.map(n => n.trim()).filter(Boolean);
    if (list.length === 0) return 'Unknown';
    if (list.length === 1) return fit(list[0]);
    const joined = list.join(', ');
    if (joined.length <= VARCHAR_MAX) return joined;
    return fit(`${list[0]} +${list.length - 1} more`);
}

// ── Row shapes (Metrc-owned columns only) ──────────────────────────────────

export interface MetrcItemRow {
    license_number: string;
    name: string;
    category: string;
    strain: string | null;
    unit_of_measure: string;
    package_type: string;
    metrc_id: number;
    metrc_last_modified: Date | null;
    /** catalog row the package_type points at; created if missing */
    productType: ProductTypeSpec;
}

export interface StrainRow {
    name: string;
    metrc_id: number;
    metrc_license: string;
}

export interface RoomRow {
    name: string;
    metrc_id: number;
    metrc_license: string;
}

export interface PackageRow {
    label: string;
    license_number: string;
    metrc_id: number;
    metrc_license: string;
    metrc_last_modified: Date | null;
    item_name: string | null;
    strain: string;
    package_type: string;
    quantity: number;
    unit: string;
    location: string | null;
    status: PackageStatus;
    lab_testing_state: LabState;
    metrc_lab_state: string | null;
    packaged_date: Date | null;
    finished_date: Date | null;
    is_production_batch: boolean;
    is_trade_sample: boolean;
    is_donation: boolean;
    source_package_labels: string[];
    source_harvest_names: string[];
    productType: ProductTypeSpec;
}

export function mapItem(item: T3Item, license: string): MetrcItemRow | null {
    const name = clean(item.name);
    if (!name || !Number.isFinite(item.id)) return null;
    const productType = productTypeForCategory(item.productCategoryName, item.quantityTypeName);
    return {
        license_number: license,
        name,
        category: clean(item.productCategoryName) ?? 'Unknown',
        strain: clean(item.strainName),
        unit_of_measure: clean(item.unitOfMeasureName) ?? (productType.defaultUnit === 'each' ? 'Each' : 'Grams'),
        package_type: productType.name,
        metrc_id: item.id,
        metrc_last_modified: toDate(item.lastModified),
        productType,
    };
}

export function mapStrain(strain: T3Strain, license: string): StrainRow | null {
    const name = clean(strain.name);
    if (!name || !Number.isFinite(strain.id)) return null;
    return { name, metrc_id: strain.id, metrc_license: license };
}

export function mapLocation(loc: T3Location, license: string): RoomRow | null {
    const name = clean(loc.name);
    if (!name || !Number.isFinite(loc.id)) return null;
    return { name, metrc_id: loc.id, metrc_license: license };
}

export function mapPackage(p: T3Package, license: string, list: MetrcSyncList): PackageRow | null {
    const label = clean(p.label)?.toUpperCase() ?? null;
    if (!label || !Number.isFinite(p.id)) return null;
    const item = p.item ?? null;
    const productType = productTypeForCategory(item?.productCategoryName, item?.quantityTypeName ?? p.unitOfMeasureQuantityType);
    const unit = clean(p.unitOfMeasureName) ?? clean(p.unitOfMeasureAbbreviation) ?? clean(item?.unitOfMeasureName) ?? (productType.defaultUnit === 'each' ? 'Each' : 'Grams');
    const quantity = typeof p.quantity === 'number' && Number.isFinite(p.quantity) ? Math.max(0, p.quantity) : 0;
    const status = mapPackageStatus(p, list);
    return {
        label,
        license_number: license,
        metrc_id: p.id,
        metrc_license: license,
        metrc_last_modified: toDate(p.lastModified),
        item_name: clean(item?.name),
        strain: clean(item?.strainName) ?? '',
        package_type: productType.name,
        quantity,
        unit: fit(unit, 20),
        location: clean(p.locationName),
        status,
        lab_testing_state: mapLabState(p.labTestingStateName),
        metrc_lab_state: clean(p.labTestingStateName),
        packaged_date: toDate(p.packagedDate),
        finished_date: status === 'finished' ? toDate(p.finishedDate) ?? toDate(p.lastModified) : null,
        is_production_batch: Boolean(p.isProductionBatch || clean(p.productionBatchNumber)),
        is_trade_sample: Boolean(p.isTradeSample),
        is_donation: Boolean(p.isDonation),
        source_package_labels: splitLabels(p.sourcePackageLabels),
        source_harvest_names: (p.sourceHarvestNames ?? '').split(',').map(s => s.trim()).filter(Boolean).map(s => fit(s)),
        productType,
    };
}

// ── Cultivation (phase 2) ──────────────────────────────────────────────────

export type BatchType = 'clone' | 'seed' | 'tissue_culture';
export type PlantPhase = 'vegetative' | 'flowering' | 'harvested' | 'destroyed';
/** NeuroCann's pipeline values after migration 037; Metrc only knows active and finished. */
export type HarvestStatus = 'hanging' | 'completed';

export interface PlantBatchRow {
    name: string;
    batch_type: BatchType | null;
    strain_name: string;
    /** Metrc location name, resolved to rooms.id by the store. */
    room_name: string | null;
    untracked_count: number;
    tracked_count: number;
    planted_date: Date | null;
    metrc_id: number;
    metrc_license: string;
    metrc_last_modified: Date | null;
}

export interface HarvestRow {
    name: string;
    license_number: string;
    strain: string;
    plant_count: number;
    total_wet_weight: number;
    total_waste_weight: number;
    drying_location: string | null;
    status: HarvestStatus;
    is_on_hold: boolean;
    harvest_start_date: Date | null;
    harvest_end_date: Date | null;
    metrc_id: number;
    metrc_license: string;
    metrc_last_modified: Date | null;
}

export interface PlantRow {
    label: string;
    strain_name: string;
    room_name: string | null;
    growth_phase: PlantPhase;
    planted_date: Date | null;
    vegetative_date: Date | null;
    flowering_date: Date | null;
    harvested_date: Date | null;
    destroyed_date: Date | null;
    is_on_hold: boolean;
    /** Metrc batch name → plant_batches.id, resolved by the store. */
    plant_batch_name: string | null;
    /** Metrc harvest id → harvests.id (by metrc_id), resolved by the store. */
    metrc_harvest_id: number | null;
    metrc_id: number;
    metrc_license: string;
    metrc_last_modified: Date | null;
}

export function mapBatchType(raw: string | null | undefined): BatchType | null {
    const s = (raw ?? '').toLowerCase();
    if (/clone/.test(s)) return 'clone';
    if (/seed/.test(s)) return 'seed';
    if (/tissue/.test(s)) return 'tissue_culture';
    return null;
}

export function mapPlantBatch(b: T3PlantBatch, license: string): PlantBatchRow | null {
    const name = clean(b.name);
    if (!name || !Number.isFinite(b.id)) return null;
    const count = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0);
    return {
        name,
        batch_type: mapBatchType(b.plantBatchTypeName),
        strain_name: clean(b.strainName) ?? 'Unknown',
        room_name: clean(b.locationName),
        untracked_count: count(b.untrackedCount),
        tracked_count: count(b.trackedCount),
        planted_date: toDate(b.plantedDate),
        metrc_id: b.id,
        metrc_license: license,
        metrc_last_modified: toDate(b.lastModified),
    };
}

/** Metrc active → hanging (drying); finished → completed. NeuroCann's own stages are handled in the upsert. */
export function mapHarvestStatus(h: T3Harvest, list: MetrcSyncList): HarvestStatus {
    return h.isFinished || list === 'harvests/inactive' ? 'completed' : 'hanging';
}

export function mapHarvest(h: T3Harvest, license: string, list: MetrcSyncList): HarvestRow | null {
    const name = clean(h.name);
    if (!name || !Number.isFinite(h.id)) return null;
    const weight = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0);
    const status = mapHarvestStatus(h, list);
    return {
        name,
        license_number: license,
        strain: harvestStrainLabel((h.sourceStrainNames ?? '').split(',')),
        plant_count: typeof h.plantCount === 'number' ? Math.max(0, Math.trunc(h.plantCount)) : 0,
        total_wet_weight: weight(h.totalWetWeight),
        total_waste_weight: weight(h.totalWasteWeight),
        drying_location: clean(h.dryingLocationName),
        status,
        is_on_hold: Boolean(h.isOnHold),
        harvest_start_date: toDate(h.harvestStartDate),
        harvest_end_date: status === 'completed' ? toDate(h.finishedDate) ?? toDate(h.lastModified) : null,
        metrc_id: h.id,
        metrc_license: license,
        metrc_last_modified: toDate(h.lastModified),
    };
}

/**
 * Growth phase from Metrc's own label when it is one NeuroCann has, else from
 * the list the plant came off. Inactive plants are destroyed when Metrc has a
 * destroyed date and harvested otherwise.
 */
export function mapPlantPhase(p: T3Plant, list: MetrcSyncList): PlantPhase {
    if (list === 'plants/inactive') return p.destroyedDate ? 'destroyed' : 'harvested';
    const g = (p.growthPhaseName ?? '').toLowerCase();
    if (g === 'vegetative' || g === 'flowering') return g;
    return list === 'plants/flowering' ? 'flowering' : 'vegetative';
}

export function mapPlant(p: T3Plant, license: string, list: MetrcSyncList): PlantRow | null {
    const label = clean(p.label)?.toUpperCase() ?? null;
    if (!label || !Number.isFinite(p.id)) return null;
    const phase = mapPlantPhase(p, list);
    return {
        label,
        strain_name: clean(p.strainName) ?? 'Unknown',
        room_name: clean(p.locationName),
        growth_phase: phase,
        planted_date: toDate(p.plantedDate),
        vegetative_date: toDate(p.vegetativeDate),
        flowering_date: toDate(p.floweringDate),
        harvested_date: phase === 'harvested' ? toDate(p.harvestedDate) ?? toDate(p.lastModified) : toDate(p.harvestedDate),
        destroyed_date: phase === 'destroyed' ? toDate(p.destroyedDate) ?? toDate(p.lastModified) : null,
        is_on_hold: Boolean(p.isOnHold),
        plant_batch_name: clean(p.plantBatchName),
        metrc_harvest_id: typeof p.harvestId === 'number' && p.harvestId > 0 ? p.harvestId : null,
        metrc_id: p.id,
        metrc_license: license,
        metrc_last_modified: toDate(p.lastModified),
    };
}

// ── Change detection ───────────────────────────────────────────────────────

/** What an existing NeuroCann package row looks like to the differ. */
export interface ExistingPackage {
    label: string;
    metrc_id: number | string | null;
    metrc_last_modified?: string | Date | null;
    item_name: string | null;
    strain: string | null;
    package_type: string | null;
    quantity: number | string | null;
    unit: string | null;
    location: string | null;
    status: string | null;
    lab_testing_state: string | null;
    license_number: string | null;
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
const str = (v: string | null | undefined) => (v ?? '').trim();

/**
 * Metrc-owned columns whose value would change if `incoming` were written over
 * `existing`, as "column: old → new". Empty means the row is already current.
 */
export function packageChanges(existing: ExistingPackage, incoming: PackageRow): string[] {
    const out: string[] = [];
    const cmp = (col: string, a: string | number | null, b: string | number | null) => {
        if (a !== b) out.push(`${col}: ${a === null || a === '' ? '—' : a} → ${b === null || b === '' ? '—' : b}`);
    };
    cmp('quantity', num(existing.quantity), incoming.quantity);
    cmp('unit', str(existing.unit), incoming.unit);
    cmp('status', str(existing.status), incoming.status);
    cmp('lab', str(existing.lab_testing_state), incoming.lab_testing_state);
    cmp('item', str(existing.item_name), str(incoming.item_name));
    cmp('strain', str(existing.strain), incoming.strain);
    cmp('type', str(existing.package_type), incoming.package_type);
    cmp('location', str(existing.location), str(incoming.location));
    cmp('license', str(existing.license_number), incoming.license_number);
    return out;
}

/**
 * A synced row is current when it already carries this Metrc id and
 * last-modified stamp and no Metrc-owned column differs; re-writing it would
 * only churn updated_at.
 */
export function isCurrent(existing: ExistingPackage | undefined, incoming: PackageRow): boolean {
    if (!existing || existing.metrc_id === null || existing.metrc_id === undefined) return false;
    if (Number(existing.metrc_id) !== incoming.metrc_id) return false;
    const have = existing.metrc_last_modified ? new Date(existing.metrc_last_modified).getTime() : null;
    const want = incoming.metrc_last_modified ? incoming.metrc_last_modified.getTime() : null;
    if (have !== want) return false;
    return packageChanges(existing, incoming).length === 0;
}

export const MAX_REPORTED_CONFLICTS = 200;

/**
 * Hand-entered rows (no metrc_id yet) that a sync would link and change. The
 * first run and every dry run report these so a human can look before Metrc
 * overwrites what someone typed.
 */
export function conflictsFor(existingByLabel: Map<string, ExistingPackage>, incoming: PackageRow[], license: string) {
    let tagMatches = 0;
    const conflicts: MetrcSyncConflict[] = [];
    for (const row of incoming) {
        const existing = existingByLabel.get(row.label);
        if (!existing || existing.metrc_id !== null && existing.metrc_id !== undefined) continue;
        tagMatches++;
        const changes = packageChanges(existing, row);
        if (changes.length && conflicts.length < MAX_REPORTED_CONFLICTS) conflicts.push({ license, label: row.label, changes });
    }
    return { tagMatches, conflicts };
}
