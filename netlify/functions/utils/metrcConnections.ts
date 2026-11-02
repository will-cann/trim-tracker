import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { T3License } from '../../../shared/manifest/t3';
import type { MetrcConnectionDetails, MetrcConnectionStatus } from '../../../shared/manifest/metrcConnection';
import { envT3Credentials, grantsAction, t3Licenses, t3PackagePermissions, t3WhoAmI, withT3, T3Error, type T3Credentials } from './t3';
import { resolveSyncCompany } from './metrcSync';
import { activeConnectionCompanyIds, findConnection, type ConnectionIdentity, type ConnectionRow } from './metrcConnectionStore';

/**
 * Where a company's Metrc credentials come from, and the rules around them.
 *
 * Two sources, checked in this order:
 *   1. The company's own connection (`metrc_connections`): a T3 secret key a
 *      director pasted into Settings → Metrc, stored encrypted with
 *      METRC_CONNECTION_KEY. This is the self-serve path.
 *   2. The deploy's T3_API_KEY / T3_MODE, but only for a company listed in
 *      MANIFEST_COMPANY_IDS — the per-customer-site model that predates the
 *      table. The allowlist is still what keeps a site-wide key away from
 *      other tenants.
 *
 * The database layer is in metrcConnectionStore.ts; everything here is rules.
 */

// ── Key encryption ─────────────────────────────────────────────────────────

const CIPHER = 'aes-256-gcm';
const VERSION = 'v1';

/** 32-byte key derived from METRC_CONNECTION_KEY, or null when self-serve is off. */
function encryptionKey(): Buffer | null {
    const secret = process.env.METRC_CONNECTION_KEY;
    if (!secret || secret.trim().length < 16) return null;
    return createHash('sha256').update(secret).digest();
}

export const selfServeAvailable = () => encryptionKey() !== null;

