import type { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { MetrcSyncStore } from './utils/metrcSyncStore';
import { kickBackgroundSync } from './utils/metrcSyncRunner';
import { syncCompanyIds } from './utils/metrcConnections';

/**
 * Every 15 minutes: for each company with a Metrc connection, queue a sync run
 * and hand it to the background function. Does no pulling itself — a
 * scheduled function has the ordinary time limit, nowhere near enough for a
 * first full pull across several licences.
 *
 * Companies come from `metrc_connections` (self-serve, status active) plus the
 * deploy's own key when MANIFEST_COMPANY_IDS names exactly one company. With
 * neither this is a no-op. Paused connections are skipped here but can still
 * be run by hand from Settings.
 */
export const handler: Handler = async () => {
    const companies = await syncCompanyIds();
    if (!companies.length) {
        return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'NO_CONNECTIONS' }) };
    }

    const client = await pool.connect();
    const results: Array<{ companyId: string; runId?: string; skipped?: string; error?: string }> = [];
    try {
        const store = new MetrcSyncStore(client);
        for (const companyId of companies) {
            try {
                await store.failStaleRuns(companyId);
                if (await store.hasActiveRun(companyId)) {
                    results.push({ companyId, skipped: 'RUN_ACTIVE' });
                    continue;
                }
                const runId = await store.enqueueRun(companyId, { trigger: 'schedule' });
                const kicked = await kickBackgroundSync(runId);
                if (!kicked.ok) {
                    await store.finishRun(runId, { status: 'failed', counts: {}, errors: [], error: kicked.error });
                    console.error(`cron-metrc-sync: ${companyId}:`, kicked.error);
                    results.push({ companyId, runId, error: kicked.error });
                    continue;
                }
                results.push({ companyId, runId });
            } catch (err) {
                console.error(`cron-metrc-sync: ${companyId} failed to queue:`, err);
                results.push({ companyId, error: err instanceof Error ? err.message : String(err) });
            }
        }
        const failed = results.some(r => r.error);
        return { statusCode: failed ? 502 : 200, body: JSON.stringify({ results }) };
    } catch (err) {
        console.error('cron-metrc-sync error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'cron failed' }) };
    } finally {
        client.release();
    }
};

// Netlify scheduled function — every 15 minutes (also declared in netlify.toml).
export const config = {
    schedule: '*/15 * * * *',
};
