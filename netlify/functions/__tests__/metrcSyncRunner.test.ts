// @vitest-environment node
/**
 * The sync runner with T3 and the database faked: cursors only move for lists
 * that finished cleanly, dry runs write nothing but still report conflicts,
 * current rows are skipped, the deadline turns a run partial, and the store's
 * run lock behaves on a unique-index collision.
 */
import { describe, it, expect, vi } from 'vitest';
import { runMetrcSync, type SyncStore, type SyncT3 } from '../utils/metrcSyncRunner';
import { MetrcSyncStore, stateKey, type ListState, type Queryable } from '../utils/metrcSyncStore';
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
        upsertItems: vi.fn(async (_c, rows) => ({ inserted: rows.length, updated: 0, unchanged: 0 })),
        upsertStrains: vi.fn(async (_c, rows) => ({ inserted: rows.length, updated: 0, unchanged: 0 })),
        upsertRooms: vi.fn(async (_c, rows) => ({ inserted: rows.length, updated: 0, unchanged: 0 })),
        metrcItemIds: async () => new Map([['pre-roll 1g', 'item-uuid']]),
        existingPackages: async (_c, labels) => new Map((opts.existing ?? []).filter(e => labels.includes(e.label)).map(e => [e.label, e])),
        upsertPackages: vi.fn(async (_c, rows) => { written.push(rows); return { inserted: rows.length, updated: 0 }; }),
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
        expect(t3.calls.map(c => c.split(' ')[0])).toEqual(['items', 'strains', 'locations', '/v2/packages/active', '/v2/packages/intransit', '/v2/packages/inactive']);
        // first run: full pulls, except inactive packages which go back 90 days
        expect(t3.calls[0]).toMatch(/items MAN000020 full/);
        expect(t3.calls[3]).toMatch(/active MAN000020 full/);
        expect(t3.calls[5]).not.toMatch(/full$/);
        expect(written.flat().map(r => r.label)).toEqual([TAG_A, TAG_B]);
        expect(successes.map(s => s[1])).toEqual(['items', 'strains', 'locations', 'packages/active', 'packages/intransit', 'packages/inactive']);
        expect(failures).toEqual([]);
        expect(result.counts.MAN000020['packages/active']).toEqual({ fetched: 2, inserted: 2, updated: 0, unchanged: 0 });
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
        expect(result.counts.MAN000020['packages/active']).toEqual({ fetched: 2, inserted: 1, updated: 0, unchanged: 1 });
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
        expect(store.ensureProductTypes).not.toHaveBeenCalled();
        expect(successes).toEqual([]);
        expect(failures).toEqual([]);
        // what a real run would do: TAG_A exists by hand (update), TAG_B is new (insert)
        expect(result.counts.MAN000020['packages/active']).toEqual({ fetched: 2, inserted: 1, updated: 1, unchanged: 0 });
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
        expect(successes.length).toBeLessThan(6);
        expect(result.errors.every(e => /Out of time/.test(e.message))).toBe(true);
        expect(result.errors.length + successes.length).toBe(6);
    });

    it('fails outright when T3 cannot list licences', async () => {
        const { store } = fakeStore();
        const result = await runMetrcSync(store, fakeT3({ licenses: async () => { throw new Error('401'); } }), { companyId: COMPANY, runId: RUN, dryRun: false, deadline: farDeadline });
        expect(result.status).toBe('failed');
        expect(result.error).toMatch(/Could not list licences/);
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

    it('rethrows anything that is not a unique violation', async () => {
        const q = db(async () => { throw new Error('connection reset'); });
        await expect(new MetrcSyncStore(q).claimQueuedRun(RUN, COMPANY)).rejects.toThrow('connection reset');
    });
});
