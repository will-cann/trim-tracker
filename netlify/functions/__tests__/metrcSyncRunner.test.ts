// @vitest-environment node
/**
 * The sync runner with T3 and the database faked: cursors only move for lists
 * that finished cleanly, dry runs write nothing but still report conflicts,
 * current rows are skipped, the deadline turns a run partial, and the store's
 * run lock behaves on a unique-index collision.
 */
import { describe, it, expect, vi } from 'vitest';
import { runMetrcSync, type SyncStore, type SyncT3 } from '../utils/metrcSyncRunner';
import { MetrcSyncStore, newCounts, stateKey, type ListState, type Queryable } from '../utils/metrcSyncStore';
import { T3Error } from '../utils/t3';
import type { ExistingPackage, PackageRow } from '../utils/metrcSync';
import type { T3Package } from '../utils/t3';

const COMPANY = '2f1c6a0e-3b7d-4e1a-9c2b-8d6f5a4e3c21';
const RUN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TAG_A = '1A40C0300000B55000135918';
const TAG_B = '1A40C0300000B55000135919';

const t3pkg = (over: Partial<T3Package>): T3Package => ({
    id: 1,
    label: TAG_A,
    quantity: 10,
    unitOfMeasureName: 'Each',
    item: { name: 'Pre-Roll 1g', productCategoryName: 'Pre-Roll', strainName: 'Gelato', quantityTypeName: 'CountBased' },
    labTestingStateName: 'TestPassed',
    lastModified: '2026-10-15T18:30:00.000Z',
    ...over,
});

function fakeT3(over: Partial<SyncT3> = {}): SyncT3 & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        licenses: async () => [{ licenseNumber: 'MAN000020' }],
        items: async (license, since) => { calls.push(`items ${license} ${since?.toISOString() ?? 'full'}`); return [{ id: 5, name: 'Pre-Roll 1g', productCategoryName: 'Pre-Roll', quantityTypeName: 'CountBased' }]; },
        strains: async license => { calls.push(`strains ${license}`); return [{ id: 7, name: 'Gelato' }]; },
        locations: async license => { calls.push(`locations ${license}`); return [{ id: 3, name: 'Vault A' }]; },
        packages: async (path, license, since) => {
            calls.push(`${path} ${license} ${since?.toISOString() ?? 'full'}`);
            return path.endsWith('/active') ? [t3pkg({}), t3pkg({ id: 2, label: TAG_B, quantity: 4 })] : [];
        },
        plantBatches: async (path, license, since) => { calls.push(`${path} ${license} ${since?.toISOString() ?? 'full'}`); return path.endsWith('/active') ? [{ id: 11, name: 'Gelato 9/1', plantBatchTypeName: 'Clone', strainName: 'Gelato', locationName: 'Nursery', untrackedCount: 40, trackedCount: 0 }] : []; },
        harvests: async (path, license, since) => { calls.push(`${path} ${license} ${since?.toISOString() ?? 'full'}`); return path.endsWith('/active') ? [{ id: 21, name: 'Gelato 2026-09-20', sourceStrainNames: 'Gelato', plantCount: 12, totalWetWeight: 9000 }] : []; },
        plants: async (path, license, since) => { calls.push(`${path} ${license} ${since?.toISOString() ?? 'full'}`); return path.endsWith('/flowering') ? [{ id: 31, label: '1A40C0300000B55000200001', growthPhaseName: 'Flowering', strainName: 'Gelato', locationName: 'Flower 2', plantBatchName: 'Gelato 9/1' }] : []; },
        plantPermissions: async () => ['plants/vegetative', 'plants/flowering'],
        ...over,
    };
}

function fakeStore(opts: { states?: Map<string, ListState>; existing?: ExistingPackage[] } = {}) {
    const written: PackageRow[][] = [];
    const successes: Array<[string, string, Date]> = [];
    const failures: Array<[string, string, string]> = [];
    const store: SyncStore = {
        listStates: async () => opts.states ?? new Map(),
        markListSuccess: async (_c, license, list, cursor) => { successes.push([license, list, cursor]); },
        markListError: async (_c, license, list, message) => { failures.push([license, list, message]); },
        ensureProductTypes: vi.fn(async () => {}),
        upsertItems: vi.fn(async (_c, rows) => ({ ...newCounts(), inserted: rows.length })),
        upsertStrains: vi.fn(async (_c, rows) => ({ ...newCounts(), inserted: rows.length })),
        upsertRooms: vi.fn(async (_c, rows) => ({ ...newCounts(), inserted: rows.length })),
        metrcItemIds: async () => new Map([['pre-roll 1g', 'item-uuid']]),
        existingPackages: async (_c, labels) => new Map((opts.existing ?? []).filter(e => labels.includes(e.label)).map(e => [e.label, e])),
        upsertPackages: vi.fn(async (_c, rows) => { written.push(rows); return { ...newCounts(), inserted: rows.length }; }),
        cultivationIds: vi.fn(async () => ({ strains: new Map(), rooms: new Map(), plantBatches: new Map(), harvests: new Map() })),
        upsertPlantBatches: vi.fn(async (_c, rows) => ({ ...newCounts(), inserted: rows.length })),
        upsertHarvests: vi.fn(async (_c, rows) => ({ ...newCounts(), inserted: rows.length })),
        upsertPlants: vi.fn(async (_c, rows) => ({ ...newCounts(), inserted: rows.length })),
        touchRun: vi.fn(async () => {}),
    };
    return { store, written, successes, failures };
}

