import type { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { MetrcSyncStore } from './utils/metrcSyncStore';
import { liveT3, runMetrcSync, syncGate } from './utils/metrcSyncRunner';
import { settleTableScoresForRooms } from './utils/tableScores';

/**
 * Pulls Metrc into NeuroCann through T3. A Netlify *background* function
 * (15-minute limit): the caller gets 202 immediately and the work continues
 * here. It only runs a `metrc_sync_runs` row that is already queued, so the
 * run id is the credential — the scheduler (cron-metrc-sync) and the Sync now
 * button (metrc-sync-start) both create a queued row and POST its id.
 *
 * One run at a time per company is enforced by the partial unique index on
 * running runs; a claim that collides marks the queued row skipped.
 */

/** Leave headroom under Netlify's 15-minute background limit for the final writes. */
const RUN_BUDGET_MS = 13 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const gate = syncGate();
    if (!gate.ok) {
        console.warn('metrc-sync-background: refused —', gate.error);
        return { statusCode: gate.status, body: JSON.stringify({ error: gate.error, code: gate.code }) };
    }

    let runId: string | undefined;
    try {
        runId = JSON.parse(event.body || '{}').runId;
    } catch {
        /* fall through */
    }
    if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'runId required' }) };
    }

    const deadline = new Date(Date.now() + RUN_BUDGET_MS);
    const client = await pool.connect();
    const store = new MetrcSyncStore(client);
    let claimed = false;
    try {
        await store.failStaleRuns(gate.companyId);
        const run = await store.claimQueuedRun(runId, gate.companyId);
        if (!run) {
            console.warn(`metrc-sync-background: run ${runId} not claimable (not queued, wrong company, or another run is active)`);
            return { statusCode: 409, body: JSON.stringify({ error: 'Run is not queued or another sync is running.' }) };
        }
        claimed = true;
        console.log(`metrc-sync-background: run ${run.id} (${run.trigger}${run.dry_run ? ', dry run' : ''}) for company ${gate.companyId}`);

        const result = await runMetrcSync(store, liveT3, { companyId: gate.companyId, runId: run.id, dryRun: run.dry_run, deadline });
        await store.finishRun(run.id, result);
        console.log(`metrc-sync-background: run ${run.id} ${result.status}; ${result.errors.length} error(s)`);
        if (!run.dry_run && result.status !== 'failed') {
            // Plants Metrc just marked harvested may have emptied a room scored by table.
            try {
                const settled = await settleTableScoresForRooms(gate.companyId);
                if (settled) console.log(`metrc-sync-background: settled ${settled} table score(s) in harvested rooms`);
            } catch (err) {
                console.warn('metrc-sync-background: could not settle table scores', err);
            }
        }
        return { statusCode: 200, body: JSON.stringify({ runId: run.id, status: result.status }) };
    } catch (err) {
        console.error('metrc-sync-background error:', err);
        if (claimed) {
            try {
                await store.finishRun(runId, { status: 'failed', counts: {}, errors: [], error: err instanceof Error ? err.message : String(err) });
            } catch (inner) {
                console.error('metrc-sync-background: could not record failure:', inner);
            }
        }
        return { statusCode: 500, body: JSON.stringify({ error: 'Sync failed' }) };
    } finally {
        client.release();
    }
};
