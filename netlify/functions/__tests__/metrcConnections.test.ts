/**
 * Self-serve Metrc connections: key encryption, which credentials a company
 * gets (own connection vs. deploy key), which companies the scheduler syncs,
 * and the sync gate. The store is mocked; T3 is never called here.
 *
 * Run with:
 *     npx vitest run netlify/functions/__tests__/metrcConnections.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectionRow } from '../utils/metrcConnectionStore';

const store = {
    findConnection: vi.fn<(companyId: string) => Promise<ConnectionRow | null>>(),
    activeConnectionCompanyIds: vi.fn<() => Promise<string[]>>(),
};
vi.mock('../utils/metrcConnectionStore', () => ({
    findConnection: (...a: [string]) => store.findConnection(...a),
    activeConnectionCompanyIds: () => store.activeConnectionCompanyIds(),
}));

import {
    allowedCompanyIds, connectionStatus, decryptSecret, encryptSecret, keyHint, resolveMetrcCredentials, selfServeAvailable, syncCompanyIds, syncGate,
} from '../utils/metrcConnections';
import { isT3Configured, t3Mode, withT3 } from '../utils/t3';

const COMPANY = 'c0ffee00-0000-0000-0000-000000000001';
const OTHER = 'c0ffee00-0000-0000-0000-000000000002';

const row = (over: Partial<ConnectionRow> = {}): ConnectionRow => ({
    id: 'conn-1',
    company_id: COMPANY,
    api_key_encrypted: encryptSecret('t3-secret-key-for-proper-0001'),
    api_key_hint: '0001',
    mode: 'read-only',
    status: 'active',
    metrc_username: 'ops@proper.com',
    metrc_hostname: 'mo.metrc.com',
    has_t3plus: true,
    t3plus_tier: 'Team',
    api_access_level: 'full',
    licenses: [{ licenseNumber: 'CUL000030', licenseName: 'Proper Cultivation' }, { licenseNumber: 'MAN000012', licenseName: 'Proper Manufacturing' }],
    sync_licenses: null,
    last_verified_at: '2026-11-02T20:00:00Z',
    last_synced_at: null,
    last_error: null,
    last_error_at: null,
    created_by: 'u1',
    created_by_name: 'Brian',
    created_at: '2026-11-02T19:00:00Z',
    updated_at: '2026-11-02T19:00:00Z',
    ...over,
});

beforeEach(() => {
    process.env.METRC_CONNECTION_KEY = 'unit-test-connection-key-0123456789';
    delete process.env.T3_API_KEY;
    delete process.env.T3_MODE;
    delete process.env.MANIFEST_COMPANY_IDS;
    store.findConnection.mockReset().mockResolvedValue(null);
    store.activeConnectionCompanyIds.mockReset().mockResolvedValue([]);
});

describe('key encryption', () => {
    it('round-trips and never stores the plain key', () => {
        const blob = encryptSecret('t3-secret-abcdef0123456789');
        expect(blob.startsWith('v1:')).toBe(true);
        expect(blob).not.toContain('t3-secret');
        expect(decryptSecret(blob)).toBe('t3-secret-abcdef0123456789');
        expect(keyHint('t3-secret-abcdef0123456789')).toBe('6789');
    });

    it('uses a fresh IV each time and rejects tampering', () => {
        const a = encryptSecret('same');
        const b = encryptSecret('same');
        expect(a).not.toBe(b);
        const [v, iv, tag, ct] = a.split(':');
        const flipped = Buffer.from(ct, 'base64url');
        flipped[0] ^= 0xff;
        expect(() => decryptSecret([v, iv, tag, flipped.toString('base64url')].join(':'))).toThrow();
    });

    it('is unavailable without METRC_CONNECTION_KEY (or with a trivially short one)', () => {
        delete process.env.METRC_CONNECTION_KEY;
        expect(selfServeAvailable()).toBe(false);
        expect(() => encryptSecret('x')).toThrow(/METRC_CONNECTION_KEY/);
        process.env.METRC_CONNECTION_KEY = 'short';
        expect(selfServeAvailable()).toBe(false);
    });
});

describe('resolveMetrcCredentials', () => {
    it("prefers the company's own connection and decrypts its key", async () => {
        store.findConnection.mockResolvedValue(row({ mode: 'live' }));
        const creds = await resolveMetrcCredentials(COMPANY);
        expect(creds).toMatchObject({ source: 'connection', apiKey: 't3-secret-key-for-proper-0001', mode: 'live' });
        expect(store.findConnection).toHaveBeenCalledWith(COMPANY);
    });

    it('falls back to the deploy key only for an allowlisted company', async () => {
        process.env.T3_API_KEY = 'deploy-key';
        process.env.T3_MODE = 'sandbox';
        process.env.MANIFEST_COMPANY_IDS = `${COMPANY.toUpperCase()}, ${OTHER}`;
        expect(await resolveMetrcCredentials(COMPANY)).toEqual({ source: 'env', apiKey: 'deploy-key', mode: 'sandbox' });
        expect(await resolveMetrcCredentials('c0ffee00-0000-0000-0000-000000000009')).toBeNull();
    });

    it('returns null with no connection and no deploy key', async () => {
        process.env.MANIFEST_COMPANY_IDS = COMPANY;
        expect(await resolveMetrcCredentials(COMPANY)).toBeNull();
    });

    it('parses the allowlist case-insensitively and treats blank as unset', () => {
        expect(allowedCompanyIds()).toBeNull();
        process.env.MANIFEST_COMPANY_IDS = ' ';
        expect(allowedCompanyIds()).toBeNull();
        process.env.MANIFEST_COMPANY_IDS = `${COMPANY.toUpperCase()},${OTHER}`;
        expect(allowedCompanyIds()?.has(COMPANY)).toBe(true);
    });
});

describe('withT3 scopes the T3 client to a company', () => {
    it('makes the client see the scoped key and mode, and the env outside the scope', async () => {
        expect(isT3Configured()).toBe(false);
        await withT3({ apiKey: 'scoped', mode: 'live' }, async () => {
            expect(isT3Configured()).toBe(true);
            expect(t3Mode()).toBe('live');
        });
        expect(isT3Configured()).toBe(false);
        expect(t3Mode()).toBe('read-only');
    });
});

describe('syncCompanyIds', () => {
    it('lists active connections plus the single allowlisted env company, deduplicated', async () => {
        store.activeConnectionCompanyIds.mockResolvedValue([COMPANY, OTHER]);
        process.env.T3_API_KEY = 'deploy-key';
        process.env.MANIFEST_COMPANY_IDS = OTHER;
        expect(await syncCompanyIds()).toEqual([COMPANY, OTHER]);
    });

    it('ignores the env when several companies are allowlisted or there is no deploy key', async () => {
        store.activeConnectionCompanyIds.mockResolvedValue([COMPANY]);
        process.env.T3_API_KEY = 'deploy-key';
        process.env.MANIFEST_COMPANY_IDS = `${COMPANY},${OTHER}`;
        expect(await syncCompanyIds()).toEqual([COMPANY]);
        delete process.env.T3_API_KEY;
        process.env.MANIFEST_COMPANY_IDS = OTHER;
        expect(await syncCompanyIds()).toEqual([COMPANY]);
    });
});

describe('syncGate', () => {
    it('refuses a company with nothing configured', async () => {
        expect(await syncGate(COMPANY)).toMatchObject({ ok: false, status: 503, code: 'NOT_CONFIGURED' });
    });

    it('passes a connection and narrows to its chosen licences', async () => {
        store.findConnection.mockResolvedValue(row({ sync_licenses: ['CUL000030'] }));
        const gate = await syncGate(COMPANY);
        expect(gate).toMatchObject({ ok: true, onlyLicenses: ['CUL000030'] });
        expect(gate.ok && gate.creds.source).toBe('connection');
    });

    it('still passes a paused connection (manual runs), with every licence when none are chosen', async () => {
        store.findConnection.mockResolvedValue(row({ status: 'paused', sync_licenses: [] }));
        const gate = await syncGate(COMPANY);
        expect(gate.ok).toBe(true);
        expect(gate.ok && gate.onlyLicenses).toBeUndefined();
    });

    it('with the deploy key, insists on exactly one allowlisted company and that it is this one', async () => {
        process.env.T3_API_KEY = 'deploy-key';
        process.env.MANIFEST_COMPANY_IDS = `${COMPANY},${OTHER}`;
        expect(await syncGate(COMPANY)).toMatchObject({ ok: false, code: 'NO_SYNC_COMPANY' });
        process.env.MANIFEST_COMPANY_IDS = COMPANY;
        expect(await syncGate(COMPANY)).toMatchObject({ ok: true });
    });
});

describe('connectionStatus', () => {
    it('describes a stored connection without leaking the key', async () => {
        store.findConnection.mockResolvedValue(row());
        const s = await connectionStatus(COMPANY, true);
        expect(s).toMatchObject({ connected: true, source: 'connection', selfServeAvailable: true, canManage: true, env: null });
        expect(s.connection).toMatchObject({ keyHint: '0001', username: 'ops@proper.com', mode: 'read-only', syncLicenses: null, createdByName: 'Brian' });
        expect(s.connection?.licenses.map(l => l.licenseNumber)).toEqual(['CUL000030', 'MAN000012']);
        expect(JSON.stringify(s)).not.toContain('t3-secret-key');
    });

    it('reports a deploy-key connection as env', async () => {
        process.env.T3_API_KEY = 'deploy-key';
        process.env.MANIFEST_COMPANY_IDS = COMPANY;
        expect(await connectionStatus(COMPANY, false)).toMatchObject({ connected: true, source: 'env', env: { mode: 'read-only' }, connection: null, canManage: false });
    });

    it('shows a connection whose key can no longer be decrypted as present but not connected', async () => {
        const r = row();
        process.env.METRC_CONNECTION_KEY = 'a-different-server-key-after-rotation';
        store.findConnection.mockResolvedValue(r);
        const s = await connectionStatus(COMPANY, true);
        expect(s.connected).toBe(false);
        expect(s.source).toBe('connection');
        expect(s.connection?.keyHint).toBe('0001');
    });

    it('is empty when nothing is configured', async () => {
        expect(await connectionStatus(COMPANY, true)).toEqual({ connected: false, source: null, selfServeAvailable: true, canManage: true, connection: null, env: null });
    });
});
