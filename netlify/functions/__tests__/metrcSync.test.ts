// @vitest-environment node
/**
 * Pure Metrc → NeuroCann mapping rules (utils/metrcSync.ts): which company,
 * which lists since when, how Metrc rows become NeuroCann rows, and change
 * detection. Fixtures follow the T3 v2 spec field names.
 */
import { describe, it, expect } from 'vitest';
import {
    conflictsFor, CURSOR_OVERLAP_MS, isCurrent, mapItem, mapLabState, mapLocation, mapPackage, mapPackageStatus, mapStrain,
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
    it('never filters strains or locations (T3 has no lastModified on them)', () => {
        const cursor = new Date('2026-10-16T11:00:00Z');
        expect(sinceFor('strains', cursor, NOW)).toBeUndefined();
        expect(sinceFor('locations', cursor, NOW)).toBeUndefined();
    });
    it('pulls lists in dependency order against the paths the T3 spec lists', () => {
        expect(SYNC_LISTS).toEqual(['items', 'strains', 'locations', 'packages/active', 'packages/intransit', 'packages/inactive']);
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
