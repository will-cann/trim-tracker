/**
 * The unauthenticated T3 auth calls that turn a Metrc login into a secret key
 * (POST /v2/auth/credentials, /register, /secretkey), with fetch stubbed.
 * Asserts request shapes, that the OTP seed is kept out of the pre-flight, and
 * that T3's status codes become the T3Error codes metrcConnections.ts branches on.
 *
 * Run with:
 *     npx vitest run netlify/functions/__tests__/t3MintKey.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t3CheckMetrcLogin, t3MintSecretKey, t3RegisterMetrcLogin, T3Error } from '../utils/t3';

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const sent = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return { url, method: init.method, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};

const login = { username: 'cwade', password: 'pw', hostname: 'mo.metrc.com', otpSeed: 'SEED' };

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('t3CheckMetrcLogin', () => {
    it('posts the login without a key or the OTP seed and accepts a token', async () => {
        reply(200, { accessToken: 'jwt' });
        await t3CheckMetrcLogin(login);
        const r = sent();
        expect(r.url).toBe('https://api.trackandtrace.tools/v2/auth/credentials');
        expect(r.method).toBe('POST');
        expect(r.headers['X-T3-API-Key']).toBeUndefined();
        expect(r.headers.Authorization).toBeUndefined();
        expect(r.body).toEqual({ username: 'cwade', password: 'pw', hostname: 'mo.metrc.com' });
    });

    it('turns a 401 into METRC_LOGIN_REJECTED naming the host', async () => {
        reply(401, { code: 'UNAUTHORIZED' });
        await expect(t3CheckMetrcLogin(login)).rejects.toMatchObject({ code: 'METRC_LOGIN_REJECTED', message: expect.stringContaining('mo.metrc.com') });
    });
});

describe('t3RegisterMetrcLogin', () => {
    it('sends the registration secret with the login and returns the minted key', async () => {
        reply(200, { registered: true, secretKey: 'ttt_new' });
        const r = await t3RegisterMetrcLogin(login, 'org-secret');
        expect(r).toEqual({ secretKey: 'ttt_new', registered: true });
        expect(sent().url).toBe('https://api.trackandtrace.tools/v2/auth/register');
        expect(sent().body).toEqual({ ...login, registrationSecret: 'org-secret' });
    });

    it.each([
        [409, 'ALREADY_REGISTERED'],
        [402, 'T3_SEATS'],
        [401, 'REGISTER_REJECTED'],
    ])('maps %s to %s', async (status, code) => {
        reply(status, { detail: 'x' });
        await expect(t3RegisterMetrcLogin(login, 's')).rejects.toMatchObject({ status, code });
    });

    it('treats a 200 with no key as a T3 fault', async () => {
        reply(200, { registered: true });
        await expect(t3RegisterMetrcLogin(login, 's')).rejects.toBeInstanceOf(T3Error);
    });
});

describe('t3MintSecretKey', () => {
    it('mints a plain key and reports it as not registered', async () => {
        reply(200, { secretKey: 'ttt_plain' });
        expect(await t3MintSecretKey(login)).toEqual({ secretKey: 'ttt_plain', registered: false });
        expect(sent().url).toBe('https://api.trackandtrace.tools/v2/auth/secretkey');
        expect(sent().body.otpSeed).toBe('SEED');
    });

    it('reports a rejected login and an unreachable T3 distinctly', async () => {
        reply(401, {});
        await expect(t3MintSecretKey(login)).rejects.toMatchObject({ code: 'METRC_LOGIN_REJECTED' });
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
        await expect(t3MintSecretKey(login)).rejects.toMatchObject({ code: 'UNREACHABLE' });
    });
});
