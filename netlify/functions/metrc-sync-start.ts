import type { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';
import { MetrcSyncStore } from './utils/metrcSyncStore';
import { kickBackgroundSync, syncGate } from './utils/metrcSyncRunner';
import type { MetrcSyncStartRequest, MetrcSyncStartResponse } from '../../shared/manifest/metrcSync';

/**
 * "Sync now" (and "Dry run") from Settings → Metrc Sync. Director or admin of
 * the allowlisted company only. Queues a manual run and kicks the background
 * function; the panel then polls metrc-sync-status to watch it.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const auth = await authorizeManifestRequest(event.headers, { minRole: 'director' });
        if (!auth.ok) return json(auth.status, { error: auth.error });

        const gate = syncGate();
        if (!gate.ok) return json(gate.status, { error: gate.error, code: gate.code });
        if (gate.companyId !== auth.ctx.companyId.toLowerCase()) {
            return json(403, { error: 'This deploy syncs Metrc into a different company.' });
        }

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
            await store.failStaleRuns(gate.companyId);
            if (await store.hasActiveRun(gate.companyId)) {
                return json(409, { error: 'A sync is already running. Wait for it to finish.', code: 'RUN_ACTIVE' });
            }
            const runId = await store.enqueueRun(gate.companyId, { trigger: 'manual', startedBy: auth.ctx.userId, dryRun });
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
