/**
 * metrc-connection handler: the self-serve flow a director walks through in
 * Settings → Metrc. Store and T3 are mocked. Asserts that
 *   - anyone signed in can read status, only director/admin can change it
 *   - a key is verified with T3 before it is stored, and stored encrypted
 *   - T3 rejections come back as plain 400s, outages as 502
 *   - PATCH changes mode / pause / licences and can re-verify
 *   - DELETE removes the connection
 *
 * Run with:
 *     npx vitest run netlify/functions/__tests__/metrcConnection.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectionRow, SaveConnectionInput } from '../utils/metrcConnectionStore';

const resolveContext = vi.fn();
vi.mock('../utils/auth', async () => {
    const actual = await vi.importActual<typeof import('../utils/auth')>('../utils/auth');
    return { ...actual, resolveContext: (...a: unknown[]) => resolveContext(...a) };
});

const store = {
    findConnection: vi.fn(),
    saveConnection: vi.fn(),
    patchConnection: vi.fn(),
    deleteConnection: vi.fn(),
    recordVerification: vi.fn(),
    recordConnectionError: vi.fn(),
    activeConnectionCompanyIds: vi.fn(async () => []),
};
vi.mock('../utils/metrcConnectionStore', () => ({
    findConnection: (...a: unknown[]) => store.findConnection(...a),
    saveConnection: (...a: unknown[]) => store.saveConnection(...a),
    patchConnection: (...a: unknown[]) => store.patchConnection(...a),
    deleteConnection: (...a: unknown[]) => store.deleteConnection(...a),
    recordVerification: (...a: unknown[]) => store.recordVerification(...a),
    recordConnectionError: (...a: unknown[]) => store.recordConnectionError(...a),
    activeConnectionCompanyIds: () => store.activeConnectionCompanyIds(),
}));

const t3 = { whoami: vi.fn(), licenses: vi.fn(), permissions: vi.fn(), checkLogin: vi.fn(), register: vi.fn(), mint: vi.fn() };
vi.mock('../utils/t3', async () => {
    const actual = await vi.importActual<typeof import('../utils/t3')>('../utils/t3');
    return {
        ...actual,
        t3WhoAmI: () => t3.whoami(),
        t3Licenses: () => t3.licenses(),
        t3PackagePermissions: (...a: unknown[]) => t3.permissions(...a),
        t3CheckMetrcLogin: (...a: unknown[]) => t3.checkLogin(...a),
        t3RegisterMetrcLogin: (...a: unknown[]) => t3.register(...a),
        t3MintSecretKey: (...a: unknown[]) => t3.mint(...a),
    };
});

import { handler } from '../metrc-connection';
import { decryptSecret, encryptSecret } from '../utils/metrcConnections';
import { T3Error } from '../utils/t3';

const COMPANY = 'c0ffee00-0000-0000-0000-000000000001';
const director = { userId: 'u1', companyId: COMPANY, role: 'director', departments: [] };
const technician = { ...director, role: 'technician' };
const KEY = 'ttt_0123456789abcdef0123456789abcdef';

function call(method: string, body?: unknown, headers: Record<string, string> = { authorization: 'Bearer good' }) {
    return handler(
        { httpMethod: method, headers, body: body === undefined ? null : JSON.stringify(body) } as Parameters<typeof handler>[0],
        {} as Parameters<typeof handler>[1],
    ) as Promise<{ statusCode: number; body: string }>;
}

/** The row the store would hold after a save; mirrors saveConnection's input. */
let saved: ConnectionRow | null = null;
const rowFrom = (input: SaveConnectionInput): ConnectionRow => ({
    id: 'conn-1',
    company_id: input.companyId,
    api_key_encrypted: input.apiKeyEncrypted,
    api_key_hint: input.apiKeyHint,
    mode: input.mode,
    status: 'active',
    metrc_username: input.identity.username,
    metrc_hostname: input.identity.hostname,
    has_t3plus: input.identity.hasT3plus,
    t3plus_tier: input.identity.tier,
    api_access_level: input.identity.apiAccessLevel,
    licenses: input.identity.licenses,
    sync_licenses: null,
    last_verified_at: new Date().toISOString(),
    last_synced_at: null,
    last_error: null,
    last_error_at: null,
    created_by: input.createdBy,
    created_by_name: 'Brian',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
});

