// @vitest-environment node
/**
 * Pure Metrc → NeuroCann mapping rules (utils/metrcSync.ts): which company,
 * which lists since when, how Metrc rows become NeuroCann rows, and change
 * detection. Fixtures follow the T3 v2 spec field names.
 */
import { describe, it, expect } from 'vitest';
import {
    conflictsFor, CURSOR_OVERLAP_MS, fit, harvestStrainLabel, isCurrent, mapBatchType, mapHarvest, mapItem, mapLabState, mapLocation, mapPackage, mapPackageStatus, mapPlant, mapPlantBatch, mapPlantPhase, mapStrain,
    packageChanges, productTypeForCategory, resolveSyncCompany, sinceFor, SYNC_LISTS, T3_LIST_PATH, type ExistingPackage,
} from '../utils/metrcSync';
import type { T3Package } from '../utils/t3';

const COMPANY = '2f1c6a0e-3b7d-4e1a-9c2b-8d6f5a4e3c21';
const TAG = '1A40C0300000B55000135918';
const NOW = new Date('2026-10-16T12:00:00Z');

const pkg: T3Package = {
    id: 9001,
    label: TAG.toLowerCase(),
    licenseNumber: 'MAN000020',
    quantity: 20,
    unitOfMeasureName: 'Each',
    unitOfMeasureAbbreviation: 'ea',
    item: { id: 55, name: 'Proper Pre-Roll 1g - Gelato', productCategoryName: 'Pre-Roll', strainName: 'Gelato', quantityTypeName: 'CountBased', unitOfMeasureName: 'Each' },
    sourcePackageLabels: '1A40C0300000B55000135000, 1A40C0300000B55000135001',
    sourceHarvestNames: 'Gelato 9/1, Gelato 9/2',
    productionBatchNumber: 'PB-77',
    labTestingStateName: 'TestPassed',
    isOnHold: false,
    isInTransit: false,
    isFinished: false,
    isTradeSample: false,
    isDonation: false,
    packagedDate: '2026-10-01T00:00:00.000Z',
    lastModified: '2026-10-15T18:30:00.000Z',
    locationName: 'Vault A',
};

describe('resolveSyncCompany', () => {
    it('accepts exactly one company id', () => {
        expect(resolveSyncCompany(` ${COMPANY.toUpperCase()} `)).toEqual({ ok: true, companyId: COMPANY });
    });
    it('refuses none, several, or garbage', () => {
        expect(resolveSyncCompany(undefined).ok).toBe(false);
        expect(resolveSyncCompany('')).toMatchObject({ ok: false });
        expect(resolveSyncCompany(`${COMPANY},${COMPANY.replace('2f1c', '3f1c')}`)).toMatchObject({ ok: false, reason: expect.stringContaining('2 companies') });
        expect(resolveSyncCompany('not-a-uuid')).toMatchObject({ ok: false });
    });
});

describe('sinceFor', () => {
    it('reads back past the cursor by the overlap for incremental lists', () => {
        const cursor = new Date('2026-10-16T11:00:00Z');
        expect(sinceFor('packages/active', cursor, NOW)!.getTime()).toBe(cursor.getTime() - CURSOR_OVERLAP_MS);
        expect(sinceFor('items', cursor, NOW)!.getTime()).toBe(cursor.getTime() - CURSOR_OVERLAP_MS);
    });
    it('does a full pull the first time, except inactive packages which go back 90 days', () => {
        expect(sinceFor('packages/active', null, NOW)).toBeUndefined();
        expect(sinceFor('items', null, NOW)).toBeUndefined();
        const since = sinceFor('packages/inactive', null, NOW)!;
        expect(Math.round((NOW.getTime() - since.getTime()) / 86_400_000)).toBe(90);
    });
    it('treats every inactive list the same on a first run', () => {
        for (const list of ['plants/inactive', 'harvests/inactive', 'plantbatches/inactive'] as const) {
            expect(Math.round((NOW.getTime() - sinceFor(list, null, NOW)!.getTime()) / 86_400_000)).toBe(90);
        }
        expect(sinceFor('plants/vegetative', null, NOW)).toBeUndefined();
    });
    it('never filters strains or locations (T3 has no lastModified on them)', () => {
        const cursor = new Date('2026-10-16T11:00:00Z');
        expect(sinceFor('strains', cursor, NOW)).toBeUndefined();
        expect(sinceFor('locations', cursor, NOW)).toBeUndefined();
    });
    it('pulls lists in dependency order against the paths the T3 spec lists', () => {
        expect(SYNC_LISTS).toEqual([
            'items', 'strains', 'locations', 'packages/active', 'packages/intransit', 'packages/inactive',
            'plantbatches/active', 'plantbatches/inactive', 'harvests/active', 'harvests/inactive', 'plants/vegetative', 'plants/flowering', 'plants/inactive',
        ]);
        expect(T3_LIST_PATH['plants/vegetative']).toBe('/v2/plants/vegetative');
        expect(T3_LIST_PATH['harvests/inactive']).toBe('/v2/harvests/inactive');
        expect(T3_LIST_PATH.items).toBe('/v2/items');
        expect(T3_LIST_PATH.locations).toBe('/v2/locations/active');
        expect(T3_LIST_PATH['packages/intransit']).toBe('/v2/packages/intransit');
    });
});

