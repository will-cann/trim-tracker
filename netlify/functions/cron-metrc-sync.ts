import type { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { MetrcSyncStore } from './utils/metrcSyncStore';
import { kickBackgroundSync, syncGate } from './utils/metrcSyncRunner';

/**
 * Every 15 minutes: queue a Metrc sync run and hand it to the background
 * function. Does no pulling itself — a scheduled function has the ordinary
 * time limit, nowhere near enough for a first full pull across three licences.
 * On deploys without a T3 key or an allowlisted company this is a no-op.
 */
export const handler: Handler = async () => {
    const gate = syncGate();
    if (!gate.ok) {
        return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: gate.code }) };
    }

    const client = await pool.connect();
    try {
        const store = new MetrcSyncStore(client);
        await store.failStaleRuns(gate.companyId);
        if (await store.hasActiveRun(gate.companyId)) {
            return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'RUN_ACTIVE' }) };
        }
        const runId = await store.enqueueRun(gate.companyId, { trigger: 'schedule' });
        const kicked = await kickBackgroundSync(runId);
        if (!kicked.ok) {
            await store.finishRun(runId, { status: 'failed', counts: {}, errors: [], error: kicked.error });
            console.error('cron-metrc-sync:', kicked.error);
            return { statusCode: 502, body: JSON.stringify({ runId, error: kicked.error }) };
        }
        return { statusCode: 200, body: JSON.stringify({ runId }) };
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