beforeEach(() => {
    process.env.METRC_CONNECTION_KEY = 'unit-test-connection-key-0123456789';
    delete process.env.T3_API_KEY;
    delete process.env.MANIFEST_COMPANY_IDS;
    delete process.env.T3_REGISTRATION_SECRET;
    saved = null;
    resolveContext.mockReset().mockImplementation(async (h?: string) => (h === 'Bearer good' ? director : h === 'Bearer tech' ? technician : null));
    for (const fn of Object.values(store)) fn.mockReset();
    store.findConnection.mockImplementation(async () => saved);
    store.saveConnection.mockImplementation(async (input: SaveConnectionInput) => { saved = rowFrom(input); return saved; });
    store.deleteConnection.mockImplementation(async () => { const had = saved !== null; saved = null; return had; });
    store.patchConnection.mockImplementation(async (_c: string, patch: Record<string, unknown>) => {
        if (!saved) return;
        if (patch.mode !== undefined) saved = { ...saved, mode: patch.mode as ConnectionRow['mode'] };
        if (patch.status !== undefined) saved = { ...saved, status: patch.status as ConnectionRow['status'] };
        if (patch.syncLicenses !== undefined) saved = { ...saved, sync_licenses: patch.syncLicenses as string[] | null };
    });
    store.activeConnectionCompanyIds.mockResolvedValue([]);
    for (const fn of Object.values(t3)) fn.mockReset();
    t3.whoami.mockResolvedValue({ username: 'ops@proper.com', hostname: 'mo.metrc.com', hasT3plus: true, t3plusSubscriptionTier: 'Team', t3plusApiAccessLevel: 'full' });
    t3.licenses.mockResolvedValue([{ licenseNumber: 'CUL000030', licenseName: 'Proper Cultivation' }, { licenseNumber: 'MAN000012', licenseName: 'Proper Manufacturing' }]);
    t3.permissions.mockResolvedValue(['packages/active:new_transfer']);
    t3.checkLogin.mockResolvedValue(undefined);
    t3.register.mockResolvedValue({ secretKey: KEY, registered: true });
    t3.mint.mockResolvedValue({ secretKey: KEY, registered: false });
});

describe('GET', () => {
    it('requires a sign-in', async () => {
        expect((await call('GET', undefined, { authorization: 'Bearer nope' })).statusCode).toBe(401);
    });

    it('tells a technician there is nothing connected and that they cannot manage it', async () => {
        const res = await call('GET', undefined, { authorization: 'Bearer tech' });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toMatchObject({ connected: false, source: null, selfServeAvailable: true, metrcLoginAvailable: false, canManage: false });
    });

    it('offers the Metrc-login path only when the server holds a T3 registration secret', async () => {
        process.env.T3_REGISTRATION_SECRET = 'org-reg-secret';
        expect(JSON.parse((await call('GET')).body).metrcLoginAvailable).toBe(true);
        delete process.env.METRC_CONNECTION_KEY;
        expect(JSON.parse((await call('GET')).body).metrcLoginAvailable).toBe(false);
    });
});

