/**
 * cron-metrc-sync: queues one run per company with a Metrc connection and
 * kicks the background function for each. Store, pool and kick are mocked.
 *
 * Run with:
 *     npx vitest run netlify/functions/__tests__/cronMetrcSync.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const connections = { activeConnectionCompanyIds: vi.fn(async (): Promise<string[]> => []), findConnection: vi.fn(async () => null) };
vi.mock('../utils/metrcConnectionStore', () => ({
    activeConnectionCompanyIds: () => connections.activeConnectionCompanyIds(),
    findConnection: (...a: unknown[]) => connections.findConnection(...a),
}));

const client = { release: vi.fn() };
vi.mock('../utils/db', () => ({ pool: { connect: async () => client }, sql: vi.fn() }));

const store = {
    failStaleRuns: vi.fn(async () => {}),
    hasActiveRun: vi.fn(async () => false),
    enqueueRun: vi.fn(async (companyId: string) => `run-${companyId.slice(-1)}`),
    finishRun: vi.fn(async () => {}),
};
vi.mock('../utils/metrcSyncStore', () => ({ MetrcSyncStore: class { constructor() { return store; } } }));

const kick = vi.fn(async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }));
vi.mock('../utils/metrcSyncRunner', () => ({ kickBackgroundSync: (...a: unknown[]) => kick(...(a as [])) }));

import { handler } from '../cron-metrc-sync';

const A = 'c0ffee00-0000-0000-0000-00000000000a';
const B = 'c0ffee00-0000-0000-0000-00000000000b';
const ENV = 'c0ffee00-0000-0000-0000-00000000000e';

const run = () => handler({} as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1]) as Promise<{ statusCode: number; body: string }>;

beforeEach(() => {
    delete process.env.T3_API_KEY;
    delete process.env.MANIFEST_COMPANY_IDS;
    connections.activeConnectionCompanyIds.mockReset().mockResolvedValue([]);
    for (const fn of Object.values(store)) fn.mockClear();
    store.hasActiveRun.mockResolvedValue(false);
    kick.mockClear().mockResolvedValue({ ok: true });
    client.release.mockClear();
});

describe('cron-metrc-sync', () => {
    it('is a no-op with no connections and no deploy key', async () => {
        const res = await run();
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ skipped: true, reason: 'NO_CONNECTIONS' });
        expect(store.enqueueRun).not.toHaveBeenCalled();
    });

    it('queues and kicks a run for every active connection and the env company', async () => {
        connections.activeConnectionCompanyIds.mockResolvedValue([A, B]);
        process.env.T3_API_KEY = 'deploy-key';
        process.env.MANIFEST_COMPANY_IDS = ENV;
        const res = await run();
        expect(res.statusCode).toBe(200);
        expect(store.enqueueRun.mock.calls.map(c => c[0])).toEqual([A, B, ENV]);
        expect(kick).toHaveBeenCalledTimes(3);
        expect(JSON.parse(res.body).results).toEqual([
            { companyId: A, runId: 'run-a' }, { companyId: B, runId: 'run-b' }, { companyId: ENV, runId: 'run-e' },
        ]);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('skips a company whose run is still active and carries on with the rest', async () => {
        connections.activeConnectionCompanyIds.mockResolvedValue([A, B]);
        store.hasActiveRun.mockImplementation(async (c: string) => c === A);
        const res = await run();
        expect(store.enqueueRun.mock.calls.map(c => c[0])).toEqual([B]);
        expect(JSON.parse(res.body).results).toEqual([{ companyId: A, skipped: 'RUN_ACTIVE' }, { companyId: B, runId: 'run-b' }]);
    });

    it('fails the queued row when the background kick does not go through, and reports 502', async () => {
        connections.activeConnectionCompanyIds.mockResolvedValue([A, B]);
        kick.mockImplementation(async () => (kick.mock.calls.length === 1 ? { ok: false, error: 'Background sync responded 500.' } : { ok: true }));
        const res = await run();
        expect(res.statusCode).toBe(502);
        expect(store.finishRun).toHaveBeenCalledWith('run-a', expect.objectContaining({ status: 'failed', error: 'Background sync responded 500.' }));
        expect(JSON.parse(res.body).results[1]).toEqual({ companyId: B, runId: 'run-b' });
    });
});
