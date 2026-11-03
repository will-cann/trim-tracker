import type { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { authorize, resolveContext } from './utils/auth';
import { jsonResponse as json } from './utils/manifestAuth';
import { MetrcSyncStore } from './utils/metrcSyncStore';
import { kickBackgroundSync } from './utils/metrcSyncRunner';
import { syncGate } from './utils/metrcConnections';
import type { MetrcSyncStartRequest, MetrcSyncStartResponse } from '../../shared/manifest/metrcSync';

/**
 * "Sync now" (and "Dry run") from Settings → Metrc. Director or admin of a
 * company with a Metrc connection. Queues a manual run and kicks the
 * background function; the panel then polls metrc-sync-status to watch it.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const ctx = await resolveContext(event.headers.authorization);
        if (!ctx) return json(401, { error: 'Sign in first.' });
        if (authorize(ctx, 'director')) return json(403, { error: `Starting a sync needs the director or admin role; you are ${ctx.role}.` });

        const gate = await syncGate(ctx.companyId);
        if (!gate.ok) return json(gate.status, { error: gate.error, code: gate.code });

        let body: MetrcSyncStartRequest = {};
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return json(400, { error: 'Invalid JSON body.' });
        }
        const dryRun = Boolean(body.dryRun);

        const client = await pool.connect();
        try {
            const store = new MetrcSyncStore(client);
            await store.failStaleRuns(ctx.companyId);
            if (await store.hasActiveRun(ctx.companyId)) {
                return json(409, { error: 'A sync is already running. Wait for it to finish.', code: 'RUN_ACTIVE' });
            }
            const runId = await store.enqueueRun(ctx.companyId, { trigger: 'manual', startedBy: ctx.userId, dryRun });
            const kicked = await kickBackgroundSync(runId);
            if (!kicked.ok) {
                await store.finishRun(runId, { status: 'failed', counts: {}, errors: [], error: kicked.error });
                return json(502, { error: kicked.error });
            }
            const response: MetrcSyncStartResponse = { runId, dryRun };
            return json(202, response);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('metrc-sync-start error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