export function encryptSecret(plain: string): string {
    const key = encryptionKey();
    if (!key) throw new Error('METRC_CONNECTION_KEY is not set, so Metrc keys cannot be stored on this server.');
    const iv = randomBytes(12);
    const cipher = createCipheriv(CIPHER, key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join(':');
}

export function decryptSecret(blob: string): string {
    const key = encryptionKey();
    if (!key) throw new Error('METRC_CONNECTION_KEY is not set, so stored Metrc keys cannot be read.');
    const [version, iv, tag, ct] = blob.split(':');
    if (version !== VERSION || !iv || !tag || !ct) throw new Error('Stored Metrc key is not in a recognised format.');
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

export const keyHint = (apiKey: string) => apiKey.slice(-4);

// ── Which credentials apply to a company ───────────────────────────────────

export type MetrcCredentials = T3Credentials & (
    | { source: 'connection'; connection: ConnectionRow }
    | { source: 'env' }
);

/** MANIFEST_COMPANY_IDS as a set of lower-case ids; null when unset (deploy key disabled). */
export function allowedCompanyIds(): Set<string> | null {
    const raw = process.env.MANIFEST_COMPANY_IDS;
    if (!raw || !raw.trim()) return null;
    return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

const isAllowlisted = (companyId: string) => allowedCompanyIds()?.has(companyId.toLowerCase()) ?? false;

/**
 * The company's own connection wins; otherwise the deploy key when the
 * company is allowlisted for it. Null means NeuroCann cannot reach Metrc for
 * this company and every T3-backed endpoint should say so (503 NOT_CONFIGURED).
 */
export async function resolveMetrcCredentials(companyId: string): Promise<MetrcCredentials | null> {
    const connection = await findConnection(companyId);
    if (connection) {
        return { apiKey: decryptSecret(connection.api_key_encrypted), mode: connection.mode, source: 'connection', connection };
    }
    const env = envT3Credentials();
    if (env && isAllowlisted(companyId)) return { ...env, source: 'env' };
    return null;
}

/**
 * Every company the scheduled sync should run for: active connections plus,
 * when the deploy has its own key, the single allowlisted company.
 */
export async function syncCompanyIds(): Promise<string[]> {
    const ids = new Set(await activeConnectionCompanyIds());
    if (envT3Credentials()) {
        const env = resolveSyncCompany(process.env.MANIFEST_COMPANY_IDS);
        if (env.ok) ids.add(env.companyId);
    }
    return [...ids];
}

export type SyncGate =
    | { ok: true; creds: MetrcCredentials; onlyLicenses?: string[] }
    | { ok: false; status: number; code: string; error: string };

/**
 * Can this company sync, and with what? A paused connection still passes so
 * a director can run Sync now or a dry run; the scheduler skips it instead.
 */
export async function syncGate(companyId: string): Promise<SyncGate> {
    const creds = await resolveMetrcCredentials(companyId);
    if (!creds) {
        return { ok: false, status: 503, code: 'NOT_CONFIGURED', error: 'No Metrc connection for this company. Connect one in Settings → Metrc.' };
    }
    if (creds.source === 'env') {
        // The deploy key only syncs into the one allowlisted company, never into several.
        const env = resolveSyncCompany(process.env.MANIFEST_COMPANY_IDS);
        if (!env.ok) return { ok: false, status: 409, code: 'NO_SYNC_COMPANY', error: env.reason };
        if (env.companyId !== companyId.toLowerCase()) return { ok: false, status: 403, code: 'NO_SYNC_COMPANY', error: 'This deploy syncs Metrc into a different company.' };
        return { ok: true, creds };
    }
    const only = creds.connection.sync_licenses;
    return { ok: true, creds, onlyLicenses: only && only.length ? only : undefined };
}

// ── Verifying a key against T3 ─────────────────────────────────────────────

const MAX_PERMISSION_CHECKS = 6;

export interface VerifiedKey {
    identity: ConnectionIdentity;
    licenses: T3License[];
    warnings: string[];
}

/**
 * Ask T3 who the key belongs to and which licences it sees. Throws a T3Error
 * when the key is rejected; a licence listing failure is a warning, since the
 * key itself was accepted.
 */
export async function verifyKey(creds: T3Credentials): Promise<VerifiedKey> {
    return withT3(creds, async () => {
        const who = await t3WhoAmI();
        const warnings: string[] = [];
        let licenses: T3License[] = [];
        try {
            const list = await t3Licenses();
            licenses = list.map(l => ({ licenseNumber: l.licenseNumber, licenseName: l.licenseName, canCreateTransfer: null }));
            await Promise.all(
                licenses.slice(0, MAX_PERMISSION_CHECKS).map(async l => {
                    try {
                        l.canCreateTransfer = grantsAction(await t3PackagePermissions(l.licenseNumber), 'new_transfer');
                    } catch {
                        l.canCreateTransfer = null;
                    }
                }),
            );
        } catch (err) {
            warnings.push(`The key works, but T3 could not list its licences: ${err instanceof T3Error ? err.message : 'unknown error'}.`);
        }
        if (who.hasT3plus === false) {
            warnings.push('This T3 account has no active T3+ subscription. Metrc data endpoints need T3+, so the sync will fail until it is added at dash.trackandtrace.tools.');
        } else if (who.t3plusApiAccessLevel && who.t3plusApiAccessLevel !== 'full') {
            warnings.push(`This T3+ tier gives "${who.t3plusApiAccessLevel}" API access; the sync needs full access to read packages and plants.`);
        }
        if (!licenses.length && !warnings.some(w => w.includes('list its licences'))) {
            warnings.push('The Metrc login behind this key sees no licences. Check it is an employee on the facility in Metrc.');
        }
        return {
            identity: {
                username: who.username ?? null,
                hostname: who.hostname ?? null,
                hasT3plus: who.hasT3plus ?? null,
                tier: who.t3plusSubscriptionTier ?? null,
                apiAccessLevel: who.t3plusApiAccessLevel ?? null,
                licenses: licenses.map(l => ({ licenseNumber: l.licenseNumber, licenseName: l.licenseName })),
            },
            licenses,
            warnings,
        };
    });
}

// ── Wire shape ─────────────────────────────────────────────────────────────

export function connectionDetails(row: ConnectionRow): MetrcConnectionDetails {
    return {
        keyHint: row.api_key_hint,
        mode: row.mode,
        status: row.status,
        username: row.metrc_username,
        hostname: row.metrc_hostname,
        hasT3plus: row.has_t3plus,
        subscriptionTier: row.t3plus_tier,
        apiAccessLevel: row.api_access_level,
        licenses: row.licenses.map(l => ({ licenseNumber: l.licenseNumber, licenseName: l.licenseName, canCreateTransfer: null })),
        syncLicenses: row.sync_licenses,
        lastVerifiedAt: row.last_verified_at,
        lastSyncedAt: row.last_synced_at,
        lastError: row.last_error,
        lastErrorAt: row.last_error_at,
        createdAt: row.created_at,
        createdByName: row.created_by_name,
    };
}

export async function connectionStatus(companyId: string, canManage: boolean): Promise<MetrcConnectionStatus> {
    const creds = await resolveMetrcCredentials(companyId).catch(err => {
        // A row we can no longer decrypt (rotated METRC_CONNECTION_KEY) should show, not 500.
        console.error('metrc connection: could not resolve credentials', err);
        return null;
    });
    const base: MetrcConnectionStatus = {
        connected: creds !== null,
        source: creds?.source ?? null,
        selfServeAvailable: selfServeAvailable(),
        canManage,
        connection: null,
        env: null,
    };
    if (!creds) {
        const row = await findConnection(companyId);
        if (row) return { ...base, connected: false, source: 'connection', connection: connectionDetails(row) };
        return base;
    }
    if (creds.source === 'connection') return { ...base, connection: connectionDetails(creds.connection) };
    return { ...base, env: { mode: creds.mode } };
}
