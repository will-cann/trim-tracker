import type { Handler } from '@netlify/functions';
import { authorize, resolveContext } from './utils/auth';
import { jsonResponse as json } from './utils/manifestAuth';
import { connectionStatus, decryptSecret, encryptSecret, keyHint, mintKeyFromMetrcLogin, registrationSecret, selfServeAvailable, verifyKey } from './utils/metrcConnections';
import { deleteConnection, findConnection, patchConnection, recordConnectionError, recordVerification, saveConnection } from './utils/metrcConnectionStore';
import { parseT3Mode, T3Error, type MetrcLoginInput } from './utils/t3';
import type { MetrcConnectionPatch, MetrcConnectionResponse, MetrcConnectRequest, MetrcLogin } from '../../shared/manifest/metrcConnection';
import type { T3Mode } from '../../shared/manifest/t3';
import { metrcLoginProblem } from '../../shared/manifest/metrcHosts';

/**
 * Self-serve Metrc connection for the signed-in company (Settings → Metrc).
 *
 *   GET     — status: connected via own key or deploy key, key hint, mode,
 *             login, licences, last sync / error. Any role.
 *   POST    — connect (or rotate): { apiKey, mode? } or { metrcLogin, mode? }.
 *             A Metrc login is forwarded to T3 once, which mints the key
 *             (registering the login under our T3+ organisation when the
 *             server has T3_REGISTRATION_SECRET). Either way the key is
 *             verified against T3 first, then stored encrypted. Director or admin.
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
        if (err.code === 'METRC_LOGIN_REJECTED') return { status: 400, error: err.message, code: err.code };
        if (err.code === 'REGISTRATION_SECRET') return { status: 503, error: err.message, code: err.code };
        if (err.code === 'T3_SEATS') return { status: 503, error: `${err.message} Ask NeuroCann to add a seat, or connect with a T3 secret key instead.`, code: err.code };
        if (err.status === 401) return { status: 400, error: 'T3 rejected that key. Copy it again from api.trackandtrace.tools/v2/pages/secret-key — the whole value, no spaces.', code: 'KEY_REJECTED' };
        if (err.code === 'UNREACHABLE' || err.status >= 500) return { status: 502, error: `Could not reach T3 to check the key: ${err.message}`, code: 'T3_DOWN' };
        return { status: 400, error: err.message, code: err.code ?? 'T3_ERROR' };
    }
    return { status: 500, error: 'Could not verify the key.', code: 'UNKNOWN' };
};

const FIELD_MAX = 256;

/** Shape-checks a Metrc login without ever echoing it. */
function parseMetrcLogin(raw: unknown): { ok: true; login: MetrcLoginInput } | { ok: false; error: string } {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof MetrcLogin, unknown>>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const username = str(o.username);
    const password = typeof o.password === 'string' ? o.password : '';
    const hostname = str(o.hostname).toLowerCase();
    const email = str(o.email);
    const otpSeed = str(o.otpSeed).replace(/\s+/g, '');
    if ([username, password, hostname, email, otpSeed].some(v => v.length > FIELD_MAX)) return { ok: false, error: 'One of the login fields is too long.' };
    const login: MetrcLoginInput = { username, password, hostname, ...(email ? { email } : {}), ...(otpSeed ? { otpSeed } : {}) };
    const problem = metrcLoginProblem(login);
    return problem ? { ok: false, error: problem } : { ok: true, login };
}

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
            const mode = body.mode === undefined ? 'read-only' : parseT3Mode(body.mode);
            if (body.mode !== undefined && !MODES.includes(body.mode as T3Mode)) {
                return json(400, { error: `Mode must be one of ${MODES.join(', ')}.`, code: 'MODE' });
            }

            let apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
            const warnings: string[] = [];
            if (body.metrcLogin !== undefined) {
                if (apiKey) return json(400, { error: 'Send either a T3 secret key or a Metrc login, not both.', code: 'LOGIN_FORMAT' });
                const parsed = parseMetrcLogin(body.metrcLogin);
                if (!parsed.ok) return json(400, { error: parsed.error, code: 'LOGIN_FORMAT' });
                try {
                    const minted = await mintKeyFromMetrcLogin(parsed.login);
                    apiKey = minted.secretKey;
                    if (!minted.registered && registrationSecret()) warnings.push('T3 already knew this Metrc login, so it was not added to NeuroCann\'s T3+ organisation again; its existing T3 subscription applies.');
                } catch (err) {
                    const f = t3Failure(err);
                    return json(f.status, { error: f.error, code: f.code });
                }
            } else if (apiKey.length < KEY_MIN || apiKey.length > KEY_MAX || /\s/.test(apiKey)) {
                return json(400, { error: 'Paste the whole T3 secret key (one long string, no spaces).', code: 'KEY_FORMAT' });
            }

            let verified;
            try {
                verified = await verifyKey({ apiKey, mode });
            } catch (err) {
                const f = t3Failure(err);
                return json(f.status, { error: f.error, code: f.code });
            }
            warnings.push(...verified.warnings);

            await saveConnection({
                companyId: ctx.companyId,
                apiKeyEncrypted: encryptSecret(apiKey),
                apiKeyHint: keyHint(apiKey),
                mode,
                identity: verified.identity,
                createdBy: ctx.userId,
            });
            const response: MetrcConnectionResponse = { ...(await connectionStatus(ctx.companyId, canManage)), warnings };
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
        if ((error as { code?: string } | null)?.code === '42P01') {
            console.error('metrc-connection: metrc_connections table missing — run migrations/070_metrc_connections.sql');
            return json(503, { error: 'This server is not ready to store Metrc connections yet (database migration pending). Ask NeuroCann.', code: 'MIGRATION_PENDING' });
        }
        console.error('metrc-connection error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