const farDeadline = new Date('2099-01-01T00:00:00Z');

describe('runMetrcSync', () => {
    it('pulls every list for each licence in order, writes, and advances every cursor', async () => {
        const t3 = fakeT3();
        const { store, written, successes, failures } = fakeStore();
        const result = await runMetrcSync(store, t3, { companyId: COMPANY, runId: RUN, dryRun: false, deadline: farDeadline });

        expect(result.status).toBe('succeeded');
        expect(t3.calls.map(c => c.split(' ')[0])).toEqual([
            'items', 'strains', 'locations', '/v2/packages/active', '/v2/packages/intransit', '/v2/packages/inactive',
            '/v2/plantbatches/active', '/v2/plantbatches/inactive', '/v2/harvests/active', '/v2/harvests/inactive',
            '/v2/plants/vegetative', '/v2/plants/flowering', '/v2/plants/inactive',
        ]);
        // first run: full pulls, except inactive packages which go back 90 days
        expect(t3.calls[0]).toMatch(/items MAN000020 full/);
        expect(t3.calls[3]).toMatch(/active MAN000020 full/);
        expect(t3.calls[5]).not.toMatch(/full$/);
        expect(written.flat().map(r => r.label)).toEqual([TAG_A, TAG_B]);
        expect(successes.map(s => s[1])).toEqual([
            'items', 'strains', 'locations', 'packages/active', 'packages/intransit', 'packages/inactive',
            'plantbatches/active', 'plantbatches/inactive', 'harvests/active', 'harvests/inactive', 'plants/vegetative', 'plants/flowering', 'plants/inactive',
        ]);
        expect(result.counts.MAN000020['plants/flowering']).toEqual({ fetched: 1, inserted: 1, updated: 0, unchanged: 0, failed: 0 });
        expect(result.counts.MAN000020['harvests/active']).toEqual({ fetched: 1, inserted: 1, updated: 0, unchanged: 0, failed: 0 });
        expect(failures).toEqual([]);
        expect(result.counts.MAN000020['packages/active']).toEqual({ fetched: 2, inserted: 2, updated: 0, unchanged: 0, failed: 0 });
        expect(result.report).toBeNull();
    });

    it('uses each list cursor minus the overlap, and only advances cursors for lists that succeeded', async () => {
        const cursor = new Date('2026-10-01T11:00:00Z');
        const states = new Map<string, ListState>([[stateKey('MAN000020', 'packages/active'), { cursor, lastSuccessAt: cursor, lastError: null }]]);
        const t3 = fakeT3({
            strains: async () => { throw new Error('Metrc is having trouble'); },
        });
        const { store, successes, failures } = fakeStore({ states });
        const result = await runMetrcSync(store, t3, { companyId: COMPANY, runId: RUN, dryRun: false, deadline: farDeadline });

        expect(result.status).toBe('partial');
        expect(t3.calls.find(c => c.startsWith('/v2/packages/active'))).toBe(`/v2/packages/active MAN000020 ${new Date(cursor.getTime() - 10 * 60 * 1000).toISOString()}`);
        expect(successes.map(s => s[1])).not.toContain('strains');
        expect(failures).toEqual([['MAN000020', 'strains', 'Metrc is having trouble']]);
        expect(result.errors).toEqual([{ license: 'MAN000020', list: 'strains', message: 'Metrc is having trouble' }]);
        // the cursor written is the time the pull started, not Metrc's clock
        const pkgCursor = successes.find(s => s[1] === 'packages/active')![2];
        expect(pkgCursor.getTime()).toBeGreaterThan(cursor.getTime());
    });

    it('skips rows that are already current and links hand-entered ones', async () => {
        const current: ExistingPackage = {
            label: TAG_A, metrc_id: 1, metrc_last_modified: '2026-10-15T18:30:00.000Z', item_name: 'Pre-Roll 1g', strain: 'Gelato', package_type: 'preroll',
            quantity: '10', unit: 'Each', location: null, status: 'active', lab_testing_state: 'passed', license_number: 'MAN000020',
        };
        const handEntered: ExistingPackage = { ...current, label: TAG_B, metrc_id: null, metrc_last_modified: null, quantity: '3' };
        const { store, written } = fakeStore({ existing: [current, handEntered] });
        const result = await runMetrcSync(store, fakeT3(), { companyId: COMPANY, runId: RUN, dryRun: false, deadline: farDeadline });

        expect(written.flat().map(r => r.label)).toEqual([TAG_B]);
        expect(result.counts.MAN000020['packages/active']).toEqual({ fetched: 2, inserted: 1, updated: 0, unchanged: 1, failed: 0 });
        expect(result.report).toEqual({ tagMatches: 1, conflicts: [{ license: 'MAN000020', label: TAG_B, changes: ['quantity: 3 → 4'] }], conflictsTruncated: false });
    });

    it('dry run writes nothing, moves no cursor, and still reports conflicts', async () => {
        const handEntered: ExistingPackage = {
            label: TAG_A, metrc_id: null, item_name: 'Pre-Roll 1g', strain: 'Gelato', package_type: 'preroll',
            quantity: '9', unit: 'Each', location: null, status: 'active', lab_testing_state: 'passed', license_number: 'MAN000020',
        };
        const { store, written, successes, failures } = fakeStore({ existing: [handEntered] });
        const result = await runMetrcSync(store, fakeT3(), { companyId: COMPANY, runId: RUN, dryRun: true, deadline: farDeadline });

        expect(result.status).toBe('succeeded');
        expect(written).toEqual([]);
        expect(store.upsertItems).not.toHaveBeenCalled();
        expect(store.upsertStrains).not.toHaveBeenCalled();
        expect(store.upsertRooms).not.toHaveBeenCalled();
        expect(store.upsertPlants).not.toHaveBeenCalled();
        expect(store.upsertHarvests).not.toHaveBeenCalled();
        expect(store.upsertPlantBatches).not.toHaveBeenCalled();
        expect(store.ensureProductTypes).not.toHaveBeenCalled();
        expect(successes).toEqual([]);
        expect(failures).toEqual([]);
        // what a real run would do: TAG_A exists by hand (update), TAG_B is new (insert)
        expect(result.counts.MAN000020['packages/active']).toEqual({ fetched: 2, inserted: 1, updated: 1, unchanged: 0, failed: 0 });
        expect(result.report).toMatchObject({ tagMatches: 1, conflicts: [{ label: TAG_A, changes: ['quantity: 9 → 10'] }] });
    });

    it('stops starting lists at the deadline and marks the run partial', async () => {
        let tick = 0;
        const now = () => new Date(Date.UTC(2026, 9, 16, 12, 0, tick++));
        const deadline = new Date(Date.UTC(2026, 9, 16, 12, 0, 4));
        const { store, successes } = fakeStore();
        const result = await runMetrcSync(store, fakeT3(), { companyId: COMPANY, runId: RUN, dryRun: false, deadline, now });

        expect(result.status).toBe('partial');
        expect(successes.length).toBeGreaterThan(0);
        expect(successes.length).toBeLessThan(13);
        expect(result.errors.every(e => /Out of time/.test(e.message))).toBe(true);
        expect(result.errors.length + successes.length).toBe(13);
    });

    it('fails outright when T3 cannot list licences', async () => {
        const { store } = fakeStore();
        const result = await runMetrcSync(store, fakeT3({ licenses: async () => { throw new Error('401'); } }), { companyId: COMPANY, runId: RUN, dryRun: false, deadline: farDeadline });
        expect(result.status).toBe('failed');
        expect(result.error).toMatch(/Could not list licences/);
    });

    it('skips the cultivation lists on a licence whose Metrc login has no plants view', async () => {
        const t3 = fakeT3({ plantPermissions: async () => ['packages/active'] });
        const { store, successes } = fakeStore();
        const result = await runMetrcSync(store, t3, { companyId: COMPANY, runId: RUN, dryRun: false, deadline: farDeadline });
        expect(result.status).toBe('succeeded');
        expect(t3.calls.some(c => c.includes('/plants/') || c.includes('/harvests/') || c.includes('/plantbatches/'))).toBe(false);
        expect(successes.map(s => s[1])).toEqual(['items', 'strains', 'locations', 'packages/active', 'packages/intransit', 'packages/inactive']);
        expect(result.counts.MAN000020['plants/flowering']).toBeUndefined();
    });

    it('treats a 401/403 on a cultivation list as "not on this licence", not an error', async () => {
        const t3 = fakeT3({
            plantPermissions: async () => { throw new Error('probe unavailable'); },
            plants: async () => { throw new T3Error('Metrc login page', 401); },
        });
        const { store, failures } = fakeStore();
        const result = await runMetrcSync(store, t3, { companyId: COMPANY, runId: RUN, dryRun: false, deadline: farDeadline });
        expect(result.status).toBe('succeeded');
        expect(result.errors).toEqual([]);
        expect(failures).toEqual([]);
        expect(result.counts.MAN000020['plants/vegetative']).toBeUndefined();
    });

    it('reports rows the database rejected as run errors but still advances the cursor', async () => {
        const { store, successes } = fakeStore();
        (store.upsertPackages as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({ ...newCounts(), inserted: 1, failed: 1, failures: [`${TAG_B}: violates check constraint "packages_quantity_check"`] }));
        const result = await runMetrcSync(store, fakeT3(), { companyId: COMPANY, runId: RUN, dryRun: false, deadline: farDeadline });
        expect(result.status).toBe('partial');
        expect(result.errors).toEqual([{ license: 'MAN000020', list: 'packages/active', message: expect.stringContaining('1 row rejected by the database') }]);
        expect(result.counts.MAN000020['packages/active']).toMatchObject({ inserted: 1, failed: 1 });
        expect(successes.map(s => s[1])).toContain('packages/active');
    });

    it('can be restricted to one licence', async () => {
        const t3 = fakeT3({ licenses: async () => [{ licenseNumber: 'MAN000020' }, { licenseNumber: 'CUL000030' }] });
        const { store } = fakeStore();
        const result = await runMetrcSync(store, t3, { companyId: COMPANY, runId: RUN, dryRun: true, deadline: farDeadline, onlyLicenses: ['cul000030'] });
        expect(Object.keys(result.counts)).toEqual(['CUL000030']);
    });
});