describe('value maps', () => {
    it('collapses Metrc lab states to the four the UI knows, NotRequired reading as passed', () => {
        expect(mapLabState('TestPassed')).toBe('passed');
        expect(mapLabState('RetestPassed')).toBe('passed');
        expect(mapLabState('NotRequired')).toBe('passed');
        expect(mapLabState('TestFailed')).toBe('failed');
        expect(mapLabState('RetestFailed')).toBe('failed');
        expect(mapLabState('SubmittedForTesting')).toBe('submitted');
        expect(mapLabState('TestingInProgress')).toBe('submitted');
        expect(mapLabState('NotSubmitted')).toBe('not_submitted');
        expect(mapLabState(undefined)).toBe('not_submitted');
    });

    it('maps package status from flags and from the list it came off', () => {
        expect(mapPackageStatus(pkg, 'packages/active')).toBe('active');
        expect(mapPackageStatus({ ...pkg, isOnHold: true }, 'packages/active')).toBe('on_hold');
        expect(mapPackageStatus({ ...pkg, isInTransit: true }, 'packages/active')).toBe('in_transit');
        expect(mapPackageStatus(pkg, 'packages/intransit')).toBe('in_transit');
        expect(mapPackageStatus(pkg, 'packages/inactive')).toBe('finished');
        expect(mapPackageStatus({ ...pkg, isFinished: true, isOnHold: true }, 'packages/active')).toBe('finished');
    });

    it('lands known Metrc categories on existing catalog names and invents sane rows for the rest', () => {
        expect(productTypeForCategory('Buds').name).toBe('flower');
        expect(productTypeForCategory('Shake/Trim').name).toBe('trim');
        expect(productTypeForCategory('Pre-Roll').name).toBe('preroll');
        expect(productTypeForCategory('Infused Pre-Roll').name).toBe('preroll_infused');
        expect(productTypeForCategory('Vape Cartridge')).toMatchObject({ name: 'vape_cartridge', category: 'finished', defaultUnit: 'each' });
        expect(productTypeForCategory('Infused (edible)').name).toBe('edible');
        expect(productTypeForCategory('Infused (non-edible)').name).toBe('topical');
        expect(productTypeForCategory('Concentrate (Each)').name).toBe('concentrate_each');
        expect(productTypeForCategory('Concentrate')).toMatchObject({ name: 'concentrate', category: 'intermediate', defaultUnit: 'g' });
        expect(productTypeForCategory('Immature Plant').name).toBe('immature_plants');
        expect(productTypeForCategory('Weird New Thing', 'CountBased')).toEqual({ name: 'weird_new_thing', displayName: 'Weird New Thing', category: 'finished', defaultUnit: 'each' });
        expect(productTypeForCategory('Mystery Goo', 'WeightBased')).toMatchObject({ name: 'mystery_goo', category: 'intermediate', defaultUnit: 'g' });
        expect(productTypeForCategory(null).name).toBe('other');
    });
});

