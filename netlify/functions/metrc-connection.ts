import type { Handler } from '@netlify/functions';
import { authorize, resolveContext } from './utils/auth';
import { jsonResponse as json } from './utils/manifestAuth';
import { connectionStatus, decryptSecret, encryptSecret, keyHint, selfServeAvailable, verifyKey } from './utils/metrcConnections';
import { deleteConnection, findConnection, patchConnection, recordConnectionError, recordVerification, saveConnection } from './utils/metrcConnectionStore';
import { parseT3Mode, T3Error } from './utils/t3';
import type { MetrcConnectionPatch, MetrcConnectionResponse, MetrcConnectRequest } from '../../shared/manifest/metrcConnection';
import type { T3Mode } from '../../shared/manifest/t3';

/**
 * Self-serve Metrc connection for the signed-in company (Settings → Metrc).
 *
 *   GET     — status: connected via own key or deploy key, key hint, mode,
 *             login, licences, last sync / error. Any role.
 *   POST    — connect (or rotate): { apiKey, mode? }. Verifies the key against
 *             T3 first, then stores it encrypted. Director or admin.
 *   PATCH   — { mode?, status?, syncLicenses?, verify? }. Director or admin.
 *   DELETE  — remove the connection. Synced rows stay; they just stop updating.
 *
 * The key is accepted once, over TLS, and never returned. Mistakes are told
 * plainly because the person on the other end is setting this up alone.
 */

const MANAGE_ROLE = 'director';
const KEY_MIN = 16;
const KEY_MAX = 512;
const MODES: T3Mode[] = ['read-only', 'sandbox', 'live'];

const parseBody = <T>(raw: string | null | undefined): T | null => {
    try {
        return JSON.parse(raw || '{}') as T;
    } catch {
        return null;
    }
};

const t3Failure = (err: unknown) => {
    if (err instanceof T3Error) {
        if (err.status === 401) return { status: 400, error: 'T3 rejected that key. Copy it again from api.trackandtrace.tools/v2/pages/secret-key — the whole value, no spaces.', code: 'KEY_REJECTED' };
        if (err.code === 'UNREACHABLE' || err.status >= 500) return { status: 502, error: `Could not reach T3 to check the key: ${err.message}`, code: 'T3_DOWN' };
        return { status: 400, error: err.message, code: err.code ?? 'T3_ERROR' };
    }
    return { status: 500, error: 'Could not verify the key.', code: 'UNKNOWN' };
};

export const handler: Handler = async (event) => {
    try {
        const ctx = await resolveContext(event.headers.authorization);
        if (!ctx) return json(401, { error: 'Sign in first.' });
        const canManage = !authorize(ctx, MANAGE_ROLE);

        if (event.httpMethod === 'GET') {
            return json(200, await connectionStatus(ctx.companyId, canManage));
        }

        if (!canManage) return json(403, { error: `Managing the Metrc connection needs the ${MANAGE_ROLE} or admin role; you are ${ctx.role}.`, code: 'ROLE' });

        if (event.httpMethod === 'POST') {
            if (!selfServeAvailable()) {
                return json(503, { error: 'This server cannot store Metrc keys yet (METRC_CONNECTION_KEY is not set). Ask NeuroCann to enable self-serve connections.', code: 'SELF_SERVE_DISABLED' });
            }
            const body = parseBody<Partial<MetrcConnectRequest>>(event.body);
            if (!body) return json(400, { error: 'Invalid JSON body.' });
            const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
            if (apiKey.length < KEY_MIN || apiKey.length > KEY_MAX || /\s/.test(apiKey)) {
                return json(400, { error: 'Paste the whole T3 secret key (one long string, no spaces).', code: 'KEY_FORMAT' });
            }
            const mode = body.mode === undefined ? 'read-only' : parseT3Mode(body.mode);
            if (body.mode !== undefined && !MODES.includes(body.mode as T3Mode)) {
                return json(400, { error: `Mode must be one of ${MODES.join(', ')}.`, code: 'MODE' });
            }

            let verified;
            try {
                verified = await verifyKey({ apiKey, mode });
            } catch (err) {
                const f = t3Failure(err);
                return json(f.status, { error: f.error, code: f.code });
            }

            await saveConnection({
                companyId: ctx.companyId,
                apiKeyEncrypted: encryptSecret(apiKey),
                apiKeyHint: keyHint(apiKey),
                mode,
                identity: verified.identity,
                createdBy: ctx.userId,
            });
            const response: MetrcConnectionResponse = { ...(await connectionStatus(ctx.companyId, canManage)), warnings: verified.warnings };
            return json(201, response);
        }

        if (event.httpMethod === 'PATCH') {
            const existing = await findConnection(ctx.companyId);
            if (!existing) return json(404, { error: 'No Metrc connection to change. Connect one first.', code: 'NOT_CONNECTED' });
            const body = parseBody<MetrcConnectionPatch>(event.body);
            if (!body) return json(400, { error: 'Invalid JSON body.' });

            const patch: { mode?: T3Mode; status?: 'active' | 'paused'; syncLicenses?: string[] | null } = {};
            if (body.mode !== undefined) {
                if (!MODES.includes(body.mode)) return json(400, { error: `Mode must be one of ${MODES.join(', ')}.`, code: 'MODE' });
                patch.mode = body.mode;
            }
            if (body.status !== undefined) {
                if (body.status !== 'active' && body.status !== 'paused') return json(400, { error: 'Status must be active or paused.', code: 'STATUS' });
                patch.status = body.status;
            }
            if (body.syncLicenses !== undefined) {
                if (body.syncLicenses !== null && (!Array.isArray(body.syncLicenses) || body.syncLicenses.some(l => typeof l !== 'string' || !l.trim()))) {
                    return json(400, { error: 'syncLicenses must be a list of licence numbers, or null for all.', code: 'LICENSES' });
                }
                patch.syncLicenses = body.syncLicenses === null ? null : Array.from(new Set(body.syncLicenses.map(l => l.trim().toUpperCase())));
            }
            if (Object.keys(patch).length) await patchConnection(ctx.companyId, patch);

            const warnings: string[] = [];
            if (body.verify) {
                try {
                    const verified = await verifyKey({ apiKey: decryptSecret(existing.api_key_encrypted), mode: patch.mode ?? existing.mode });
                    await recordVerification(ctx.companyId, verified.identity);
                    warnings.push(...verified.warnings);
                } catch (err) {
                    const f = t3Failure(err);
                    await recordConnectionError(ctx.companyId, f.error);
                    warnings.push(f.error);
                }
            }
            const response: MetrcConnectionResponse = { ...(await connectionStatus(ctx.companyId, canManage)), warnings };
            return json(200, response);
        }

        if (event.httpMethod === 'DELETE') {
            const removed = await deleteConnection(ctx.companyId);
            if (!removed) return json(404, { error: 'No Metrc connection to remove.', code: 'NOT_CONNECTED' });
            const response: MetrcConnectionResponse = { ...(await connectionStatus(ctx.companyId, canManage)), warnings: [] };
            return json(200, response);
        }

        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (error) {
        console.error('metrc-connection error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