describe('MetrcSyncStore run lock', () => {
    function db(onQuery: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>): Queryable & { log: string[] } {
        const log: string[] = [];
        return { log, query: async (text, params) => { log.push(text.replace(/\s+/g, ' ').trim()); return onQuery(text, params); } };
    }

    it('claims a queued run', async () => {
        const q = db(async text => (text.includes("SET status = 'running'") ? { rows: [{ id: RUN, company_id: COMPANY, trigger: 'schedule', status: 'running', dry_run: false, started_at: 'now' }] } : { rows: [] }));
        const run = await new MetrcSyncStore(q).claimQueuedRun(RUN, COMPANY);
        expect(run?.id).toBe(RUN);
    });

    it('marks the queued run skipped when another run already holds the lock', async () => {
        const q = db(async text => {
            if (text.includes("SET status = 'running'")) throw Object.assign(new Error('duplicate key'), { code: '23505' });
            return { rows: [] };
        });
        const run = await new MetrcSyncStore(q).claimQueuedRun(RUN, COMPANY);
        expect(run).toBeNull();
        expect(q.log.some(l => l.includes("status = 'skipped'") && l.includes('Another sync was already running'))).toBe(true);
    });

    it('returns null, not a claim, when the row is not queued', async () => {
        const q = db(async () => ({ rows: [] }));
        expect(await new MetrcSyncStore(q).claimQueuedRun(RUN, COMPANY)).toBeNull();
    });

    it('retries a rejected batch row by row and keeps the reasons for the rows that still fail', async () => {
        const seen: number[] = [];
        const q = db(async (_text, params) => {
            const names = (params?.[1] as string[]) ?? [];
            seen.push(names.length);
            if (names.length > 1) throw new Error('violates check constraint');
            if (names[0] === 'Bad Strain') throw new Error('violates check constraint "strains_name_check"');
            return { rows: [{ inserted: true }] };
        });
        const counts = await new MetrcSyncStore(q).upsertStrains(COMPANY, [
            { name: 'Gelato', metrc_id: 1, metrc_license: 'L' },
            { name: 'Bad Strain', metrc_id: 2, metrc_license: 'L' },
            { name: 'Runtz', metrc_id: 3, metrc_license: 'L' },
        ]);
        expect(seen).toEqual([3, 1, 1, 1]);
        expect(counts).toEqual({ inserted: 2, updated: 0, unchanged: 0, failed: 1, failures: ['Bad Strain: violates check constraint "strains_name_check"'] });
    });

    it('rethrows anything that is not a unique violation', async () => {
        const q = db(async () => { throw new Error('connection reset'); });
        await expect(new MetrcSyncStore(q).claimQueuedRun(RUN, COMPANY)).rejects.toThrow('connection reset');
    });
});
