/**
 * parse-invoice handler tests. Anthropic is mocked via global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/auth', () => ({ resolveContext: vi.fn().mockResolvedValue(null) }));

import { handler, normalizeParsed, extractJson } from '../parse-invoice';

const fetchMock = vi.fn();
const realFetch = globalThis.fetch;

function call(body: unknown, headers: Record<string, string> = { 'x-manifest-key': 'secret' }) {
    return handler(
        { httpMethod: 'POST', headers, body: JSON.stringify(body) } as Parameters<typeof handler>[0],
        {} as Parameters<typeof handler>[1],
    ) as Promise<{ statusCode: number; body: string }>;
}

function modelReply(text: string) {
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }] }), text: async () => '' };
}

beforeEach(() => {
    process.env.MANIFEST_ACCESS_CODE = 'secret';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe('normalizeParsed', () => {
    it('coerces strings to numbers and derives missing price fields', () => {
        const p = normalizeParsed({
            invoiceNumber: 4934,
            lines: [
                { description: 'A', quantity: '20', unitPrice: '$4.50' },
                { description: 'B', quantity: 10, lineTotal: 25 },
                { description: '', quantity: 1, lineTotal: 1 },
                { description: 'C' },
            ],
        });
        expect(p.invoiceNumber).toBeNull();
        expect(p.lines).toHaveLength(3);
        expect(p.lines[0]).toMatchObject({ quantity: 20, unitPrice: 4.5, lineTotal: 90 });
        expect(p.lines[1]).toMatchObject({ unitPrice: 2.5, lineTotal: 25 });
        expect(p.lines[2]).toMatchObject({ quantity: null, unitPrice: null, lineTotal: null });
    });
});

describe('extractJson', () => {
    it('handles fenced and prose-wrapped JSON', () => {
        expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
        expect(extractJson('Here you go: {"a":{"b":2}} thanks')).toEqual({ a: { b: 2 } });
        expect(() => extractJson('nothing here')).toThrow();
    });
});

describe('parse-invoice handler', () => {
    it('requires the access code', async () => {
        const res = await call({ text: 'x' }, {});
        expect(res.statusCode).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects unsupported media types and missing input', async () => {
        expect((await call({ data: 'abc', mediaType: 'application/zip' })).statusCode).toBe(400);
        expect((await call({})).statusCode).toBe(400);
    });

    it('sends a PDF as a document block and returns normalized lines', async () => {
        fetchMock.mockResolvedValue(modelReply('{"invoiceNumber":"4934","orderNumber":"Proper-4934","total":90,"lines":[{"description":"HFCS","quantity":20,"unitPrice":4.5}]}'));
        const res = await call({ fileName: 'inv.pdf', mediaType: 'application/pdf', data: 'QUJD' });
        expect(res.statusCode).toBe(200);
        const out = JSON.parse(res.body);
        expect(out.invoiceNumber).toBe('4934');
        expect(out.lines[0]).toMatchObject({ description: 'HFCS', lineTotal: 90 });

        const req = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(req.messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf', data: 'QUJD' } });
    });

    it('sends images as image blocks and text as text', async () => {
        fetchMock.mockResolvedValue(modelReply('{"lines":[]}'));
        await call({ mediaType: 'image/jpeg', data: 'QUJD' });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content[0].type).toBe('image');
        await call({ text: 'Item,Qty,Total\nA,1,2' });
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages[0].content[0].type).toBe('text');
    });

    it('maps upstream failures to 502', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 529, text: async () => 'overloaded' });
        expect((await call({ text: 'x' })).statusCode).toBe(502);
        fetchMock.mockResolvedValue(modelReply('sorry, no'));
        expect((await call({ text: 'x' })).statusCode).toBe(502);
    });
});