describe('mapPackage', () => {
    it('turns a T3 package into the Metrc-owned columns of a packages row', () => {
        const row = mapPackage(pkg, 'MAN000020', 'packages/active')!;
        expect(row).toMatchObject({
            label: TAG,
            license_number: 'MAN000020',
            metrc_id: 9001,
            metrc_license: 'MAN000020',
            item_name: 'Proper Pre-Roll 1g - Gelato',
            strain: 'Gelato',
            package_type: 'preroll',
            quantity: 20,
            unit: 'Each',
            location: 'Vault A',
            status: 'active',
            lab_testing_state: 'passed',
            metrc_lab_state: 'TestPassed',
            is_production_batch: true,
            is_trade_sample: false,
            is_donation: false,
            source_package_labels: ['1A40C0300000B55000135000', '1A40C0300000B55000135001'],
            source_harvest_names: ['Gelato 9/1', 'Gelato 9/2'],
            finished_date: null,
        });
        expect(row.metrc_last_modified?.toISOString()).toBe('2026-10-15T18:30:00.000Z');
        expect(row.packaged_date?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect(row.productType.name).toBe('preroll');
    });

    it('fills finished_date for finished packages and tolerates sparse rows', () => {
        const row = mapPackage({ id: 1, label: TAG, isFinished: true, finishedDate: '2026-10-10T00:00:00Z' }, 'CUL000030', 'packages/inactive')!;
        expect(row.status).toBe('finished');
        expect(row.finished_date?.toISOString()).toBe('2026-10-10T00:00:00.000Z');
        expect(row.strain).toBe('');
        expect(row.quantity).toBe(0);
        expect(row.unit).toBe('Grams');
        expect(row.package_type).toBe('other');
        expect(row.lab_testing_state).toBe('not_submitted');
    });

    it('drops rows with no tag or id', () => {
        expect(mapPackage({ id: 1, label: '  ' }, 'X', 'packages/active')).toBeNull();
        expect(mapPackage({ id: NaN, label: TAG }, 'X', 'packages/active')).toBeNull();
    });
});

describe('mapItem / mapStrain / mapLocation', () => {
    it('maps an item with its catalog spec', () => {
        const row = mapItem({ id: 55, name: ' Proper Pre-Roll 1g - Gelato ', productCategoryName: 'Pre-Roll', strainName: 'Gelato', unitOfMeasureName: 'Each', quantityTypeName: 'CountBased', lastModified: '2026-10-15T18:30:00Z' }, 'MAN000020')!;
        expect(row).toMatchObject({ license_number: 'MAN000020', name: 'Proper Pre-Roll 1g - Gelato', category: 'Pre-Roll', strain: 'Gelato', unit_of_measure: 'Each', package_type: 'preroll', metrc_id: 55 });
        expect(row.metrc_last_modified?.toISOString()).toBe('2026-10-15T18:30:00.000Z');
    });
    it('defaults the unit from the product type when Metrc omits it', () => {
        expect(mapItem({ id: 1, name: 'Bulk Buds', productCategoryName: 'Buds' }, 'L')!.unit_of_measure).toBe('Grams');
        expect(mapItem({ id: 2, name: 'Carts', productCategoryName: 'Vape Cartridge' }, 'L')!.unit_of_measure).toBe('Each');
    });
    it('keeps strain and location names and ids', () => {
        expect(mapStrain({ id: 7, name: 'Gelato' }, 'CUL000030')).toEqual({ name: 'Gelato', metrc_id: 7, metrc_license: 'CUL000030' });
        expect(mapLocation({ id: 3, name: 'Flower 2' }, 'CUL000030')).toEqual({ name: 'Flower 2', metrc_id: 3, metrc_license: 'CUL000030' });
        expect(mapStrain({ id: 7, name: '' }, 'L')).toBeNull();
    });
});

describe('cultivation mappers (phase 2)', () => {
    it('maps a plant batch to a nursery batch row', () => {
        const row = mapPlantBatch({ id: 11, name: ' Gelato 9/1 ', plantBatchTypeName: 'Clone', strainName: 'Gelato', locationName: 'Nursery', untrackedCount: 40, trackedCount: 2, plantedDate: '2026-09-01T00:00:00Z', lastModified: '2026-10-01T12:00:00Z' }, 'CUL000030')!;
        expect(row).toMatchObject({ name: 'Gelato 9/1', batch_type: 'clone', strain_name: 'Gelato', room_name: 'Nursery', untracked_count: 40, tracked_count: 2, metrc_id: 11, metrc_license: 'CUL000030' });
        expect(row.planted_date?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
        expect(mapBatchType('Seed')).toBe('seed');
        expect(mapBatchType('Tissue Culture')).toBe('tissue_culture');
        expect(mapBatchType('Plant')).toBeNull();
        expect(mapPlantBatch({ id: 1, name: '' }, 'L')).toBeNull();
    });

    it('maps harvests: active → hanging, finished → completed, strains joined', () => {
        const active = mapHarvest({ id: 21, name: 'Gelato 2026-09-20', sourceStrainNames: 'Gelato', dryingLocationName: 'Dry 1', plantCount: 12, totalWetWeight: 9000.5, totalWasteWeight: 120, harvestStartDate: '2026-09-20T00:00:00Z', lastModified: '2026-09-21T00:00:00Z' }, 'CUL000030', 'harvests/active')!;
        expect(active).toMatchObject({ name: 'Gelato 2026-09-20', license_number: 'CUL000030', strain: 'Gelato', plant_count: 12, total_wet_weight: 9000.5, total_waste_weight: 120, drying_location: 'Dry 1', status: 'hanging', harvest_end_date: null, metrc_id: 21 });
        const done = mapHarvest({ id: 22, name: 'Mixed 9/1', sourceStrainNames: 'Gelato, Runtz', isFinished: true, finishedDate: '2026-10-05T00:00:00Z' }, 'CUL000030', 'harvests/active')!;
        expect(done.status).toBe('completed');
        expect(done.strain).toBe('Gelato, Runtz');
        expect(done.harvest_end_date?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
        expect(mapHarvest({ id: 23, name: 'Old', lastModified: '2026-08-01T00:00:00Z' }, 'CUL000030', 'harvests/inactive')!.status).toBe('completed');
        expect(mapHarvest({ id: 24, name: 'No strain' }, 'L', 'harvests/active')!.strain).toBe('Unknown');
    });

    it('keeps every text value inside the 255-character columns', () => {
        const many = Array.from({ length: 40 }, (_, i) => `Strain Number ${i + 1} Long Name`);
        expect(harvestStrainLabel(many)).toBe('Strain Number 1 Long Name +39 more');
        expect(harvestStrainLabel(['Gelato', 'Runtz'])).toBe('Gelato, Runtz');
        expect(fit('x'.repeat(300)).length).toBe(255);
        const long = 'L'.repeat(400);
        const h = mapHarvest({ id: 25, name: long, dryingLocationName: long, sourceStrainNames: many.join(', ') }, 'L', 'harvests/active')!;
        expect(h.name.length).toBe(255);
        expect(h.drying_location!.length).toBe(255);
        expect(h.strain.length).toBeLessThanOrEqual(255);
        const p = mapPackage({ id: 1, label: TAG, item: { name: long, strainName: long }, locationName: long, unitOfMeasureName: 'Fluid Ounces (imperial)' }, 'L', 'packages/active')!;
        expect(p.item_name!.length).toBe(255);
        expect(p.strain.length).toBe(255);
        expect(p.unit.length).toBeLessThanOrEqual(20);
    });

    it('maps plant phase from Metrc or from the list, and inactive plants by destroyed date', () => {
        expect(mapPlantPhase({ id: 1, label: 'X', growthPhaseName: 'Flowering' }, 'plants/vegetative')).toBe('flowering');
        expect(mapPlantPhase({ id: 1, label: 'X', growthPhaseName: 'Mother' }, 'plants/vegetative')).toBe('vegetative');
        expect(mapPlantPhase({ id: 1, label: 'X' }, 'plants/flowering')).toBe('flowering');
        expect(mapPlantPhase({ id: 1, label: 'X', destroyedDate: '2026-10-01' }, 'plants/inactive')).toBe('destroyed');
        expect(mapPlantPhase({ id: 1, label: 'X', harvestedDate: '2026-10-01' }, 'plants/inactive')).toBe('harvested');
    });

    it('maps a plant with its batch and harvest links', () => {
        const row = mapPlant({ id: 31, label: '1a40c0300000b55000200001', growthPhaseName: 'Flowering', strainName: 'Gelato', locationName: 'Flower 2', plantBatchName: 'Gelato 9/1', harvestId: 0, plantedDate: '2026-09-01', vegetativeDate: '2026-09-15', floweringDate: '2026-10-01', isOnHold: false, lastModified: '2026-10-02T00:00:00Z' }, 'CUL000030', 'plants/flowering')!;
        expect(row).toMatchObject({ label: '1A40C0300000B55000200001', strain_name: 'Gelato', room_name: 'Flower 2', growth_phase: 'flowering', plant_batch_name: 'Gelato 9/1', metrc_harvest_id: null, destroyed_date: null, metrc_id: 31 });
        expect(row.flowering_date?.toISOString().slice(0, 10)).toBe('2026-10-01');
        const harvested = mapPlant({ id: 32, label: TAG, harvestId: 21, harvestedDate: '2026-10-10', lastModified: '2026-10-10T00:00:00Z' }, 'CUL000030', 'plants/inactive')!;
        expect(harvested).toMatchObject({ growth_phase: 'harvested', metrc_harvest_id: 21 });
        expect(harvested.harvested_date?.toISOString().slice(0, 10)).toBe('2026-10-10');
        const destroyed = mapPlant({ id: 33, label: TAG, destroyedDate: '2026-10-11', lastModified: '2026-10-11T00:00:00Z' }, 'CUL000030', 'plants/inactive')!;
        expect(destroyed.growth_phase).toBe('destroyed');
        expect(destroyed.destroyed_date?.toISOString().slice(0, 10)).toBe('2026-10-11');
    });
});

describe('change detection', () => {
    const existing: ExistingPackage = {
        label: TAG,
        metrc_id: null,
        item_name: 'Proper Pre-Roll 1g - Gelato',
        strain: 'Gelato',
        package_type: 'preroll',
        quantity: '18.00',
        unit: 'Each',
        location: 'Vault A',
        status: 'active',
        lab_testing_state: 'submitted',
        license_number: 'MAN000020',
    };
    const incoming = mapPackage(pkg, 'MAN000020', 'packages/active')!;

    it('names each Metrc-owned column that would change, old → new', () => {
        expect(packageChanges(existing, incoming)).toEqual(['quantity: 18 → 20', 'lab: submitted → passed']);
        expect(packageChanges({ ...existing, quantity: 20, lab_testing_state: 'passed' }, incoming)).toEqual([]);
    });

    it('reports hand-entered rows a sync would link and change, but not rows already from Metrc', () => {
        const byLabel = new Map<string, ExistingPackage>([
            [TAG, existing],
            ['1A40C0300000B55000135919', { ...existing, label: '1A40C0300000B55000135919', metrc_id: 9002, quantity: 1 }],
        ]);
        const other = mapPackage({ ...pkg, id: 9002, label: '1A40C0300000B55000135919', quantity: 5 }, 'MAN000020', 'packages/active')!;
        const unseen = mapPackage({ ...pkg, id: 9003, label: '1A40C0300000B55000135920' }, 'MAN000020', 'packages/active')!;
        const report = conflictsFor(byLabel, [incoming, other, unseen], 'MAN000020');
        expect(report.tagMatches).toBe(1);
        expect(report.conflicts).toEqual([{ license: 'MAN000020', label: TAG, changes: ['quantity: 18 → 20', 'lab: submitted → passed'] }]);
    });

    it('treats a row as current only when id, lastModified and columns all match', () => {
        const synced: ExistingPackage = { ...existing, metrc_id: 9001, quantity: 20, lab_testing_state: 'passed', metrc_last_modified: '2026-10-15T18:30:00.000Z' };
        expect(isCurrent(synced, incoming)).toBe(true);
        expect(isCurrent({ ...synced, metrc_last_modified: '2026-10-15T18:00:00.000Z' }, incoming)).toBe(false);
        expect(isCurrent({ ...synced, metrc_id: null }, incoming)).toBe(false);
        expect(isCurrent({ ...synced, location: 'Vault B' }, incoming)).toBe(false);
        expect(isCurrent(undefined, incoming)).toBe(false);
    });
});