describe('POST (connect with a Metrc login)', () => {
    const login = { username: 'cwade', password: 'hunter2!', hostname: 'mo.metrc.com' };

    it('checks the login, registers it under our T3 organisation, verifies and stores the minted key, and never echoes the password', async () => {
        process.env.T3_REGISTRATION_SECRET = 'org-reg-secret';
        const res = await call('POST', { metrcLogin: login, mode: 'live' });
        expect(res.statusCode).toBe(201);
        expect(t3.checkLogin).toHaveBeenCalledWith(login);
        expect(t3.register).toHaveBeenCalledWith(login, 'org-reg-secret');
        expect(t3.mint).not.toHaveBeenCalled();
        const body = JSON.parse(res.body);
        expect(body).toMatchObject({ connected: true, source: 'connection', warnings: [] });
        expect(body.connection).toMatchObject({ keyHint: KEY.slice(-4), mode: 'live', username: 'ops@proper.com' });
        expect(res.body).not.toContain('hunter2');
        expect(res.body).not.toContain(KEY);
        const input = store.saveConnection.mock.calls[0][0] as SaveConnectionInput;
        expect(decryptSecret(input.apiKeyEncrypted)).toBe(KEY);
    });

    it('falls back to a plain key when the login is already in the organisation, and says so', async () => {
        process.env.T3_REGISTRATION_SECRET = 'org-reg-secret';
        t3.register.mockRejectedValue(new T3Error('Already registered', 409, 'ALREADY_REGISTERED'));
        const res = await call('POST', { metrcLogin: login });
        expect(res.statusCode).toBe(201);
        expect(t3.mint).toHaveBeenCalledWith(login);
        expect(JSON.parse(res.body).warnings.join(' ')).toMatch(/already knew this Metrc login/);
    });

    it('mints a plain key without a registration secret, with no organisation warning', async () => {
        const res = await call('POST', { metrcLogin: login });
        expect(res.statusCode).toBe(201);
        expect(t3.register).not.toHaveBeenCalled();
        expect(t3.mint).toHaveBeenCalledWith(login);
        expect(JSON.parse(res.body).warnings).toEqual([]);
    });

    it('reports a wrong Metrc password as exactly that, before registering, and stores nothing', async () => {
        process.env.T3_REGISTRATION_SECRET = 'org-reg-secret';
        t3.checkLogin.mockRejectedValue(new T3Error('Metrc did not accept that username and password for mo.metrc.com.', 401, 'METRC_LOGIN_REJECTED'));
        const res = await call('POST', { metrcLogin: { ...login, password: 'wrong' } });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'METRC_LOGIN_REJECTED', error: expect.stringContaining('username and password') });
        expect(t3.register).not.toHaveBeenCalled();
        expect(store.saveConnection).not.toHaveBeenCalled();
        expect(res.body).not.toContain('wrong');
    });

    it('blames the registration secret, not the person, when the login passed but T3 refused the registration', async () => {
        process.env.T3_REGISTRATION_SECRET = 'stale';
        t3.register.mockRejectedValue(new T3Error('rejected', 401, 'REGISTER_REJECTED'));
        const res = await call('POST', { metrcLogin: login });
        expect(res.statusCode).toBe(503);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'REGISTRATION_SECRET', error: expect.stringContaining('T3_REGISTRATION_SECRET') });
        expect(t3.mint).not.toHaveBeenCalled();
    });

    it('explains a full T3+ organisation and offers the key path', async () => {
        process.env.T3_REGISTRATION_SECRET = 'org-reg-secret';
        t3.register.mockRejectedValue(new T3Error('no seats', 402, 'T3_SEATS'));
        const res = await call('POST', { metrcLogin: login });
        expect(res.statusCode).toBe(503);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'T3_SEATS', error: expect.stringContaining('secret key instead') });
    });

    it('validates the login shape per state without calling T3', async () => {
        const cases: Array<[unknown, RegExp]> = [
            [{ username: '', password: 'x', hostname: 'mo.metrc.com' }, /username and password/],
            [{ username: 'a', password: 'x', hostname: 'metrc.example.com' }, /state host/],
            [{ username: 'a', password: 'x', hostname: 'co.metrc.com' }, /Colorado/],
            [{ username: 'a', password: 'x', hostname: 'mi.metrc.com' }, /Michigan/],
        ];
        for (const [metrcLogin, re] of cases) {
            const res = await call('POST', { metrcLogin });
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body)).toMatchObject({ code: 'LOGIN_FORMAT', error: expect.stringMatching(re) });
        }
        expect((await call('POST', { metrcLogin: login, apiKey: KEY })).statusCode).toBe(400);
        expect(t3.checkLogin).not.toHaveBeenCalled();
        expect(t3.mint).not.toHaveBeenCalled();
    });

    it('passes Colorado email and a Michigan seed through, skipping the pre-flight for Michigan', async () => {
        await call('POST', { metrcLogin: { ...login, hostname: 'CO.metrc.com', email: 'c@proper.com' } });
        expect(t3.mint).toHaveBeenLastCalledWith({ ...login, hostname: 'co.metrc.com', email: 'c@proper.com' });
        expect(t3.checkLogin).toHaveBeenCalledTimes(1);
        await call('POST', { metrcLogin: { ...login, hostname: 'mi.metrc.com', otpSeed: 'JBSW Y3DP EHPK 3PXP' } });
        expect(t3.mint).toHaveBeenLastCalledWith({ ...login, hostname: 'mi.metrc.com', otpSeed: 'JBSWY3DPEHPK3PXP' });
        expect(t3.checkLogin).toHaveBeenCalledTimes(1);
    });
});

