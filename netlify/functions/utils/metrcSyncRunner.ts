import type { T3Item, T3Location, T3Package, T3Strain } from './t3';
import { isT3Configured, t3Items, t3Licenses, t3Locations, t3PackageList, t3Strains, T3Error } from './t3';
import {
    conflictsFor, resolveSyncCompany, isCurrent, mapItem, mapLocation, mapPackage, mapStrain, MAX_REPORTED_CONFLICTS,
    sinceFor, SYNC_LISTS, T3_LIST_PATH, type PackageRow, type ProductTypeSpec,
} from './metrcSync';
import type { FinishRun, ListState, UpsertCounts } from './metrcSyncStore';
import { stateKey } from './metrcSyncStore';
import type { MetrcSyncCounts, MetrcSyncError, MetrcSyncList, MetrcSyncListCounts, MetrcSyncReport } from '../../../shared/manifest/metrcSync';

/**
 * One Metrc → NeuroCann sync run. Walks every licence the T3 login can see,
 * and for each pulls the phase-1 lists in dependency order (items, strains,
 * locations, then packages) with a per-list cursor that only moves when that
 * list finished cleanly. T3 and the database are injected so the rules are
 * testable without either.
 */

export interface SyncT3 {
    licenses(): Promise<Array<{ licenseNumber: string; licenseName?: string }>>;
    items(license: string, since?: Date): Promise<T3Item[]>;
    strains(license: string): Promise<T3Strain[]>;
    locations(license: string): Promise<T3Location[]>;
    packages(path: string, license: string, since?: Date): Promise<T3Package[]>;
}

export const liveT3: SyncT3 = {
    licenses: () => t3Licenses(),
    items: (license, since) => t3Items(license, since),
    strains: license => t3Strains(license),
    locations: license => t3Locations(license),
    packages: (path, license, since) => t3PackageList(path, license, since),
};

/** The slice of MetrcSyncStore a run needs. */
export interface SyncStore {
    listStates(companyId: string): Promise<Map<string, ListState>>;
    markListSuccess(companyId: string, license: string, list: MetrcSyncList, cursor: Date): Promise<void>;
    markListError(companyId: string, license: string, list: MetrcSyncList, message: string): Promise<void>;
    ensureProductTypes(companyId: string, specs: ProductTypeSpec[]): Promise<void>;
    upsertItems(companyId: string, rows: ReturnType<typeof mapItem>[]): Promise<UpsertCounts>;
    upsertStrains(companyId: string, rows: ReturnType<typeof mapStrain>[]): Promise<UpsertCounts>;
    upsertRooms(companyId: string, rows: ReturnType<typeof mapLocation>[]): Promise<UpsertCounts>;
    metrcItemIds(companyId: string, license: string): Promise<Map<string, string>>;
    existingPackages(companyId: string, labels: string[]): Promise<Map<string, import('./metrcSync').ExistingPackage>>;
    upsertPackages(companyId: string, rows: PackageRow[], itemIds: Map<string, string>): Promise<Omit<UpsertCounts, 'unchanged'>>;
    touchRun(runId: string, counts: MetrcSyncCounts, errors: MetrcSyncError[]): Promise<void>;
}

export interface RunOptions {
    companyId: string;
    runId: string;
    /** Pull and diff, write nothing. */
    dryRun: boolean;
    /** Stop starting new lists after this instant; the next run picks them up. */
    deadline: Date;
    now?: () => Date;
    /** Restrict to these licences (tests, or a future per-licence Sync now). */
    onlyLicenses?: string[];
}

const describe = (err: unknown): string => {
    if (err instanceof T3Error) return err.message;
    if (err instanceof Error) return err.message;
    return String(err);
};

const nonNull = <T>(rows: Array<T | null>): T[] => rows.filter((r): r is T => r !== null);

export async function runMetrcSync(store: SyncStore, t3: SyncT3, opts: RunOptions): Promise<FinishRun> {
    const now = opts.now ?? (() => new Date());
    const startedAt = now();
    const counts: MetrcSyncCounts = {};
    const errors: MetrcSyncError[] = [];
    const report: MetrcSyncReport = { tagMatches: 0, conflicts: [], conflictsTruncated: false };

    let licenses: string[];
    try {
        licenses = (await t3.licenses()).map(l => l.licenseNumber).filter(Boolean);
    } catch (err) {
        return { status: 'failed', counts, errors, report: opts.dryRun ? report : null, error: `Could not list licences from T3: ${describe(err)}` };
    }
    if (opts.onlyLicenses?.length) {
        const want = new Set(opts.onlyLicenses.map(l => l.toUpperCase()));
        licenses = licenses.filter(l => want.has(l.toUpperCase()));
    }
    if (!licenses.length) {
        return { status: 'failed', counts, errors, report: opts.dryRun ? report : null, error: 'The T3 login sees no licences.' };
    }

    const states = await store.listStates(opts.companyId);
    let succeeded = 0;

    for (const license of licenses) {
        counts[license] = {};
        for (const list of SYNC_LISTS) {
            if (now() >= opts.deadline) {
                errors.push({ license, list, message: 'Out of time; this list will be picked up by the next run.' });
                continue;
            }
            const cursor = states.get(stateKey(license, list))?.cursor ?? null;
            const since = sinceFor(list, cursor, startedAt);
            const listStartedAt = now();
            try {
                const c = await syncList(store, t3, opts, license, list, since, report);
                counts[license][list] = c;
                if (!opts.dryRun) await store.markListSuccess(opts.companyId, license, list, listStartedAt);
                succeeded++;
            } catch (err) {
                const message = describe(err);
                errors.push({ license, list, message });
                if (!opts.dryRun) await store.markListError(opts.companyId, license, list, message);
            }
            await store.touchRun(opts.runId, counts, errors);
        }
    }

    const status = errors.length === 0 ? 'succeeded' : succeeded > 0 ? 'partial' : 'failed';
    return { status, counts, errors, report: opts.dryRun || report.tagMatches > 0 ? report : null, error: null };
}

