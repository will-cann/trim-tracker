/**
 * send-manifest-email handler tests.
 *
 * SendGrid is stubbed (SENDGRID_API_KEY=stub). Asserts the endpoint:
 *   - is disabled when neither MANIFEST_ACCESS_CODE nor DEV_BYPASS_AUTH is set
 *   - accepts the shared access code in x-manifest-key
 *   - accepts a resolvable Bearer token
 *   - validates recipient, file count, filenames, and size
 *   - passes attachments through to the mailer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveContext = vi.fn();
vi.mock('../utils/auth', () => ({ resolveContext: (...a: unknown[]) => resolveContext(...a) }));

const sendManifestEmail = vi.fn();
vi.mock('../utils/email', () => ({ sendManifestEmail: (...a: unknown[]) => sendManifestEmail(...a) }));

process.env.SENDGRID_API_KEY = 'stub';

import { handler } from '../send-manifest-email';

const goodFile = { filename: 'Proper-4934_CUL000030_transfer.t3csv', content: 'a,b,c\n1,2,3\n' };

function call(body: unknown, headers: Record<string, string> = {}) {
    return handler(
        { httpMethod: 'POST', headers, body: JSON.stringify(body) } as Parameters<typeof handler>[0],
        {} as Parameters<typeof handler>[1],
    ) as Promise<{ statusCode: number; body: string }>;
}

beforeEach(() => {
    resolveContext.mockReset();
    resolveContext.mockResolvedValue(null);
    sendManifestEmail.mockReset();
    sendManifestEmail.mockResolvedValue({ success: true, fromAddress: 'invites@neurocann.app' });
    delete process.env.MANIFEST_ACCESS_CODE;
    delete process.env.DEV_BYPASS_AUTH;
});

describe('send-manifest-email auth', () => {
    it('is disabled when no access code is configured', async () => {
        const res = await call({ to: 'a@b.co', files: [goodFile] }, { 'x-manifest-key': 'whatever' });
        expect(res.statusCode).toBe(403);
        expect(sendManifestEmail).not.toHaveBeenCalled();
    });

    it('rejects a wrong access code', async () => {
        process.env.MANIFEST_ACCESS_CODE = 'secret';
        const res = await call({ to: 'a@b.co', files: [goodFile] }, { 'x-manifest-key': 'nope' });
        expect(res.statusCode).toBe(401);
    });

    it('accepts the right access code', async () => {
        process.env.MANIFEST_ACCESS_CODE = 'secret';
        const res = await call({ to: 'a@b.co', files: [goodFile] }, { 'x-manifest-key': 'secret' });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toMatchObject({ sent: true, to: 'a@b.co', files: [goodFile.filename] });
    });

    it('accepts a valid bearer token without an access code', async () => {
        resolveContext.mockResolvedValue({ userId: 'u', companyId: 'c', role: 'admin', departments: [] });
        const res = await call({ to: 'a@b.co', files: [goodFile] }, { authorization: 'Bearer t' });
        expect(res.statusCode).toBe(200);
    });

    it('allows dev bypass', async () => {
        process.env.DEV_BYPASS_AUTH = 'true';
        const res = await call({ to: 'a@b.co', files: [goodFile] });
        expect(res.statusCode).toBe(200);
    });
});

describe('send-manifest-email validation', () => {
    beforeEach(() => {
        process.env.MANIFEST_ACCESS_CODE = 'secret';
    });
    const auth = { 'x-manifest-key': 'secret' };

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
