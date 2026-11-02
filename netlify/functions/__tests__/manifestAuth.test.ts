/**
 * authorizeManifestRequest: a company gets into the picker and the T3
 * functions either with its own stored Metrc connection or by being
 * allowlisted on a deploy that carries T3_API_KEY. Store is mocked.
 *
 * Run with:
 *     npx vitest run netlify/functions/__tests__/manifestAuth.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectionRow } from '../utils/metrcConnectionStore';

const resolveContext = vi.fn();
vi.mock('../utils/auth', async () => {
    const actual = await vi.importActual<typeof import('../utils/auth')>('../utils/auth');
    return { ...actual, resolveContext: (...a: unknown[]) => resolveContext(...a) };
});

const store = { findConnection: vi.fn<(c: string) => Promise<ConnectionRow | null>>(), activeConnectionCompanyIds: vi.fn(async () => []) };
vi.mock('../utils/metrcConnectionStore', () => ({
    findConnection: (...a: [string]) => store.findConnection(...a),
    activeConnectionCompanyIds: () => store.activeConnectionCompanyIds(),
}));

import { authorizeManifestRequest } from '../utils/manifestAuth';
import { encryptSecret } from '../utils/metrcConnections';

const COMPANY = 'c0ffee00-0000-0000-0000-000000000001';
const director = { userId: 'u1', companyId: COMPANY, role: 'director', departments: [] };
const technician = { ...director, role: 'technician' };
const headers = { authorization: 'Bearer good' };

const connection = (): ConnectionRow => ({
    id: 'conn-1', company_id: COMPANY, api_key_encrypted: encryptSecret('own-key-0123456789abcdef'), api_key_hint: 'cdef', mode: 'live', status: 'active',
    metrc_username: null, metrc_hostname: null, has_t3plus: null, t3plus_tier: null, api_access_level: null, licenses: [], sync_licenses: null,
    last_verified_at: null, last_synced_at: null, last_error: null, last_error_at: null, created_by: null, created_by_name: null,
    created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
});

beforeEach(() => {
    process.env.METRC_CONNECTION_KEY = 'unit-test-connection-key-0123456789';
    delete process.env.T3_API_KEY;
    delete process.env.T3_MODE;
    delete process.env.MANIFEST_COMPANY_IDS;
    delete process.env.DEV_BYPASS_AUTH;
    resolveContext.mockReset().mockImplementation(async (h?: string) => (h === 'Bearer good' ? director : h === 'Bearer tech' ? technician : null));
    store.findConnection.mockReset().mockResolvedValue(null);
});

describe('authorizeManifestRequest', () => {
    it('401s without a valid token', async () => {
        expect(await authorizeManifestRequest({ authorization: 'Bearer forged' })).toMatchObject({ ok: false, status: 401 });
    });

    it("lets a company in on its own connection and hands back that connection's credentials", async () => {
        store.findConnection.mockResolvedValue(connection());
        const res = await authorizeManifestRequest(headers);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.t3).toMatchObject({ source: 'connection', apiKey: 'own-key-0123456789abcdef', mode: 'live' });
        }
    });

    it('lets an allowlisted company in on the deploy key', async () => {
        process.env.T3_API_KEY = 'deploy-key';
        process.env.MANIFEST_COMPANY_IDS = `other, ${COMPANY.toUpperCase()}`;
        const res = await authorizeManifestRequest(headers);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.t3).toEqual({ source: 'env', apiKey: 'deploy-key', mode: 'read-only' });
    });

    it('lets an allowlisted company in even without a deploy key (email export, invoice reading), with no T3 credentials', async () => {
        process.env.MANIFEST_COMPANY_IDS = COMPANY;
        const res = await authorizeManifestRequest(headers);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.t3).toBeNull();
    });

    it('403s a company with neither, pointing at Settings → Metrc', async () => {
        const unset = await authorizeManifestRequest(headers);
        expect(unset).toMatchObject({ ok: false, status: 403, error: expect.stringContaining('Settings → Metrc') });
        process.env.MANIFEST_COMPANY_IDS = 'someone-else';
        const notListed = await authorizeManifestRequest(headers);
        expect(notListed).toMatchObject({ ok: false, status: 403, error: expect.stringContaining(COMPANY) });
    });

    it('enforces minRole after the company check', async () => {
        store.findConnection.mockResolvedValue(connection());
        const res = await authorizeManifestRequest({ authorization: 'Bearer tech' }, { minRole: 'director' });
        expect(res).toMatchObject({ ok: false, status: 403, error: expect.stringContaining('director') });
    });

    it('skips the company check under DEV_BYPASS_AUTH but still resolves credentials', async () => {
        process.env.DEV_BYPASS_AUTH = 'true';
        const none = await authorizeManifestRequest(headers);
        expect(none.ok).toBe(true);
        if (none.ok) expect(none.t3).toBeNull();
        process.env.T3_API_KEY = 'deploy-key';
        process.env.MANIFEST_COMPANY_IDS = COMPANY;
        const env = await authorizeManifestRequest(headers);
        if (env.ok) expect(env.t3?.source).toBe('env');
    });
});