async function syncList(
    store: SyncStore,
    t3: SyncT3,
    opts: RunOptions,
    license: string,
    list: MetrcSyncList,
    since: Date | undefined,
    report: MetrcSyncReport,
): Promise<MetrcSyncListCounts> {
    const zero = (fetched: number): MetrcSyncListCounts => ({ fetched, inserted: 0, updated: 0, unchanged: fetched });

    if (list === 'items') {
        const rows = nonNull((await t3.items(license, since)).map(i => mapItem(i, license)));
        if (opts.dryRun) return zero(rows.length);
        await store.ensureProductTypes(opts.companyId, rows.map(r => r.productType));
        return { fetched: rows.length, ...(await store.upsertItems(opts.companyId, rows)) };
    }
    if (list === 'strains') {
        const rows = nonNull((await t3.strains(license)).map(s => mapStrain(s, license)));
        if (opts.dryRun) return zero(rows.length);
        return { fetched: rows.length, ...(await store.upsertStrains(opts.companyId, rows)) };
    }
    if (list === 'locations') {
        const rows = nonNull((await t3.locations(license)).map(l => mapLocation(l, license)));
        if (opts.dryRun) return zero(rows.length);
        return { fetched: rows.length, ...(await store.upsertRooms(opts.companyId, rows)) };
    }

    const rows = nonNull((await t3.packages(T3_LIST_PATH[list], license, since)).map(p => mapPackage(p, license, list)));
    if (!rows.length) return zero(0);

    const existing = await store.existingPackages(opts.companyId, rows.map(r => r.label));
    const { tagMatches, conflicts } = conflictsFor(existing, rows, license);
    report.tagMatches += tagMatches;
    for (const c of conflicts) {
        if (report.conflicts.length >= MAX_REPORTED_CONFLICTS) { report.conflictsTruncated = true; break; }
        report.conflicts.push(c);
    }

    const toWrite = rows.filter(r => !isCurrent(existing.get(r.label), r));
    const unchanged = rows.length - toWrite.length;
    if (opts.dryRun) {
        // Report what a real run would do: new tags vs. rows it would update.
        const inserted = toWrite.filter(r => !existing.has(r.label)).length;
        return { fetched: rows.length, inserted, updated: toWrite.length - inserted, unchanged };
    }
    if (!toWrite.length) return { fetched: rows.length, inserted: 0, updated: 0, unchanged };

    await store.ensureProductTypes(opts.companyId, toWrite.map(r => r.productType));
    const itemIds = await store.metrcItemIds(opts.companyId, license);
    const written = await store.upsertPackages(opts.companyId, toWrite, itemIds);
    return { fetched: rows.length, ...written, unchanged };
}

// ── Is this deploy a sync deploy? ──────────────────────────────────────────

export type SyncGate = { ok: true; companyId: string } | { ok: false; status: number; code: string; error: string };

/** T3 key present and exactly one allowlisted company: the two things every sync entry point checks first. */
export function syncGate(): SyncGate {
    if (!isT3Configured()) return { ok: false, status: 503, code: 'NOT_CONFIGURED', error: 'Metrc sync is not enabled on this deploy (T3_API_KEY unset).' };
    const company = resolveSyncCompany(process.env.MANIFEST_COMPANY_IDS);
    if (!company.ok) return { ok: false, status: 409, code: 'NO_SYNC_COMPANY', error: company.reason };
    return { ok: true, companyId: company.companyId };
}

// ── Kicking the background function ────────────────────────────────────────

/**
 * Netlify runs `*-background` functions for up to 15 minutes but only via
 * HTTP, so the scheduler and the Sync now button both POST the queued run's id
 * to it. The id is the capability: the function only runs a row that is queued.
 */
export async function kickBackgroundSync(runId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const base = process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? 'http://localhost:8888';
    const url = `${base.replace(/\/$/, '')}/.netlify/functions/metrc-sync-background`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId }),
        });
        // Background functions answer 202 as soon as the request is accepted.
        if (res.status === 202 || res.ok) return { ok: true };
        return { ok: false, error: `Background sync responded ${res.status}.` };
    } catch (err) {
        return { ok: false, error: `Could not start the background sync: ${describe(err)}` };
    }
}