describe('POST (connect)', () => {
    it('rejects non-managers before touching T3', async () => {
        const res = await call('POST', { apiKey: KEY }, { authorization: 'Bearer tech' });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).code).toBe('ROLE');
        expect(t3.whoami).not.toHaveBeenCalled();
    });

    it('refuses when the server has no encryption key', async () => {
        delete process.env.METRC_CONNECTION_KEY;
        const res = await call('POST', { apiKey: KEY });
        expect(res.statusCode).toBe(503);
        expect(JSON.parse(res.body).code).toBe('SELF_SERVE_DISABLED');
        expect(t3.whoami).not.toHaveBeenCalled();
    });

    it('rejects a malformed key with a plain message', async () => {
        for (const apiKey of ['', 'short', 'has a space in it 0123456789']) {
            const res = await call('POST', { apiKey });
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).code).toBe('KEY_FORMAT');
        }
        expect(t3.whoami).not.toHaveBeenCalled();
    });

    it('verifies with T3, stores the key encrypted, defaults to read-only, and returns status plus warnings', async () => {
        const res = await call('POST', { apiKey: KEY });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        expect(body).toMatchObject({ connected: true, source: 'connection', warnings: [] });
        expect(body.connection).toMatchObject({ keyHint: KEY.slice(-4), mode: 'read-only', username: 'ops@proper.com', hostname: 'mo.metrc.com', hasT3plus: true });
        expect(body.connection.licenses).toHaveLength(2);
        expect(res.body).not.toContain(KEY);

        const input = store.saveConnection.mock.calls[0][0] as SaveConnectionInput;
        expect(input.apiKeyEncrypted).not.toContain(KEY);
        expect(decryptSecret(input.apiKeyEncrypted)).toBe(KEY);
        expect(input.createdBy).toBe('u1');
    });

    it('honours an explicit live mode and rejects unknown modes', async () => {
        const ok = await call('POST', { apiKey: KEY, mode: 'live' });
        expect(JSON.parse(ok.body).connection.mode).toBe('live');
        const bad = await call('POST', { apiKey: KEY, mode: 'yolo' });
        expect(bad.statusCode).toBe(400);
        expect(JSON.parse(bad.body).code).toBe('MODE');
    });

    it('turns a T3 401 into a 400 the person can act on, and stores nothing', async () => {
        t3.whoami.mockRejectedValue(new T3Error('Unauthorized', 401));
        const res = await call('POST', { apiKey: KEY });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'KEY_REJECTED', error: expect.stringContaining('secret-key') });
        expect(store.saveConnection).not.toHaveBeenCalled();
    });

    it('reports a T3 outage as 502', async () => {
        t3.whoami.mockRejectedValue(new T3Error('Could not reach T3: fetch failed', 502, 'UNREACHABLE'));
        const res = await call('POST', { apiKey: KEY });
        expect(res.statusCode).toBe(502);
        expect(JSON.parse(res.body).code).toBe('T3_DOWN');
    });

    it('still connects but warns when the account lacks T3+ or sees no licences', async () => {
        t3.whoami.mockResolvedValue({ username: 'x', hostname: 'mo.metrc.com', hasT3plus: false });
        t3.licenses.mockResolvedValue([]);
        const res = await call('POST', { apiKey: KEY });
        expect(res.statusCode).toBe(201);
        const { warnings } = JSON.parse(res.body);
        expect(warnings.join(' ')).toMatch(/T3\+/);
        expect(warnings.join(' ')).toMatch(/no licences/);
    });
});

describe('PATCH', () => {
    it('404s when nothing is connected', async () => {
        const res = await call('PATCH', { mode: 'live' });
        expect(res.statusCode).toBe(404);
    });

    it('changes mode, pauses, narrows licences and validates each', async () => {
        await call('POST', { apiKey: KEY });
        let res = await call('PATCH', { mode: 'live', status: 'paused', syncLicenses: ['cul000030'] });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).connection).toMatchObject({ mode: 'live', status: 'paused', syncLicenses: ['CUL000030'] });

        res = await call('PATCH', { syncLicenses: null });
        expect(JSON.parse(res.body).connection.syncLicenses).toBeNull();

        expect((await call('PATCH', { mode: 'nope' })).statusCode).toBe(400);
        expect((await call('PATCH', { status: 'off' })).statusCode).toBe(400);
        expect((await call('PATCH', { syncLicenses: [''] })).statusCode).toBe(400);
    });

    it('re-verifies the stored key with T3 and records the outcome', async () => {
        await call('POST', { apiKey: KEY });
        t3.whoami.mockClear();
        const res = await call('PATCH', { verify: true });
        expect(res.statusCode).toBe(200);
        expect(t3.whoami).toHaveBeenCalledTimes(1);
        expect(store.recordVerification).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ username: 'ops@proper.com' }));

        t3.whoami.mockRejectedValue(new T3Error('Unauthorized', 401));
        const failed = await call('PATCH', { verify: true });
        expect(failed.statusCode).toBe(200);
        expect(JSON.parse(failed.body).warnings[0]).toMatch(/rejected that key/);
        expect(store.recordConnectionError).toHaveBeenCalledWith(COMPANY, expect.stringContaining('rejected'));
    });
});

describe('DELETE', () => {
    it('removes the connection for a manager and 404s when there is none', async () => {
        expect((await call('DELETE')).statusCode).toBe(404);
        await call('POST', { apiKey: KEY });
        const res = await call('DELETE');
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toMatchObject({ connected: false, connection: null });
        expect((await call('DELETE', undefined, { authorization: 'Bearer tech' })).statusCode).toBe(403);
    });
});

describe('encryption sanity', () => {
    it('a stored blob decrypts back to the key', () => {
        expect(decryptSecret(encryptSecret(KEY))).toBe(KEY);
    });
});
