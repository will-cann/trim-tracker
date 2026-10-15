/**
 * send-manifest-email handler tests.
 *
 * SendGrid is stubbed (SENDGRID_API_KEY=stub). Asserts the endpoint:
 *   - requires a resolvable Bearer token from an allowlisted company
 *   - is disabled when MANIFEST_COMPANY_IDS is unset (unless DEV_BYPASS_AUTH)
 *   - validates recipient, file count, filenames, and size
 *   - passes attachments through to the mailer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveContext = vi.fn();
vi.mock('../utils/auth', async () => {
    const actual = await vi.importActual<typeof import('../utils/auth')>('../utils/auth');
    return { ...actual, resolveContext: (...a: unknown[]) => resolveContext(...a) };
});

const sendManifestEmail = vi.fn();
vi.mock('../utils/email', () => ({ sendManifestEmail: (...a: unknown[]) => sendManifestEmail(...a) }));

process.env.SENDGRID_API_KEY = 'stub';

import { handler } from '../send-manifest-email';

const goodFile = { filename: 'Proper-4934_CUL000030_transfer.t3csv', content: 'a,b,c\n1,2,3\n' };
const COMPANY = 'c0ffee00-0000-0000-0000-000000000001';
const user = { userId: 'u', companyId: COMPANY, role: 'technician', departments: [] };
const auth = { authorization: 'Bearer good' };

function call(body: unknown, headers: Record<string, string> = {}) {
    return handler(
        { httpMethod: 'POST', headers, body: JSON.stringify(body) } as Parameters<typeof handler>[0],
        {} as Parameters<typeof handler>[1],
    ) as Promise<{ statusCode: number; body: string }>;
}

beforeEach(() => {
    resolveContext.mockReset();
    resolveContext.mockImplementation(async (header?: string) => (header === 'Bearer good' ? user : null));
    sendManifestEmail.mockReset();
    sendManifestEmail.mockResolvedValue({ success: true, fromAddress: 'invites@neurocann.app' });
    process.env.MANIFEST_COMPANY_IDS = COMPANY;
    delete process.env.DEV_BYPASS_AUTH;
});

describe('send-manifest-email auth', () => {
    it('rejects an anonymous or forged request', async () => {
        expect((await call({ to: 'a@b.co', files: [goodFile] })).statusCode).toBe(401);
        expect((await call({ to: 'a@b.co', files: [goodFile] }, { authorization: 'Bearer nope' })).statusCode).toBe(401);
        expect(sendManifestEmail).not.toHaveBeenCalled();
    });

    it('is disabled when no company allowlist is configured', async () => {
        delete process.env.MANIFEST_COMPANY_IDS;
        const res = await call({ to: 'a@b.co', files: [goodFile] }, auth);
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).error).toMatch(/MANIFEST_COMPANY_IDS/);
    });

    it('rejects a signed-in user from a company that is not allowlisted', async () => {
        process.env.MANIFEST_COMPANY_IDS = 'other-company, another-one';
        const res = await call({ to: 'a@b.co', files: [goodFile] }, auth);
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).error).toContain(COMPANY);
    });

    it('accepts a signed-in user from an allowlisted company (case-insensitive, any role)', async () => {
        process.env.MANIFEST_COMPANY_IDS = ` other, ${COMPANY.toUpperCase()} `;
        const res = await call({ to: 'a@b.co', files: [goodFile] }, auth);
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toMatchObject({ sent: true, to: 'a@b.co', files: [goodFile.filename] });
    });

    it('allows dev bypass without an allowlist', async () => {
        process.env.DEV_BYPASS_AUTH = 'true';
        delete process.env.MANIFEST_COMPANY_IDS;
        resolveContext.mockResolvedValue(user);
        const res = await call({ to: 'a@b.co', files: [goodFile] });
        expect(res.statusCode).toBe(200);
    });
});

describe('send-manifest-email validation', () => {

    it('rejects a bad recipient', async () => {
        const res = await call({ to: 'not-an-email', files: [goodFile] }, auth);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/valid email/);
    });

    it('rejects an empty file list', async () => {
        const res = await call({ to: 'a@b.co', files: [] }, auth);
        expect(res.statusCode).toBe(400);
    });

    it('rejects unsafe filenames', async () => {
        const res = await call({ to: 'a@b.co', files: [{ filename: '../evil.exe', content: 'x' }] }, auth);
        expect(res.statusCode).toBe(400);
    });

    it('rejects oversized files', async () => {
        const res = await call({ to: 'a@b.co', files: [{ ...goodFile, content: 'x'.repeat(300 * 1024) }] }, auth);
        expect(res.statusCode).toBe(400);
    });

    it('passes subject, note, and attachments to the mailer', async () => {
        const res = await call(
            { to: 'a@b.co', subject: 'Proper-4934 transfer files', note: 'Hi Nick', files: [goodFile, { ...goodFile, filename: 'Proper-4934_MAN000043_transfer.t3csv' }] },
            auth,
        );
        expect(res.statusCode).toBe(200);
        expect(sendManifestEmail).toHaveBeenCalledTimes(1);
        const args = sendManifestEmail.mock.calls[0][0] as { subject: string; bodyText: string; attachments: unknown[] };
        expect(args.subject).toBe('Proper-4934 transfer files');
        expect(args.bodyText).toMatch(/^Hi Nick/);
        expect(args.bodyText).toContain('Proper-4934_MAN000043_transfer.t3csv');
        expect(args.attachments).toHaveLength(2);
    });

    it('surfaces mailer failure as 502', async () => {
        sendManifestEmail.mockResolvedValue({ success: false, error: 'boom', fromAddress: 'x@y.z' });
        const res = await call({ to: 'a@b.co', files: [goodFile] }, auth);
        expect(res.statusCode).toBe(502);
    });
});
