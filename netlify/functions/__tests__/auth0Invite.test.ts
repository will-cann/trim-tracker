import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

type Call = { url: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let existing: string[] = [];
let createStatus = 201;

function reply(status: number, body: unknown) {
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

let sendInvitation: typeof import('../utils/auth0mgmt').sendInvitation;

beforeAll(async () => {
    process.env.AUTH0_DOMAIN = 'login.neurocann.app';
    process.env.AUTH0_TENANT_DOMAIN = 'tenant.us.auth0.com';
    process.env.AUTH0_MGMT_CLIENT_ID = 'mgmt';
    process.env.AUTH0_MGMT_CLIENT_SECRET = 'secret';
    process.env.AUTH0_CLIENT_ID = 'spa';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, body });
        if (url.endsWith('/oauth/token')) return reply(200, { access_token: 't', expires_in: 3600 });
        if (url.includes('/users-by-email')) {
            const email = new URL(url).searchParams.get('email')!;
            return reply(200, existing.includes(email) ? [{ user_id: `auth0|${email}` }] : []);
        }
        if (url.endsWith('/api/v2/users')) {
            if (createStatus === 409) existing.push(body!.email as string);
            return createStatus === 201 ? reply(201, { user_id: `auth0|${body!.email}` }) : reply(createStatus, { message: 'The user already exists.' });
        }
        if (url.endsWith('/tickets/password-change')) {
            return reply(201, { ticket: 'https://tenant.us.auth0.com/u/reset-verify?ticket=abc#' });
        }
        return reply(404, {});
    }));
    ({ sendInvitation } = await import('../utils/auth0mgmt'));
});

beforeEach(() => {
    calls = [];
    existing = [];
    createStatus = 201;
});

const ticketBody = () => calls.find(c => c.url.endsWith('/tickets/password-change'))!.body!;

describe('sendInvitation', () => {
    it('looks up and creates the login with the email lowercased', async () => {
        const r = await sendInvitation(' NFedoronko@ProperBrands.com ', 'Nick Fedoronko');
        expect(r.success).toBe(true);
        expect(calls.find(c => c.url.includes('users-by-email'))!.url).toContain('email=nfedoronko%40properbrands.com');
        expect(calls.find(c => c.url.endsWith('/api/v2/users'))!.body!.email).toBe('nfedoronko@properbrands.com');
    });

    it('invites an existing login regardless of the case it was typed in', async () => {
        existing = ['nfedoronko@properbrands.com'];
        const r = await sendInvitation('NFedoronko@properbrands.com');
        expect(r).toEqual({ success: true, inviteUrl: 'https://login.neurocann.app/u/reset-verify?ticket=abc#' });
        expect(calls.some(c => c.url.endsWith('/api/v2/users'))).toBe(false);
    });

    it('falls back to the existing login when create says it already exists', async () => {
        createStatus = 409;
        const r = await sendInvitation('jmodrusic@properbrands.com');
        expect(r.success).toBe(true);
        expect(r.inviteUrl).toContain('login.neurocann.app');
        expect(ticketBody().user_id).toBe('auth0|jmodrusic@properbrands.com');
    });

    it('sends them to the app after the password is set when given a result URL', async () => {
        await sendInvitation('blarsen@properbrands.com', 'Brian Larsen', 'https://proper.neurocann.app');
        expect(ticketBody()).toMatchObject({ result_url: 'https://proper.neurocann.app', mark_email_as_verified: true });
        expect(ticketBody()).not.toHaveProperty('client_id');
    });

    it('uses the application id when there is no result URL', async () => {
        await sendInvitation('blarsen@properbrands.com');
        expect(ticketBody()).toMatchObject({ client_id: 'spa' });
        expect(ticketBody()).not.toHaveProperty('result_url');
    });

    it('reports a failed create', async () => {
        createStatus = 400;
        expect(await sendInvitation('x@y.co')).toEqual({ success: false, error: 'Failed to create user account' });
    });
});
