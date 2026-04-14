/**
 * send-supplier-email handler tests.
 *
 * Stubs SendGrid via SENDGRID_API_KEY=stub so no network call is made,
 * and mocks the SQL tag so we can assert the handler:
 *   - creates a new contact_threads row when no threadId is provided
 *   - inserts an outbound contact_messages row
 *   - bumps vendor.last_contacted_at on success
 *   - reuses an existing threadId when provided
 *   - rejects unknown vendors and mismatched threads
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────
// Mocks — must be declared BEFORE handler import
// ──────────────────────────────────────────────────────────────────────────

type QueryHandler = (key: string, values: unknown[]) => Record<string, unknown>[] | undefined;
let sqlHandlers: QueryHandler[] = [];
const sqlCalls: Array<{ key: string; values: unknown[] }> = [];

function sqlTag(strings: TemplateStringsArray, ...values: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    const key = strings.join('?').replace(/\s+/g, ' ').trim();
    sqlCalls.push({ key, values });
    for (const h of sqlHandlers) {
        const rows = h(key, values);
        if (rows) return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
}

vi.mock('../utils/db', () => ({
    sql: sqlTag,
    pool: { connect: vi.fn(), query: vi.fn() },
}));

vi.mock('../utils/auth', () => ({
    resolveContext: vi.fn().mockResolvedValue({
        userId: 'user-1',
        companyId: 'company-1',
        role: 'admin',
        departments: [],
    }),
}));

// Force stub mode for the SendGrid wrapper.
process.env.SENDGRID_API_KEY = 'stub';

import { handler } from '../send-supplier-email';

function makeEvent(body: unknown): Parameters<typeof handler>[0] {
    return {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer test-token' },
        body: JSON.stringify(body),
    } as Parameters<typeof handler>[0];
}

beforeEach(() => {
    sqlHandlers = [];
    sqlCalls.length = 0;
});

describe('send-supplier-email', () => {
    it('creates a new thread + outbound message when threadId is not provided', async () => {
        // Vendor lookup
        sqlHandlers.push((k) =>
            k.includes('FROM vendors') && k.includes('WHERE id =')
                ? [{ id: 'vendor-1', name: 'Holland Biomass Co', contact_email: 'sales@hollandbio.test' }]
                : undefined,
        );
        // Thread insert
        sqlHandlers.push((k) =>
            k.includes('INSERT INTO contact_threads')
                ? [{ id: 'thread-new-1' }]
                : undefined,
        );
        // Message insert
        sqlHandlers.push((k) =>
            k.includes('INSERT INTO contact_messages')
                ? [{ id: 'msg-new-1' }]
                : undefined,
        );
        // UPDATE queries return empty rows — fine.

        const res = await handler(
            makeEvent({
                vendorId: 'vendor-1',
                subject: 'Menu request',
                bodyText: 'Hi,\n\nDo you have Blue Dream fresh frozen available?\n\nThanks.',
            }),
            {} as never,
            () => undefined,
        );

        expect((res as { statusCode: number }).statusCode).toBe(200);
        const body = JSON.parse((res as { body: string }).body);
        expect(body.threadId).toBe('thread-new-1');
        expect(body.messageId).toBe('msg-new-1');
        expect(body.fromAddress).toBe('outreach@neurocann.app');
        expect(body.replyToAddress).toBe('thread-thread-new-1@replies.neurocann.app');
        expect(body.messageIdHeader).toMatch(/^<msg-[0-9a-f-]+@neurocann\.app>$/);

        // Verify each expected SQL call fired.
        const keys = sqlCalls.map(c => c.key);
        expect(keys.some(k => k.includes('INSERT INTO contact_threads'))).toBe(true);
        expect(keys.some(k => k.includes('INSERT INTO contact_messages'))).toBe(true);
        expect(keys.some(k => k.includes('UPDATE contact_threads'))).toBe(true);
        expect(keys.some(k => k.includes('UPDATE vendors'))).toBe(true);
    });

    it('reuses an existing thread when threadId is provided', async () => {
        sqlHandlers.push((k) =>
            k.includes('FROM vendors') && k.includes('WHERE id =')
                ? [{ id: 'vendor-1', name: 'V', contact_email: 'v@v.test' }]
                : undefined,
        );
        sqlHandlers.push((k) =>
            k.includes('FROM contact_threads') && k.includes('WHERE id =')
                ? [{ id: 'thread-existing-1' }]
                : undefined,
        );
        sqlHandlers.push((k) =>
            k.includes('INSERT INTO contact_messages') ? [{ id: 'msg-2' }] : undefined,
        );

        const res = await handler(
            makeEvent({
                vendorId: 'vendor-1',
                threadId: 'thread-existing-1',
                subject: 'Re: your menu',
                bodyText: 'Thanks, can you confirm pricing?',
            }),
            {} as never,
            () => undefined,
        );

        expect((res as { statusCode: number }).statusCode).toBe(200);
        const body = JSON.parse((res as { body: string }).body);
        expect(body.threadId).toBe('thread-existing-1');
        // No new thread insert should have happened.
        expect(sqlCalls.some(c => c.key.includes('INSERT INTO contact_threads'))).toBe(false);
    });

    it('returns 400 when the vendor is not found in the caller’s company', async () => {
        sqlHandlers.push((k) => (k.includes('FROM vendors') ? [] : undefined));

        const res = await handler(
            makeEvent({ vendorId: 'nope', subject: 'x', bodyText: 'y' }),
            {} as never,
            () => undefined,
        );
        expect((res as { statusCode: number }).statusCode).toBe(400);
    });

    it('returns 400 when threadId does not belong to the company', async () => {
        sqlHandlers.push((k) =>
            k.includes('FROM vendors')
                ? [{ id: 'vendor-1', name: 'V', contact_email: 'v@v.test' }]
                : undefined,
        );
        sqlHandlers.push((k) => (k.includes('FROM contact_threads') ? [] : undefined));

        const res = await handler(
            makeEvent({
                vendorId: 'vendor-1',
                threadId: 'someone-elses-thread',
                subject: 'x',
                bodyText: 'y',
            }),
            {} as never,
            () => undefined,
        );
        expect((res as { statusCode: number }).statusCode).toBe(400);
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await handler(makeEvent({ vendorId: 'vendor-1' }), {} as never, () => undefined);
        expect((res as { statusCode: number }).statusCode).toBe(400);
    });
});
