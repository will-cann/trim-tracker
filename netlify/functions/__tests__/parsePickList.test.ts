/**
 * parse-pick-list handler tests. Anthropic is mocked via global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/metrcConnectionStore', () => ({
    findConnection: async () => null,
    activeConnectionCompanyIds: async () => [],
}));

vi.mock('../utils/auth', async () => {
    const actual = await vi.importActual<typeof import('../utils/auth')>('../utils/auth');
    return {
        ...actual,
        resolveContext: vi.fn(async (header?: string) =>
            header === 'Bearer good' ? { userId: 'u', companyId: 'c1', role: 'technician', departments: [] } : null),
    };
});

import { handler, normalizePickListDoc } from '../parse-pick-list';

const fetchMock = vi.fn();
const realFetch = globalThis.fetch;

function call(body: unknown, headers: Record<string, string> = { authorization: 'Bearer good' }) {
    return handler(
        { httpMethod: 'POST', headers, body: JSON.stringify(body) } as Parameters<typeof handler>[0],
        {} as Parameters<typeof handler>[1],
    ) as Promise<{ statusCode: number; body: string }>;
}

function modelReply(text: string) {
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }] }), text: async () => '' };
}

const LOT = '1A40C0300000B56000108430';
const CASE1 = '1A40C0300000B56000146121';

beforeEach(() => {
    process.env.MANIFEST_COMPANY_IDS = 'c1';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe('normalizePickListDoc', () => {
    it('derives quantities and prices and keeps only full lot tags in lotTag', () => {
        const doc = normalizePickListDoc({
            orderNumber: 'Proper-4934',
            buyerLicense: 'dis000045',
            lines: [
                { productName: 'Proper - Pre-Roll - 1g - Legend OG', lotTag: `Lot ${LOT}`, metrcTags: [`${CASE1}-${CASE1.slice(0, -1)}3`], packages: '2', unitsPerPackage: 50, unitPrice: '$4.50', potency: 'THC 24.1%' },
                { productName: 'Daily Driver - Eighths - 3.5g - Dolato', lotLabel: '…108431', totalUnits: 20, lineTotal: 500 },
                { productName: '', packages: 1 },
                { productName: 'No numbers', packages: 0 },
            ],
        });
        expect(doc.buyerLicense).toBe('DIS000045');
        expect(doc.lines).toHaveLength(3);
        expect(doc.lines[0]).toMatchObject({ lotTag: LOT, lotLabel: null, packages: 2, totalUnits: 100, unitsPerPackage: 50, unitPrice: 4.5, lineTotal: 450, potency: 'THC 24.1%' });
        expect(doc.lines[0].metrcTags).toEqual([`${CASE1}-${CASE1.slice(0, -1)}3`]);
        expect(doc.lines[1]).toMatchObject({ lotTag: null, lotLabel: '…108431', totalUnits: 20, unitPrice: 25, lineTotal: 500 });
        expect(doc.lines[2]).toMatchObject({ packages: null, totalUnits: null, unitsPerPackage: null });
    });

    it('drops the lot tag if the model repeated it among the case tags', () => {
        const doc = normalizePickListDoc({ lines: [{ productName: 'A', lotTag: LOT, metrcTags: [LOT, CASE1, CASE1] }] });
        expect(doc.lines[0].metrcTags).toEqual([CASE1]);
    });
});

describe('parse-pick-list handler', () => {
    it('requires a signed-in user', async () => {
        const res = await call({ data: 'QUJD', mediaType: 'application/pdf' }, {});
        expect(res.statusCode).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects unsupported media types and missing input', async () => {
        expect((await call({ data: 'abc', mediaType: 'application/zip' })).statusCode).toBe(400);
        expect((await call({})).statusCode).toBe(400);
    });

    it('sends a PDF as a document block and returns normalized lines', async () => {
        fetchMock.mockResolvedValue(modelReply(`\`\`\`json\n{"orderNumber":"Proper-4934","buyer":"Terrabis","lines":[{"productName":"HFCS","lotTag":"${LOT}","packages":1,"totalUnits":50,"unitPrice":4.5}]}\n\`\`\``));
        const res = await call({ fileName: 'pick.pdf', mediaType: 'application/pdf', data: 'QUJD' });
        expect(res.statusCode).toBe(200);
        const out = JSON.parse(res.body);
        expect(out.orderNumber).toBe('Proper-4934');
        expect(out.lines[0]).toMatchObject({ productName: 'HFCS', lotTag: LOT, unitsPerPackage: 50, lineTotal: 225 });

        const req = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(req.messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf', data: 'QUJD' } });
        expect(req.system).toContain('pick lists');
    });

    it('maps upstream failures to 502', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 529, text: async () => 'overloaded' });
        expect((await call({ mediaType: 'image/png', data: 'QUJD' })).statusCode).toBe(502);
        fetchMock.mockResolvedValue(modelReply('sorry, no'));
        expect((await call({ mediaType: 'image/png', data: 'QUJD' })).statusCode).toBe(502);
    });
});
